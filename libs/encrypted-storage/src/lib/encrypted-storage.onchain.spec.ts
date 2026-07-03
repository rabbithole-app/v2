import { Actor } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const vetkeyMocks = vi.hoisted(() => {
  const encryptMessage = vi.fn(async (bytes: Uint8Array) => {
    const encrypted = new Uint8Array(bytes.byteLength + 28);
    encrypted.set(bytes);
    return encrypted;
  });
  const derivedKeyMaterial = {
    decryptMessage: vi.fn(async (bytes: Uint8Array) =>
      bytes.slice(0, Math.max(0, bytes.byteLength - 28))),
    encryptMessage,
    getCryptoKey: vi.fn(() => ({})),
  };
  return { derivedKeyMaterial, encryptMessage };
});

vi.mock('idb-keyval', () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock('@dfinity/vetkeys', () => ({
  DerivedKeyMaterial: {
    fromCryptoKey: () => vetkeyMocks.derivedKeyMaterial,
  },
  DerivedPublicKey: {
    deserialize: () => ({}),
  },
  EncryptedVetKey: {
    deserialize: () => ({
      decryptAndVerify: () => ({
        asDerivedKeyMaterial: () => vetkeyMocks.derivedKeyMaterial,
      }),
    }),
  },
  TransportSecretKey: {
    random: () => ({
      publicKeyBytes: () => new Uint8Array([1, 2, 3]),
    }),
  },
}));

import { EncryptedStorage } from './encrypted-storage';

describe('EncryptedStorage OnChain upload funding retry', () => {
  const canisterId = Principal.fromText('aaaaa-aa');
  const keyId: [Principal, Uint8Array] = [
    canisterId,
    new TextEncoder().encode('onchain-file-id'),
  ];

  let actorMock: {
    abortUploadSession: ReturnType<typeof vi.fn>;
    appendUploadChunk: ReturnType<typeof vi.fn>;
    beginUploadSession: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    finishUploadSession: ReturnType<typeof vi.fn>;
    getEncryptedVetkey: ReturnType<typeof vi.fn>;
    getVetkeyVerificationKey: ReturnType<typeof vi.fn>;
    resolveUploadRoute: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    actorMock = {
      create: vi.fn(async () => ({
        keyId,
        metadata: {
          File: {},
        },
      })),
      getEncryptedVetkey: vi.fn(async () => new Uint8Array([1])),
      getVetkeyVerificationKey: vi.fn(async () => new Uint8Array([2])),
      resolveUploadRoute: vi.fn(async () => ({ ok: { OnChain: null } })),
      beginUploadSession: vi.fn(async () => ({
        ok: {
          batchId: 1n,
          node: {
            keyId,
            metadata: {
              File: {},
            },
          },
        },
      })),
      appendUploadChunk: vi.fn(async () => ({ ok: { chunkId: 1n } })),
      finishUploadSession: vi
        .fn()
        .mockResolvedValueOnce({
          err: {
            code: { FundingPending: null },
            message: 'Upload funding is pending: finish upload session requires cycles.',
          },
        })
        .mockResolvedValueOnce({ ok: null }),
      abortUploadSession: vi.fn(async () => ({ ok: null })),
    };

    vi.spyOn(Actor, 'createActor').mockReturnValue(actorMock as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries funding-pending finalize without aborting the upload session', async () => {
    const storage = new EncryptedStorage({
      canisterId,
      agent: {} as never,
      origin: 'https://example.test',
      storageBackend: 'OnChain',
    });

    const upload = storage.store([new TextEncoder().encode('retry finalize'), {
      fileName: 'retry-finalize.txt',
      contentType: 'text/plain',
    }]);

    await vi.waitFor(() => {
      expect(actorMock.finishUploadSession).toHaveBeenCalledTimes(1);
    });
    await vi.advanceTimersByTimeAsync(2_000);
    await upload;

    expect(actorMock.finishUploadSession).toHaveBeenCalledTimes(2);
    expect(actorMock.abortUploadSession).not.toHaveBeenCalled();
    expect(actorMock.create).not.toHaveBeenCalled();
    expect(actorMock.beginUploadSession).toHaveBeenCalledWith(expect.objectContaining({
      createMode: { GetOrCreate: null },
      declaredUploadBytes: [42n],
      expectedChunkCount: [1n],
    }));
    expect(actorMock.appendUploadChunk).toHaveBeenCalledWith(expect.objectContaining({
      chunkIndex: [0n],
    }));
  });

  it('retries backend funding cooldown errors without aborting the upload session', async () => {
    actorMock.finishUploadSession.mockReset();
    actorMock.finishUploadSession.mockResolvedValue({ ok: null });
    actorMock.appendUploadChunk
      .mockResolvedValueOnce({
        err: {
          code: { FundingPending: null },
          message: 'Storage funding is already in progress',
        },
      })
      .mockResolvedValueOnce({ ok: { chunkId: 1n } });

    const storage = new EncryptedStorage({
      canisterId,
      agent: {} as never,
      origin: 'https://example.test',
      storageBackend: 'OnChain',
    });

    const upload = storage.store([new TextEncoder().encode('retry append'), {
      fileName: 'retry-append.txt',
      contentType: 'text/plain',
    }]);

    await vi.waitFor(() => {
      expect(actorMock.appendUploadChunk).toHaveBeenCalledTimes(1);
    });
    await vi.advanceTimersByTimeAsync(2_000);
    await upload;

    expect(actorMock.appendUploadChunk).toHaveBeenCalledTimes(2);
    expect(actorMock.abortUploadSession).not.toHaveBeenCalled();
    expect(actorMock.finishUploadSession).toHaveBeenCalledTimes(1);
  });

  it('does not retry terminal treasury funding failures', async () => {
    actorMock.appendUploadChunk.mockResolvedValueOnce({
      err: {
        code: { InsufficientCycles: null },
        message:
          'Insufficient storage canister cycles: auto top-up failed: Treasury ICP reserve low: balance 5.76724397 ICP, required debit 0.56828182 ICP, reserve 10 ICP',
      },
    });

    const storage = new EncryptedStorage({
      canisterId,
      agent: {} as never,
      origin: 'https://example.test',
      storageBackend: 'OnChain',
    });

    await expect(storage.store([new TextEncoder().encode('terminal funding'), {
      fileName: 'terminal-funding.txt',
      contentType: 'text/plain',
    }])).rejects.toThrow(/Treasury ICP reserve low/);

    expect(actorMock.appendUploadChunk).toHaveBeenCalledTimes(1);
    expect(actorMock.abortUploadSession).toHaveBeenCalledWith({ batchId: 1n });
    expect(actorMock.finishUploadSession).not.toHaveBeenCalled();
  });
});
