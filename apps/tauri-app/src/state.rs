//! Application state shared across Tauri commands.

use ic_agent::Agent;
#[cfg(not(any(target_os = "ios", target_os = "android")))]
use ic_auth_client::NativeAuthClient;
use std::sync::Arc;
use tokio::sync::RwLock;

/// IC network configuration.
#[derive(Clone, Debug)]
pub struct IcConfig {
    pub ic_url: String,
    pub backend_canister_id: candid::Principal,
    pub is_local: bool,
    pub ii_bridge_url: String,
}

impl IcConfig {
    /// Production config (mainnet).
    fn production() -> Self {
        Self {
            ic_url: "https://icp-api.io".to_string(),
            backend_canister_id: candid::Principal::from_text("dkymu-iaaaa-aaaae-agwaa-cai")
                .expect("invalid prod backend canister id"),
            is_local: false,
            ii_bridge_url: "https://rabbithole.app/ii-bridge".to_string(),
        }
    }

    /// Staging config (local replica, canister URLs via *.localhost).
    /// Reads canister IDs from apps/backend/.env.
    fn staging() -> Self {
        let _ = dotenvy::from_filename("../backend/.env");

        let backend_id = std::env::var("CANISTER_ID_RABBITHOLE_BACKEND")
            .expect("CANISTER_ID_RABBITHOLE_BACKEND must be set (run dfx deploy or check apps/backend/.env)");
        let frontend_id = std::env::var("CANISTER_ID_RABBITHOLE_FRONTEND")
            .expect("CANISTER_ID_RABBITHOLE_FRONTEND must be set (run dfx deploy or check apps/backend/.env)");

        Self {
            ic_url: "https://localhost".to_string(),
            backend_canister_id: candid::Principal::from_text(&backend_id)
                .unwrap_or_else(|_| panic!("invalid backend canister id: {}", backend_id)),
            is_local: true,
            ii_bridge_url: format!("https://{}.localhost/ii-bridge", frontend_id),
        }
    }

    /// Development config (local replica, localhost:4200 dev server).
    /// Reads canister IDs from apps/backend/.env.
    fn development() -> Self {
        let _ = dotenvy::from_filename("../backend/.env");

        let backend_id = std::env::var("CANISTER_ID_RABBITHOLE_BACKEND")
            .expect("CANISTER_ID_RABBITHOLE_BACKEND must be set (run dfx deploy or check apps/backend/.env)");

        Self {
            ic_url: "http://localhost:4200".to_string(),
            backend_canister_id: candid::Principal::from_text(&backend_id)
                .unwrap_or_else(|_| panic!("invalid backend canister id: {}", backend_id)),
            is_local: true,
            ii_bridge_url: "http://localhost:4200/ii-bridge".to_string(),
        }
    }
}

impl Default for IcConfig {
    /// Select config based on TAURI_ENV env var.
    /// Falls back to debug_assertions: dev for debug builds, production for release.
    fn default() -> Self {
        match std::env::var("TAURI_ENV").as_deref() {
            Ok("production") => Self::production(),
            Ok("staging") => Self::staging(),
            Ok("development") => Self::development(),
            _ if cfg!(any(target_os = "ios", target_os = "android")) => Self::production(),
            _ if cfg!(debug_assertions) => Self::development(),
            _ => Self::production(),
        }
    }
}

/// Inner state behind Arc for sharing across async tasks.
struct AppStateInner {
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    auth_client: RwLock<Option<NativeAuthClient>>,
    agent: RwLock<Option<Arc<Agent>>>,
    config: RwLock<IcConfig>,
}

/// Shared application state managed by Tauri.
///
/// Cheaply cloneable via inner Arc — safe to pass into async spawns.
#[derive(Clone)]
pub struct AppState(Arc<AppStateInner>);

impl AppState {
    pub fn new(config: IcConfig) -> Self {
        Self(Arc::new(AppStateInner {
            #[cfg(not(any(target_os = "ios", target_os = "android")))]
            auth_client: RwLock::new(None),
            agent: RwLock::new(None),
            config: RwLock::new(config),
        }))
    }

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    pub fn auth_client(&self) -> &RwLock<Option<NativeAuthClient>> {
        &self.0.auth_client
    }

    pub fn config(&self) -> &RwLock<IcConfig> {
        &self.0.config
    }

    pub fn agent_lock(&self) -> &RwLock<Option<Arc<Agent>>> {
        &self.0.agent
    }

    /// Build an IC Agent from the current auth client identity.
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    pub async fn build_agent(&self) -> Result<Arc<Agent>, String> {
        let config = self.0.config.read().await;
        let auth_client_lock = self.0.auth_client.read().await;

        let auth_client = auth_client_lock
            .as_ref()
            .ok_or_else(|| "Not authenticated".to_string())?;

        let identity = auth_client.identity();

        let mut builder = Agent::builder()
            .with_url(&config.ic_url)
            .with_arc_identity(identity);

        if config.is_local {
            let client = reqwest::Client::builder()
                .danger_accept_invalid_certs(true)
                .build()
                .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
            builder = builder.with_http_client(client);
        }

        let agent = builder
            .build()
            .map_err(|e| format!("Failed to build agent: {}", e))?;

        if config.is_local {
            agent
                .fetch_root_key()
                .await
                .map_err(|e| format!("Failed to fetch root key: {}", e))?;
        }

        let agent = Arc::new(agent);
        *self.0.agent.write().await = Some(agent.clone());
        Ok(agent)
    }

    /// Mobile frontend uses JS-held delegated identity instead of Rust native auth.
    #[cfg(any(target_os = "ios", target_os = "android"))]
    pub async fn build_agent(&self) -> Result<Arc<Agent>, String> {
        Err("Rust native auth is desktop-only; mobile uses JS delegation flow".to_string())
    }

    /// Get the current agent, building one if needed.
    pub async fn get_agent(&self) -> Result<Arc<Agent>, String> {
        {
            let agent = self.0.agent.read().await;
            if let Some(ref a) = *agent {
                return Ok(a.clone());
            }
        }
        self.build_agent().await
    }
}
