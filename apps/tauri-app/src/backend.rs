//! Backend canister client
//!
//! Calls rabbithole-backend for profile and storage management.

#![allow(non_snake_case)]

use anyhow::{Context, Result};
use candid::{Decode, Encode, Nat, Principal};
use ic_agent::Agent;
use serde::Serialize;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub struct StorageInfo {
    pub id: Nat,
    pub status: CreationStatus,
    pub completedAt: Option<candid::Int>,
    pub createdAt: candid::Int,
    pub releaseTag: String,
    pub updateAvailable: Option<UpdateInfo>,
    pub canisterId: Option<Principal>,
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub enum CreationStatus {
    Pending,
    CheckingAllowance,
    TransferringICP { amount: Nat },
    NotifyingCMC { blockIndex: Nat },
    CanisterCreated { canisterId: Principal },
    InstallingWasm { progress: Progress, canisterId: Principal },
    UpgradingWasm { progress: Progress, canisterId: Principal },
    UpdatingControllers { canisterId: Principal },
    UploadingFrontend { progress: Progress, canisterId: Principal },
    UpgradingFrontend { progress: Progress, canisterId: Principal },
    RevokingInstallerPermission { canisterId: Principal },
    Completed { canisterId: Principal },
    Failed(String),
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub struct Progress {
    pub total: Nat,
    pub processed: Nat,
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub struct UpdateInfo {
    pub currentWasmHash: Option<Vec<u8>>,
    pub wasmUpdateAvailable: bool,
    pub availableReleaseTag: Option<String>,
    pub currentReleaseTag: Option<String>,
    pub frontendUpdateAvailable: bool,
    pub availableWasmHash: Option<Vec<u8>>,
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub struct Profile {
    pub id: Principal,
    pub username: String,
    pub displayName: Option<String>,
    pub inviter: Option<Principal>,
    pub createdAt: candid::Int,
    pub updatedAt: candid::Int,
    pub avatarUrl: Option<String>,
}

#[derive(candid::CandidType)]
struct CreateProfileArgs {
    username: String,
    displayName: Option<String>,
    inviter: Option<Principal>,
    avatarUrl: Option<String>,
}

#[derive(candid::CandidType)]
struct CreateStorageOptions {
    releaseSelector: ReleaseSelector,
    target: TargetCanister,
    initArg: Vec<u8>,
}

#[derive(candid::CandidType)]
#[allow(dead_code)]
enum ReleaseSelector {
    Latest,
    LatestPrerelease,
    LatestDraft,
    Version(String),
}

#[derive(candid::CandidType)]
enum TargetCanister {
    Create {
        initialCycles: Nat,
        subnetId: Option<Principal>,
    },
    #[allow(dead_code)]
    Existing(Principal),
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

pub async fn list_storages(
    agent: &Agent,
    backend_canister_id: Principal,
) -> Result<Vec<StorageInfo>> {
    let response = agent
        .query(&backend_canister_id, "listStorages")
        .with_arg(Encode!()?)
        .call()
        .await
        .context("listStorages query failed")?;
    let storages = Decode!(&response, Vec<StorageInfo>)?;
    Ok(storages)
}

pub async fn get_profile(
    agent: &Agent,
    backend_canister_id: Principal,
) -> Result<Option<Profile>> {
    let response = agent
        .query(&backend_canister_id, "getProfile")
        .with_arg(Encode!()?)
        .call()
        .await
        .context("getProfile query failed")?;
    let profile = Decode!(&response, Option<Profile>)?;
    Ok(profile)
}

pub async fn create_profile(
    agent: &Agent,
    backend_canister_id: Principal,
    username: &str,
) -> Result<()> {
    let args = CreateProfileArgs {
        username: username.to_string(),
        displayName: None,
        inviter: None,
        avatarUrl: None,
    };
    agent
        .update(&backend_canister_id, "createProfile")
        .with_arg(Encode!(&args)?)
        .call_and_wait()
        .await
        .context("createProfile call failed")?;
    Ok(())
}

pub async fn create_storage(
    agent: &Agent,
    backend_canister_id: Principal,
    owner: Principal,
) -> Result<()> {
    #[derive(candid::CandidType)]
    struct EncryptedStorageInitArgs {
        vetKeyName: String,
        owner: Principal,
    }

    let init_args = EncryptedStorageInitArgs {
        vetKeyName: "dfx_test_key".to_string(),
        owner,
    };
    let init_arg_bytes = Encode!(&init_args)?;

    let args = CreateStorageOptions {
        releaseSelector: ReleaseSelector::LatestDraft,
        target: TargetCanister::Create {
            initialCycles: Nat::from(2_000_000_000_000u64),
            subnetId: None,
        },
        initArg: init_arg_bytes,
    };

    agent
        .update(&backend_canister_id, "createStorage")
        .with_arg(Encode!(&args)?)
        .call_and_wait()
        .await
        .context("createStorage call failed")?;

    Ok(())
}
