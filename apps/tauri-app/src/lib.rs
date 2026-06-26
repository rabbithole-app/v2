mod backend;
mod commands;
mod state;
mod storage;
mod vetkey;

#[cfg(not(any(target_os = "ios", target_os = "android")))]
mod auth;
#[cfg(not(any(target_os = "ios", target_os = "android")))]
mod bridge;

use state::{AppState, IcConfig};
use tauri::Manager;
#[cfg(all(desktop, not(debug_assertions)))]
use tauri::AppHandle;
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let config = IcConfig::default();
    tracing::info!("IC config: ic_url={}, backend={}, local={}, ii_bridge={}",
        config.ic_url, config.backend_canister_id, config.is_local, config.ii_bridge_url);
    let app_state = AppState::new(config);

    let builder = tauri::Builder::default();

    #[cfg(all(desktop, not(debug_assertions)))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        tracing::info!("New app instance opened with {argv:?}");
        show_window(app);
    }));

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::new().build());

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::auth_status,
            commands::sign_in,
            commands::sign_out,
            commands::get_delegation_chain,
            commands::get_profile,
            commands::create_profile,
            commands::list_storages,
            commands::create_storage,
            commands::list_files,
            commands::upload_file,
            commands::download_file,
            commands::set_ic_config,
        ])
        .setup(|app| {
            // Open devtools in debug builds
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }

            #[cfg(not(any(target_os = "ios", target_os = "android")))]
            {
                // Initialize auth client on startup to restore session from keyring
                let state = app.state::<AppState>();
                let state_clone = state.inner().clone();
                tauri::async_runtime::spawn(async move {
                    match auth::init_auth_client(&state_clone).await {
                        Ok(true) => tracing::info!("Session restored from keyring"),
                        Ok(false) => tracing::info!("No stored session, user needs to sign in"),
                        Err(e) => tracing::warn!("Failed to init auth client: {}", e),
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(all(desktop, not(debug_assertions)))]
fn show_window(app: &AppHandle) {
    let windows = app.webview_windows();
    if let Some(window) = windows.values().next() {
        let _ = window.set_focus();
    }
}
