import type { ActorInterface, CanisterFixture, PocketIc } from "@dfinity/pic";
import {
  arrayBufferToUint8Array,
  hexStringToUint8Array,
  nonNullish,
  toNullable,
} from "@dfinity/utils";
import { type Identity, MANAGEMENT_CANISTER_ID } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import { sha256 } from "@noble/hashes/sha2";
import { readFile } from "node:fs/promises";

const INSTALL_MAX_CHUNK_SIZE = 1_000_000;

// Did utils

const canister_id = IDL.Principal;

// Clear chunk store did

const clear_chunk_store_args = IDL.Record({ canister_id });

export type canister_id = Principal;
export interface clear_chunk_store_args {
  canister_id: canister_id;
}

// Upload chunk did

const upload_chunk_args = IDL.Record({
  chunk: IDL.Vec(IDL.Nat8),
  canister_id: IDL.Principal,
});
const chunk_hash = IDL.Record({ hash: IDL.Vec(IDL.Nat8) });
const upload_chunk_result = chunk_hash;

export interface chunk_hash {
  hash: number[] | Uint8Array;
}
export interface upload_chunk_args {
  canister_id: Principal;
  chunk: number[] | Uint8Array;
}
export type upload_chunk_result = chunk_hash;

// Install chunked code did

const canister_install_mode = IDL.Variant({
  reinstall: IDL.Null,
  upgrade: IDL.Opt(
    IDL.Record({
      wasm_memory_persistence: IDL.Opt(
        IDL.Variant({ keep: IDL.Null, replace: IDL.Null }),
      ),
      skip_pre_upgrade: IDL.Opt(IDL.Bool),
    }),
  ),
  install: IDL.Null,
});

const install_chunked_code_args = IDL.Record({
  arg: IDL.Vec(IDL.Nat8),
  wasm_module_hash: IDL.Vec(IDL.Nat8),
  mode: canister_install_mode,
  chunk_hashes_list: IDL.Vec(chunk_hash),
  target_canister: canister_id,
  store_canister: IDL.Opt(canister_id),
  sender_canister_version: IDL.Opt(IDL.Nat64),
});

export type canister_install_mode =
  | { install: null }
  | { reinstall: null }
  | {
      upgrade:
        | []
        | [
            {
              skip_pre_upgrade: [] | [boolean];
              wasm_memory_persistence:
                | []
                | [{ keep: null } | { replace: null }];
            },
          ];
    };

interface install_chunked_code_args {
  arg: number[] | Uint8Array;
  chunk_hashes_list: Array<chunk_hash>;
  mode: canister_install_mode;
  sender_canister_version: [] | [bigint];
  store_canister: [] | [canister_id];
  target_canister: canister_id;
  wasm_module_hash: number[] | Uint8Array;
}

// Program

interface PicParams {
  pic: PocketIc;
  sender: Identity;
}

interface SetupChunkedCanisterParams extends PicParams {
  arg?: ArrayBuffer;
  idlFactory: IDL.InterfaceFactory;
  wasmPath: string;
}

type UpgradeChunkedCanisterParams = {
  canisterId: Principal;
} & Omit<SetupChunkedCanisterParams, "idlFactory">;

export const setupChunkedCanister = async <
  T extends ActorInterface<T> = ActorInterface,
>({
  pic,
  sender,
  idlFactory,
  ...rest
}: SetupChunkedCanisterParams): Promise<CanisterFixture<T>> => {
  const canisterId = await pic.createCanister({
    sender: sender.getPrincipal(),
  });

  await installCanister({
    pic,
    sender,
    canisterId,
    ...rest,
    mode: { install: null },
  });

  const actor = pic.createActor<T>(idlFactory, canisterId);

  return { canisterId, actor };
};

export const upgradeChunkedCanister = async (
  params: UpgradeChunkedCanisterParams,
) => {
  await installCanister({
    ...params,
    mode: { upgrade: [] },
  });
};

