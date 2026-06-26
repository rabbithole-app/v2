//! Tauri commands exposed to the Angular frontend via IPC.

use crate::{backend, state::AppState, storage};
#[cfg(not(any(target_os = "ios", target_os = "android")))]
use crate::{auth, bridge};
use candid::Principal;
use serde::Serialize;
use tauri::{AppHandle, State};
#[cfg(not(any(target_os = "ios", target_os = "android")))]
use tauri::{Emitter, Manager};

// ---------------------------------------------------------------------------
// Auth commands
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
pub struct AuthStatusPayload {
    is_authenticated: bool,
    principal: Option<String>,
}

/// Check if the user is authenticated (restored session from keyring).
#[cfg(not(any(target_os = "ios", target_os = "android")))]
#[tauri::command]
pub async fn auth_status(state: State<'_, AppState>) -> Result<AuthStatusPayload, String> {
    // Ensure auth client is initialized (lazy init if setup() hasn't finished or failed)
    {
        let lock = state.auth_client().read().await;
        if lock.is_none() {
            drop(lock);
            let _ = auth::init_auth_client(&state).await;
        }
    }

    let auth_lock = state.auth_client().read().await;
    match auth_lock.as_ref() {
        Some(client) => {
            let is_authenticated = client.is_authenticated();
            let principal = if is_authenticated {
                client.principal().ok().map(|p| p.to_text())
            } else {
                None
            };
            Ok(AuthStatusPayload {
                is_authenticated,
                principal,
            })
        }
        None => Ok(AuthStatusPayload {
            is_authenticated: false,
            principal: None,
        }),
    }
}

#[cfg(any(target_os = "ios", target_os = "android"))]
#[tauri::command]
pub async fn auth_status(_state: State<'_, AppState>) -> Result<AuthStatusPayload, String> {
    Ok(AuthStatusPayload {
        is_authenticated: false,
        principal: None,
    })
}

