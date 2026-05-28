//! Storage canister client
//!
//! File operations against encrypted-storage canisters using the camelCase API.

#![allow(non_snake_case)]

use anyhow::{Context, Result};
use candid::{Decode, Encode, Nat, Principal};
use ic_agent::Agent;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::Path;

use crate::vetkey;

const MAX_CHUNK_SIZE: usize = 1_900_000;
const ENCRYPTED_MESSAGE_OVERHEAD_BYTES: usize = 28;

// ---------------------------------------------------------------------------
// Candid types
// ---------------------------------------------------------------------------

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub enum EntryKind {
    File,
    Directory,
}

pub type Entry = (EntryKind, String);

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub enum DirectoryColor {
    #[serde(rename = "blue")]
    Blue,
    #[serde(rename = "gray")]
    Gray,
    #[serde(rename = "orange")]
    Orange,
    #[serde(rename = "pink")]
    Pink,
    #[serde(rename = "purple")]
    Purple,
    #[serde(rename = "green")]
    Green,
    #[serde(rename = "yellow")]
    Yellow,
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub struct OnChainThumbnailRef {
    pub key: String,
    pub sha256: Option<Vec<u8>>,
    pub contentType: String,
    pub size: Nat,
    pub encryption: ThumbnailEncryptionRef,
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub struct BlobStorageThumbnailRef {
    pub rootHash: String,
    pub blobId: Vec<u8>,
    pub sha256: Option<Vec<u8>>,
    pub contentType: String,
    pub size: Nat,
    pub encryption: ThumbnailEncryptionRef,
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub struct EncryptedThumbnailRef {
    pub scopeKeyId: (Principal, Vec<u8>),
    pub wrappedKey: Vec<u8>,
    pub blobIv: Vec<u8>,
    pub algorithm: String,
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub enum ThumbnailEncryptionRef {
    Plaintext,
    Encrypted(EncryptedThumbnailRef),
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub enum ThumbnailRef {
    OnChain(OnChainThumbnailRef),
    BlobStorage(BlobStorageThumbnailRef),
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub struct FileMetadata {
    pub sha256: Option<Vec<u8>>,
    pub thumbnailRef: Option<ThumbnailRef>,
    pub contentType: String,
    pub size: Nat,
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub struct DirectoryMetadata {
    pub color: Option<DirectoryColor>,
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub enum Metadata {
    File(FileMetadata),
    Directory(DirectoryMetadata),
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub enum Permission {
    Read,
    ReadWrite,
    ReadWriteManage,
}

#[derive(candid::CandidType, candid::Deserialize, Clone, Debug, Serialize)]
pub struct NodeDetails {
    pub id: u64,
    pub permissions: Vec<(Principal, Permission)>,
    pub modifiedAt: Option<candid::Int>,
    pub metadata: Metadata,
    pub name: String,
    pub createdAt: candid::Int,
    pub parentId: Option<u64>,
    pub keyId: (Principal, Vec<u8>),
}

// --- Request/response types ---

#[derive(candid::CandidType)]
enum CreateMode {
    GetOrCreate,
    CreateNew,
}

#[derive(candid::CandidType)]
enum EncryptionMode {
    Encrypted,
    Plaintext,
}

#[derive(candid::CandidType)]
struct BeginUploadSessionArguments {
    entry: Entry,
    totalSize: Nat,
    declaredUploadBytes: Option<Nat>,
    expectedChunkCount: Option<Nat>,
    createMode: CreateMode,
    encryptionMode: Option<EncryptionMode>,
}

#[derive(candid::CandidType, candid::Deserialize, Debug)]
struct BeginUploadSessionResponse {
    batchId: Nat,
    node: NodeDetails,
}

#[derive(candid::CandidType)]
struct StorageChunkArguments {
    batchId: Nat,
    content: Vec<u8>,
    chunkIndex: Option<Nat>,
}

#[derive(candid::CandidType, candid::Deserialize, Debug)]
struct StorageChunkResponse {
    chunkId: Nat,
}

#[derive(candid::CandidType)]
struct FinishUploadSessionArguments {
    batchId: Nat,
    sha256: Option<Vec<u8>>,
    contentType: String,
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

pub async fn list_storage(
    agent: &Agent,
    canister_id: Principal,
    entry: Option<Entry>,
) -> Result<Vec<NodeDetails>> {
    let args = Encode!(&entry)?;
    let response = agent
        .query(&canister_id, "listStorage")
        .with_arg(args)
        .call()
        .await
        .context("listStorage query failed")?;
    let nodes = Decode!(&response, Vec<NodeDetails>)?;
    Ok(nodes)
}

pub async fn download(
    agent: &Agent,
    canister_id: Principal,
    key_owner: Principal,
    key_name: &[u8],
    file_path: &str,
    encrypted_size: u64,
) -> Result<Vec<u8>> {
    let key_material =
        vetkey::derive_key_material(agent, canister_id, key_owner, key_name).await?;

    let num_chunks = (encrypted_size as usize + MAX_CHUNK_SIZE - 1) / MAX_CHUNK_SIZE;
    let entry: Entry = (EntryKind::File, file_path.to_string());

    let mut encrypted_bytes = Vec::with_capacity(encrypted_size as usize);
    for i in 0..num_chunks {
        #[derive(candid::CandidType)]
        struct GetChunkArguments {
            chunkIndex: candid::Nat,
            entry: Entry,
        }

        #[derive(candid::CandidType, candid::Deserialize)]
        struct ChunkContent {
            content: Vec<u8>,
        }

        let args = GetChunkArguments {
            chunkIndex: Nat::from(i as u64),
            entry: entry.clone(),
        };

        let response = agent
            .query(&canister_id, "getStorageChunk")
            .with_arg(Encode!(&args)?)
            .call()
            .await
            .with_context(|| format!("getStorageChunk failed for chunk {}", i))?;

        let chunk = Decode!(&response, ChunkContent)?;
        encrypted_bytes.extend_from_slice(&chunk.content);
    }

    let decrypted = vetkey::decrypt(&key_material, &encrypted_bytes)?;
    Ok(decrypted)
}

pub async fn upload(
    agent: &Agent,
    canister_id: Principal,
    file_path: &Path,
    remote_path: &str,
    content_type: &str,
) -> Result<NodeDetails> {
    let plaintext = std::fs::read(file_path)
        .with_context(|| format!("Failed to read file: {}", file_path.display()))?;

    // 1. Reserve an upload session and create the file entry.
    let entry: Entry = (EntryKind::File, remote_path.to_string());
    let declared_upload_bytes = plaintext
        .len()
        .checked_add(ENCRYPTED_MESSAGE_OVERHEAD_BYTES)
        .context("Encrypted upload size overflow")?;
    let expected_chunks = declared_upload_bytes.div_ceil(MAX_CHUNK_SIZE);
    let session_response = agent
        .update(&canister_id, "beginUploadSession")
        .with_arg(Encode!(&BeginUploadSessionArguments {
            entry: entry.clone(),
            totalSize: Nat::from(plaintext.len() as u64),
            declaredUploadBytes: Some(Nat::from(declared_upload_bytes as u64)),
            expectedChunkCount: Some(Nat::from(expected_chunks as u64)),
            createMode: CreateMode::GetOrCreate,
            encryptionMode: Some(EncryptionMode::Encrypted),
        })?)
        .call_and_wait()
        .await
        .context("beginUploadSession call failed")?;
    let session = Decode!(&session_response, BeginUploadSessionResponse)?;
    let details = session.node;

    // 2. Derive key material
    let key_material =
        vetkey::derive_key_material(agent, canister_id, details.keyId.0, &details.keyId.1).await?;

    // 3. Encrypt
    let encrypted_bytes = vetkey::encrypt(&key_material, &plaintext)?;

    // 4. Upload chunks
    let chunk_count = encrypted_bytes.len().div_ceil(MAX_CHUNK_SIZE);
    let mut hasher = Sha256::new();

    for i in 0..chunk_count {
        let start = i * MAX_CHUNK_SIZE;
        let end = std::cmp::min(start + MAX_CHUNK_SIZE, encrypted_bytes.len());
        let chunk_content = &encrypted_bytes[start..end];
        hasher.update(chunk_content);

        let chunk_response = agent
            .update(&canister_id, "appendUploadChunk")
            .with_arg(Encode!(&StorageChunkArguments {
                batchId: session.batchId.clone(),
                content: chunk_content.to_vec(),
                chunkIndex: Some(Nat::from(i as u64)),
            })?)
            .call_and_wait()
            .await
            .with_context(|| format!("appendUploadChunk failed for chunk {}/{}", i + 1, chunk_count))?;

        let _chunk = Decode!(&chunk_response, StorageChunkResponse)?;
    }

    // 5. Finalize
    let sha256_hash = hasher.finalize().to_vec();
    let finish_args = FinishUploadSessionArguments {
        batchId: session.batchId,
        sha256: Some(sha256_hash),
        contentType: content_type.to_string(),
    };

    agent
        .update(&canister_id, "finishUploadSession")
        .with_arg(Encode!(&finish_args)?)
        .call_and_wait()
        .await
        .context("finishUploadSession call failed")?;

    Ok(details)
}