const sha256ToHex = (hashBuffer: Uint8Array): string => {
  const hashArray = Array.from(hashBuffer);
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

const installCanister = async ({
  pic,
  sender,
  wasmPath,
  arg,
  canisterId,
  mode,
}: { mode: canister_install_mode } & UpgradeChunkedCanisterParams) => {
  await clearChunkStoreApi({ canisterId, pic, sender });

  const wasm = await readFile(wasmPath);

  const uploadChunks = wasmToChunks({ wasm: new Uint8Array(wasm) });

  // Upload chunks to the IC in batch - i.e. 12 chunks uploaded at a time.
  let chunkIds: UploadChunkResult[] = [];
  for await (const results of batchUploadChunks({
    uploadChunks,
    canisterId,
    pic,
    sender,
  })) {
    chunkIds = [...chunkIds, ...results];
  }

  // Install the chunked code.
  // ⚠️ The order of the chunks is really important! ⚠️
  await installChunkedCodeApi({
    pic,
    sender,
    canisterId,
    arg,
    chunkHashesList: chunkIds
      .sort(
        ({ orderId: orderIdA }, { orderId: orderIdB }) => orderIdA - orderIdB,
      )
      .map(({ chunkHash }) => chunkHash),
    wasmModuleHash: sha256ToHex(sha256(wasm)),
    mode,
  });
};

const clearChunkStoreApi = async ({
  canisterId,
  pic,
  sender,
}: { canisterId: Principal } & PicParams) => {
  const payload: clear_chunk_store_args = {
    canister_id: canisterId,
  };

  await pic.updateCall({
    method: "clear_chunk_store",
    arg: IDL.encode([clear_chunk_store_args], [payload]),
    canisterId: Principal.fromText(MANAGEMENT_CANISTER_ID),
    sender: sender.getPrincipal(),
  });
};

interface UploadChunkOrderId {
  orderId: number;
}

interface UploadChunkParams extends UploadChunkOrderId {
  chunk: Blob;
}

interface UploadChunkResult extends UploadChunkOrderId {
  chunkHash: chunk_hash;
}

const wasmToChunks = ({
  wasm,
}: {
  wasm: Uint8Array<ArrayBuffer>;
}): UploadChunkParams[] => {
  const blob = new Blob([wasm]);

  const uploadChunks: UploadChunkParams[] = [];

  const chunkSize = INSTALL_MAX_CHUNK_SIZE;

  // Split data into chunks
  let orderId = 0;
  for (let start = 0; start < blob.size; start += chunkSize) {
    const chunk = blob.slice(start, start + chunkSize);
    uploadChunks.push({
      chunk,
      orderId,
    });

    orderId++;
  }

  return uploadChunks;
};

async function* batchUploadChunks({
  uploadChunks,
  limit = 12,
  ...rest
}: { canisterId: Principal } & {
  limit?: number;
  uploadChunks: UploadChunkParams[];
} & PicParams): AsyncGenerator<UploadChunkResult[], void> {
  for (let i = 0; i < uploadChunks.length; i = i + limit) {
    const batch = uploadChunks.slice(i, i + limit);
    const result = await Promise.all(
      batch.map((uploadChunkParams) =>
        uploadChunk({
          uploadChunk: uploadChunkParams,
          ...rest,
        }),
      ),
    );
    yield result;
  }
}

const uploadChunk = async ({
  uploadChunk: { chunk, ...restChunk },
  ...rest
}: {
  canisterId: Principal;
} & {
  uploadChunk: UploadChunkParams;
} & PicParams): Promise<UploadChunkResult> => {
  const chunkHash = await uploadChunkApi({
    chunk,
    ...rest,
  });

  return {
    chunkHash,
    ...restChunk,
  };
};

const uploadChunkApi = async ({
  canisterId,
  chunk,
  pic,
  sender,
}: { canisterId: Principal } & Pick<UploadChunkParams, "chunk"> &
  PicParams) => {
  const payload: upload_chunk_args = {
    canister_id: canisterId,
    chunk: new Uint8Array(await chunk.arrayBuffer()),
  };

  const response = await pic.updateCall({
    method: "upload_chunk",
    arg: IDL.encode([upload_chunk_args], [payload]),
    canisterId: Principal.fromText(MANAGEMENT_CANISTER_ID),
    sender: sender.getPrincipal(),
  });

  const result = IDL.decode(toNullable(upload_chunk_result), response);

  const [hash] = result as unknown as [upload_chunk_result];

  return hash;
};

const installChunkedCodeApi = async ({
  arg: initArg,
  canisterId,
  chunkHashesList,
  wasmModuleHash,
  sender,
  pic,
  mode,
}: {
  canisterId: Principal;
  chunkHashesList: Array<chunk_hash>;
  mode: canister_install_mode;
  wasmModuleHash: string;
} & Omit<SetupChunkedCanisterParams, "idlFactory" | "wasmPath">) => {
  const payload: install_chunked_code_args = {
    arg: nonNullish(initArg)
      ? arrayBufferToUint8Array(initArg)
      : new Uint8Array(),
    wasm_module_hash: hexStringToUint8Array(wasmModuleHash),
    mode,
    chunk_hashes_list: chunkHashesList,
    sender_canister_version: toNullable(),
    store_canister: toNullable(),
    target_canister: canisterId,
  };

  const subnetId = await pic.getCanisterSubnetId(canisterId);

  await pic.updateCall({
    method: "install_chunked_code",
    arg: IDL.encode([install_chunked_code_args], [payload]),
    canisterId: Principal.fromText(MANAGEMENT_CANISTER_ID),
    sender: sender.getPrincipal(),
    targetSubnetId: subnetId ?? undefined,
  });
};
