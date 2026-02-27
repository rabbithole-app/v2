//! Authentication module using ic-auth-client native flow.
//!
//! Uses NativeAuthClient which:
//! 1. Starts a local HTTP server on a random port
//! 2. Opens the system browser to an ii-bridge page
//! 3. ii-bridge handles Internet Identity authentication
//! 4. II returns delegation chain via POST to localhost callback
//! 5. NativeAuthClient receives the delegation and creates DelegatedIdentity

use ic_auth_client::{
    AuthClientLoginOptions, IdleOptions, NativeAuthClient, NativeAuthClientCreateOptions,
};
use ic_auth_client::storage::sync_storage::KeyringStorage;

use crate::state::AppState;

const SERVICE_NAME: &str = "com.rabbithole.app";

/// Initialize the NativeAuthClient with keyring storage.
/// Returns true if a valid session was restored from storage.
pub async fn init_auth_client(state: &AppState) -> Result<bool, String> {
    // Disable idle manager because `rdev::listen` on macOS calls
    // `TSMGetInputSourceProperty` from a non-main thread, which causes
    // a `dispatch_assert_queue_fail` crash on any key press (including
    // modifier keys like Shift, Command, etc.).
    let options = NativeAuthClientCreateOptions::builder()
        .storage(KeyringStorage::new(SERVICE_NAME))
        .idle_options(IdleOptions {
            disable_idle: Some(true),
            ..Default::default()
        })
        .build();

    let auth_client = NativeAuthClient::new_with_options(options)
        .map_err(|e| format!("Failed to create NativeAuthClient: {}", e))?;

    let is_authenticated = auth_client.is_authenticated();

    *state.auth_client().write().await = Some(auth_client);

    // If we restored a session, build the agent immediately
    if is_authenticated {
        state.build_agent().await?;
    }

    Ok(is_authenticated)
}

/// Trigger the login flow. Opens browser to ii-bridge for Internet Identity authentication.
pub fn login(
    auth_client: &NativeAuthClient,
    ii_bridge_url: &str,
    on_success: impl Fn() + Send + Sync + 'static,
    on_error: impl Fn(Option<String>) + Send + Sync + 'static,
) {
    let options = AuthClientLoginOptions::builder()
        .max_time_to_live(7 * 24 * 60 * 60 * 1_000_000_000u64) // 7 days
        .on_success(move |_| on_success())
        .on_error(move |err| on_error(err))
        .build();

    auth_client.login(ii_bridge_url.to_string(), options);
}

/// Logout and clear stored credentials.
pub async fn logout(state: &AppState) {
    let auth_lock = state.auth_client().read().await;
    if let Some(ref client) = *auth_lock {
        client.logout();
    }
    drop(auth_lock);

    *state.agent_lock().write().await = None;
}