/// Start the login flow. Opens the system browser to ii-bridge.
/// Emits "auth-success" or "auth-error" events when complete.
#[cfg(not(any(target_os = "ios", target_os = "android")))]
#[tauri::command]
pub async fn sign_in(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Ensure auth client is initialized (lazy init if setup() hasn't finished or failed)
    {
        let lock = state.auth_client().read().await;
        if lock.is_none() {
            drop(lock);
            auth::init_auth_client(&state).await.map_err(|e| {
                format!("Failed to initialize auth client: {}", e)
            })?;
        }
    }

    let auth_lock = state.auth_client().read().await;
    let client = auth_lock
        .as_ref()
        .ok_or_else(|| "Auth client not initialized".to_string())?
        .clone();
    drop(auth_lock);

    let ii_bridge_url = state.config().read().await.ii_bridge_url.clone();

    let app_success = app.clone();
    let state_clone = (*state).clone();

    let app_error = app.clone();

    auth::login(
        &client,
        &ii_bridge_url,
        move || {
            let _ = app_success.emit("auth-success", ());
            // Focus the main window so user doesn't have to switch manually
            if let Some(w) = app_success.get_webview_window("main") {
                let _ = w.set_focus();
            }
            // Rebuild agent with new identity in background.
            // Note: on_success runs on a plain thread (not Tokio), so use tauri's runtime.
            let st = state_clone.clone();
            tauri::async_runtime::spawn(async move {
                let _ = st.build_agent().await;
            });
        },
        move |err| {
            let _ = app_error.emit("auth-error", err);
        },
    );

    Ok(())
}

#[cfg(any(target_os = "ios", target_os = "android"))]
#[tauri::command]
pub async fn sign_in(
    _app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err("Rust native auth is desktop-only; mobile uses JS delegation flow".to_string())
}

/// Logout and clear credentials.
#[cfg(not(any(target_os = "ios", target_os = "android")))]
#[tauri::command]
pub async fn sign_out(state: State<'_, AppState>) -> Result<(), String> {
    auth::logout(&state).await;
    Ok(())
}

#[cfg(any(target_os = "ios", target_os = "android"))]
#[tauri::command]
pub async fn sign_out(_state: State<'_, AppState>) -> Result<(), String> {
    Ok(())
}

/// Get delegation chain and identity key in JS-compatible format.
/// Angular uses this to create DelegationIdentity for its own HttpAgent.
#[cfg(not(any(target_os = "ios", target_os = "android")))]
#[tauri::command]
pub async fn get_delegation_chain() -> Result<bridge::AuthBridgeData, String> {
    bridge::read_auth_data_from_keyring()
}

#[cfg(any(target_os = "ios", target_os = "android"))]
#[tauri::command]
pub async fn get_delegation_chain() -> Result<(), String> {
    Err("Rust native auth is desktop-only; mobile uses JS delegation flow".to_string())
}

// ---------------------------------------------------------------------------
// Profile commands
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct ProfileInfo {
    pub principal: String,
    pub username: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

#[tauri::command]
pub async fn get_profile(state: State<'_, AppState>) -> Result<Option<ProfileInfo>, String> {
    let agent = state.get_agent().await?;
    let config = state.config().read().await;

    let profile = backend::get_profile(&agent, config.backend_canister_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(profile.map(|p| ProfileInfo {
        principal: p.id.to_text(),
        username: p.username,
        display_name: p.displayName,
        avatar_url: p.avatarUrl,
    }))
}

#[tauri::command]
pub async fn create_profile(state: State<'_, AppState>, username: String) -> Result<(), String> {
    let agent = state.get_agent().await?;
    let config = state.config().read().await;

    backend::create_profile(&agent, config.backend_canister_id, &username)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Storage commands
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct StorageListItem {
    pub id: String,
    pub canister_id: Option<String>,
    pub status: String,
    pub release_tag: String,
}

#[tauri::command]
pub async fn list_storages(state: State<'_, AppState>) -> Result<Vec<StorageListItem>, String> {
    let agent = state.get_agent().await?;
    let config = state.config().read().await;

    let storages = backend::list_storages(&agent, config.backend_canister_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(storages
        .into_iter()
        .map(|s| StorageListItem {
            id: s.id.to_string(),
            canister_id: s.canisterId.map(|c| c.to_text()),
            status: format!("{:?}", s.status),
            release_tag: s.releaseTag,
        })
        .collect())
}

#[tauri::command]
pub async fn create_storage(state: State<'_, AppState>) -> Result<(), String> {
    let agent = state.get_agent().await?;
    let config = state.config().read().await;

    let caller = agent
        .get_principal()
        .map_err(|e| format!("Failed to get principal: {}", e))?;

    backend::create_storage(&agent, config.backend_canister_id, caller)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// File commands
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct FileNode {
    pub id: u64,
    pub name: String,
    pub is_directory: bool,
    pub size: Option<String>,
    pub content_type: Option<String>,
    pub key_name: String,
}

#[tauri::command]
pub async fn list_files(
    state: State<'_, AppState>,
    storage_id: String,
    path: Option<String>,
) -> Result<Vec<FileNode>, String> {
    let agent = state.get_agent().await?;
    let canister_id =
        Principal::from_text(&storage_id).map_err(|e| format!("Invalid canister ID: {}", e))?;

    let entry = path.map(|p| (storage::EntryKind::Directory, p));

    let nodes = storage::list_storage(&agent, canister_id, entry)
        .await
        .map_err(|e| e.to_string())?;

    Ok(nodes
        .into_iter()
        .map(|n| {
            let (is_directory, size, content_type) = match &n.metadata {
                storage::Metadata::File(f) => {
                    (false, Some(f.size.to_string()), Some(f.contentType.clone()))
                }
                storage::Metadata::Directory(_) => (true, None, None),
            };
            let key_name = String::from_utf8_lossy(&n.keyId.1).to_string();
            FileNode {
                id: n.id,
                name: n.name,
                is_directory,
                size,
                content_type,
                key_name,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn upload_file(
    state: State<'_, AppState>,
    storage_id: String,
    local_path: String,
    remote_path: String,
    content_type: Option<String>,
) -> Result<FileNode, String> {
    let agent = state.get_agent().await?;
    let canister_id =
        Principal::from_text(&storage_id).map_err(|e| format!("Invalid canister ID: {}", e))?;

    let ct = content_type.unwrap_or_else(|| {
        mime_guess::from_path(&local_path)
            .first_or_octet_stream()
            .to_string()
    });

    let details = storage::upload(
        &agent,
        canister_id,
        std::path::Path::new(&local_path),
        &remote_path,
        &ct,
    )
    .await
    .map_err(|e| e.to_string())?;

    let key_name = String::from_utf8_lossy(&details.keyId.1).to_string();
    Ok(FileNode {
        id: details.id,
        name: details.name,
        is_directory: false,
        size: match &details.metadata {
            storage::Metadata::File(f) => Some(f.size.to_string()),
            _ => None,
        },
        content_type: match &details.metadata {
            storage::Metadata::File(f) => Some(f.contentType.clone()),
            _ => None,
        },
        key_name,
    })
}

#[tauri::command]
pub async fn download_file(
    state: State<'_, AppState>,
    storage_id: String,
    key_name: String,
    output_path: String,
) -> Result<u64, String> {
    let agent = state.get_agent().await?;
    let canister_id =
        Principal::from_text(&storage_id).map_err(|e| format!("Invalid canister ID: {}", e))?;

    // Find the file by key_name in the file listing
    let nodes = storage::list_storage(&agent, canister_id, None)
        .await
        .map_err(|e| e.to_string())?;

    let file_node = nodes
        .iter()
        .find(|n| n.keyId.1 == key_name.as_bytes())
        .ok_or_else(|| format!("File with key '{}' not found in storage", key_name))?;

    let encrypted_size = match &file_node.metadata {
        storage::Metadata::File(f) => f
            .size
            .0
            .to_string()
            .parse::<u64>()
            .map_err(|_| "Invalid file size".to_string())?,
        _ => return Err(format!("Key '{}' is a directory, not a file", key_name)),
    };

    let file_path = format!("/{}", file_node.name);
    let caller = agent
        .get_principal()
        .map_err(|e| format!("Failed to get principal: {}", e))?;

    let decrypted = storage::download(
        &agent,
        canister_id,
        caller,
        key_name.as_bytes(),
        &file_path,
        encrypted_size,
    )
    .await
    .map_err(|e| e.to_string())?;

    let bytes_written = decrypted.len() as u64;
    std::fs::write(&output_path, &decrypted)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(bytes_written)
}

// ---------------------------------------------------------------------------
// Config commands
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IcConfigUpdate {
    pub ic_url: Option<String>,
    pub backend_canister_id: Option<String>,
    pub is_local: Option<bool>,
    pub ii_bridge_url: Option<String>,
}

#[tauri::command]
pub async fn set_ic_config(state: State<'_, AppState>, config: IcConfigUpdate) -> Result<(), String> {
    let mut cfg = state.config().write().await;

    if let Some(url) = config.ic_url {
        cfg.ic_url = url;
    }
    if let Some(id) = config.backend_canister_id {
        cfg.backend_canister_id =
            Principal::from_text(&id).map_err(|e| format!("Invalid canister ID: {}", e))?;
    }
    if let Some(is_local) = config.is_local {
        cfg.is_local = is_local;
    }
    if let Some(url) = config.ii_bridge_url {
        cfg.ii_bridge_url = url;
    }

    // Invalidate current agent so it gets rebuilt with new config
    *state.agent_lock().write().await = None;

    Ok(())
}
