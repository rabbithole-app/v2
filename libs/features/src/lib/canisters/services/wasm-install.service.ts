import { computed, inject, Injectable, signal } from '@angular/core';
import { arrayBufferToUint8Array } from '@dfinity/utils';
import {
  IcManagementCanister,
  type IcManagementDid,
  UploadChunkParams,
} from '@icp-sdk/canisters/ic-management';
import { sha256 } from '@noble/hashes/sha2';
import { Subject } from 'rxjs';

import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  injectHttpAgent,
  INSTALL_MAX_CHUNK_SIZE,
  parseCanisterRejectError,
} from '@rabbithole/core';

type State =
  | UploadingState
  | { errorMessage: string; status: 'failed' }
  | { status: 'completed' }
  | { status: 'idle' }
  | { status: 'installing' };

type UploadingState = {
  progress: number;
  status: 'uploading';
  total: number;
  wasmModuleHash: Uint8Array;
};

@Injectable()
export class WasmInstallService {
  #state = signal<State>({ status: 'idle' });
  state = this.#state.asReadonly();
  #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  #httpAgent = injectHttpAgent();
  #icManagement = computed(() => {
    const agent = this.#httpAgent();
    return IcManagementCanister.create({ agent });
  });
  #uploadFile = new Subject<File>();

  async install(wasm: File, mode: IcManagementDid.canister_install_mode) {
    const ab = await wasm.arrayBuffer();
    const u8 = arrayBufferToUint8Array(ab);
    const wasmModuleHash = sha256(u8);
    const initialUploadingState: UploadingState = {
      status: 'uploading',
      wasmModuleHash,
      total: wasm.size,
      progress: 0,
    };
    this.#state.set(initialUploadingState);
    const uploadChunks = this.wasmToChunks(u8);
    const icManagement = this.#icManagement();
    const chunkHashesList: IcManagementDid.chunk_hash[] = [];

    try {
      for await (const { chunk } of uploadChunks) {
        const { hash } = await icManagement.uploadChunk({
          chunk,
          canisterId: this.#canisterId,
        });
        chunkHashesList.push({ hash: new Uint8Array(hash) });
        this.#state.update((state) => {
          if (state.status === 'uploading') {
            return {
              ...state,
              progress: state.progress + chunk.length,
            };
          }

          return state;
        });
      }

      this.#state.set({ status: 'installing' });

      await icManagement.installChunkedCode({
        chunkHashesList,
        wasmModuleHash,
        targetCanisterId: this.#canisterId,
        mode,
        arg: new Uint8Array(),
      });

      this.#state.set({ status: 'completed' });
    } catch (error) {
      const errorMessage = parseCanisterRejectError(error) ?? 'Unknown error';
      console.error(
        '[WasmInstallService] Error installing chunked code:',
        errorMessage,
      );
      this.#state.set({ errorMessage, status: 'failed' });
      throw error;
    }
  }

  upload(wasm: File) {
    this.#uploadFile.next(wasm);
  }

  wasmToChunks(wasm: Uint8Array) {
    const uploadChunks: Pick<UploadChunkParams, 'chunk'>[] = [];

    const chunkSize = INSTALL_MAX_CHUNK_SIZE;

    // Split data into chunks
    for (let i = 0; i < wasm.byteLength; i += chunkSize) {
      const chunkView = wasm.subarray(i, i + chunkSize);
      // Convert the view back to an ArrayBuffer for each chunk
      const chunk = new Uint8Array(
        chunkView.buffer.slice(
          chunkView.byteOffset,
          chunkView.byteOffset + chunkView.byteLength,
        ),
      );
      uploadChunks.push({ chunk });
    }

    return uploadChunks;
  }
}
