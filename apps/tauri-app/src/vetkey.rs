//! VetKey derivation and encryption/decryption module
//!
//! Derives symmetric key material from IC canisters using the VetKey protocol,
//! then encrypts/decrypts file content.

use anyhow::{Context, Result};
use candid::{Decode, Encode, Principal};
use ic_agent::Agent;
use ic_vetkeys::{DerivedKeyMaterial, DerivedPublicKey, EncryptedVetKey, TransportSecretKey};
use rand::RngCore;

/// Domain separator used for file encryption — must match the TypeScript constant.
pub const DOMAIN_SEPARATOR: &str = "file_storage_dapp";

/// Derives key material from the storage canister for a given keyId.
pub async fn derive_key_material(
    agent: &Agent,
    canister_id: Principal,
    key_owner: Principal,
    key_name: &[u8],
) -> Result<DerivedKeyMaterial> {
    let mut seed = vec![0u8; 32];
    rand::thread_rng().fill_bytes(&mut seed);
    let tsk = TransportSecretKey::from_seed(seed)
        .map_err(|e| anyhow::anyhow!("Failed to create TransportSecretKey: {}", e))?;

    let key_id = (key_owner, key_name.to_vec());
    let transport_pub_key = tsk.public_key();

    let encrypted_vetkey_bytes =
        get_encrypted_vetkey(agent, canister_id, &key_id, &transport_pub_key)
            .await
            .context("Failed to get encrypted vetkey from canister")?;

    let verification_key_bytes = get_vetkey_verification_key(agent, canister_id)
        .await
        .context("Failed to get vetkey verification key")?;

    // Format: [principal_length_byte, ...principal_bytes, ...key_name_bytes]
    let owner_bytes = key_owner.as_slice();
    let mut input = Vec::with_capacity(1 + owner_bytes.len() + key_name.len());
    input.push(owner_bytes.len() as u8);
    input.extend_from_slice(owner_bytes);
    input.extend_from_slice(key_name);

    let encrypted_vetkey = EncryptedVetKey::deserialize(&encrypted_vetkey_bytes)
        .map_err(|e| anyhow::anyhow!("Failed to deserialize EncryptedVetKey: {}", e))?;

    let derived_public_key = DerivedPublicKey::deserialize(&verification_key_bytes)
        .map_err(|e| anyhow::anyhow!("Failed to deserialize DerivedPublicKey: {:?}", e))?;

    let vetkey = encrypted_vetkey
        .decrypt_and_verify(&tsk, &derived_public_key, &input)
        .map_err(|e| anyhow::anyhow!("VetKey decrypt_and_verify failed: {}", e))?;

    Ok(vetkey.as_derived_key_material())
}

/// Encrypt data using derived key material.
pub fn encrypt(key_material: &DerivedKeyMaterial, plaintext: &[u8]) -> Result<Vec<u8>> {
    let mut rng = rand::thread_rng();
    key_material
        .encrypt_message(plaintext, DOMAIN_SEPARATOR, &[], &mut rng)
        .map_err(|e| anyhow::anyhow!("Encryption failed: {:?}", e))
}

/// Decrypt data using derived key material.
pub fn decrypt(key_material: &DerivedKeyMaterial, ciphertext: &[u8]) -> Result<Vec<u8>> {
    key_material
        .decrypt_message(ciphertext, DOMAIN_SEPARATOR, &[])
        .map_err(|e| anyhow::anyhow!("Decryption failed: {:?}", e))
}

async fn get_encrypted_vetkey(
    agent: &Agent,
    canister_id: Principal,
    key_id: &(Principal, Vec<u8>),
    transport_public_key: &[u8],
) -> Result<Vec<u8>> {
    let args = Encode!(&key_id, &transport_public_key.to_vec())?;
    let response = agent
        .update(&canister_id, "getEncryptedVetkey")
        .with_arg(args)
        .call_and_wait()
        .await
        .context("getEncryptedVetkey call failed")?;
    let vetkey_bytes = Decode!(&response, Vec<u8>)?;
    Ok(vetkey_bytes)
}

async fn get_vetkey_verification_key(agent: &Agent, canister_id: Principal) -> Result<Vec<u8>> {
    let args = Encode!()?;
    let response = agent
        .update(&canister_id, "getVetkeyVerificationKey")
        .with_arg(args)
        .call_and_wait()
        .await
        .context("getVetkeyVerificationKey call failed")?;
    let verification_key = Decode!(&response, Vec<u8>)?;
    Ok(verification_key)
}
