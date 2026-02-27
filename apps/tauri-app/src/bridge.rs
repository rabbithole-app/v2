//! Bridge module: reads auth data from keyring and converts to JS-compatible format.
//!
//! NativeAuthClient (with KeyringStorage) stores data as separate keyring entries:
//!   - "ic-identity": 32-byte raw Ed25519 seed
//!   - "ic-delegation": JSON string with delegation chain (Rust serde format)
//!
//! Angular's @icp-sdk expects JS format (camelCase, hex-encoded strings).
//! This module handles the conversion.

use ic_agent::identity::{Delegation, SignedDelegation};
use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE_NAME: &str = "com.rabbithole.app";

/// Keyring key prefix used by ic-auth-client's KeyringStorage
const KEYRING_PREFIX: &str = "ic-";
/// Storage key for the Ed25519 session identity
const KEY_IDENTITY: &str = "identity";
/// Storage key for the delegation chain JSON
const KEY_DELEGATION: &str = "delegation";

/// Ed25519 DER public key prefix (OID 1.3.101.112)
const ED25519_DER_PREFIX_HEX: &str = "302a300506032b6570032100";

// ---------------------------------------------------------------------------
// Rust-format delegation chain (as stored in keyring by NativeAuthClient)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct RustDelegationChain {
    delegations: Vec<SignedDelegation>,
    public_key: Vec<u8>,
}

// ---------------------------------------------------------------------------
// JS-compatible output format (what Angular @icp-sdk expects)
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsDelegationChain {
    pub delegations: Vec<JsSignedDelegation>,
    pub public_key: String,
}

#[derive(Clone, Serialize)]
pub struct JsSignedDelegation {
    pub delegation: JsDelegation,
    pub signature: String,
}

#[derive(Clone, Serialize)]
pub struct JsDelegation {
    pub pubkey: String,
    pub expiration: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub targets: Option<Vec<String>>,
}

/// Full auth data returned to Angular frontend.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthBridgeData {
    /// JS-compatible delegation chain JSON object.
    pub delegation_chain: JsDelegationChain,
    /// Ed25519 identity in JS format: `["<pubkey_der_hex>", "<secret_hex>"]`.
    pub identity: Vec<String>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Read auth data from OS keyring and convert to JS-compatible format.
pub fn read_auth_data_from_keyring() -> Result<AuthBridgeData, String> {
    let delegation_chain = read_delegation_chain()?;
    let identity = read_identity_key()?;

    Ok(AuthBridgeData {
        delegation_chain,
        identity,
    })
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Read a raw secret from the keyring.
fn read_keyring_entry(storage_key: &str) -> Result<Vec<u8>, String> {
    let key = format!("{}{}", KEYRING_PREFIX, storage_key);
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry '{}': {}", key, e))?;

    entry
        .get_secret()
        .map_err(|e| format!("Failed to read keyring '{}': {}", key, e))
}

fn read_delegation_chain() -> Result<JsDelegationChain, String> {
    let raw = read_keyring_entry(KEY_DELEGATION)?;

    // KeyringStorage stores delegation as a UTF-8 JSON string
    let json_str = String::from_utf8(raw)
        .map_err(|e| format!("Delegation is not valid UTF-8: {}", e))?;

    // Parse Rust-format delegation chain
    let rust_chain: RustDelegationChain = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse delegation chain JSON: {}", e))?;

    // Convert to JS-compatible format
    Ok(convert_to_js_chain(&rust_chain))
}

fn convert_to_js_chain(chain: &RustDelegationChain) -> JsDelegationChain {
    JsDelegationChain {
        public_key: hex::encode(&chain.public_key),
        delegations: chain
            .delegations
            .iter()
            .map(|sd| JsSignedDelegation {
                delegation: convert_delegation(&sd.delegation),
                signature: hex::encode(&sd.signature),
            })
            .collect(),
    }
}

fn convert_delegation(d: &Delegation) -> JsDelegation {
    JsDelegation {
        pubkey: hex::encode(&d.pubkey),
        expiration: format!("{:x}", d.expiration),
        targets: d
            .targets
            .as_ref()
            .map(|ts| ts.iter().map(|p| hex::encode(p.as_slice())).collect()),
    }
}

fn read_identity_key() -> Result<Vec<String>, String> {
    // KeyringStorage stores the Ed25519 seed as raw 32 bytes
    let raw_bytes = read_keyring_entry(KEY_IDENTITY)?;

    if raw_bytes.len() != 32 {
        return Err(format!(
            "Unexpected identity key length: {} (expected 32)",
            raw_bytes.len()
        ));
    }

    // Derive public key from seed
    let signing_key = ed25519_dalek::SigningKey::from_bytes(
        &raw_bytes
            .as_slice()
            .try_into()
            .map_err(|_| "Invalid key length")?,
    );
    let public_key = signing_key.verifying_key();

    // JS format: ["<public_key_der_hex>", "<seed+public_hex>"]
    let public_hex = format!("{}{}", ED25519_DER_PREFIX_HEX, hex::encode(public_key.as_bytes()));

    let mut secret_bytes = Vec::with_capacity(64);
    secret_bytes.extend_from_slice(&signing_key.to_bytes());
    secret_bytes.extend_from_slice(public_key.as_bytes());
    let secret_hex = hex::encode(&secret_bytes);

    Ok(vec![public_hex, secret_hex])
}
