import {
  type Actor,
  type CanisterFixture,
  createIdentity,
  type DeferredActor,
  PocketIc,
} from '@dfinity/pic';
import { IDL } from '@icp-sdk/core/candid';
import type { Principal } from '@icp-sdk/core/principal';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest';

import {
  type _SERVICE,
  type ConfigureExternalStorageTargetArgs,
  idlFactory,
} from '../declarations/encrypted-storage/encrypted-storage.did.js';
import { FakeS3 } from './external-s3-harness';
import { encodeStorageCanisterInitArgs } from './storage-canister-init';

export const WASM_PATH = resolve(
  import.meta.dirname,
  '..',
  '.icp',
  'cache',
  'artifacts',
  'encrypted-storage',
);

const ownerIdentity = createIdentity('owner-external-storage');
const aliceIdentity = createIdentity('alice-external-storage');

const FILE = { File: null };
const CREATE_NEW = { CreateNew: null };
const ROOT_HASH_A =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ROOT_HASH_B =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const SHA_256 = new Uint8Array(32).fill(11);
// prepareExternalBlobUpload default URL TTL (900s) + canister session margin (900s)
const UPLOAD_SESSION_EXPIRY_MS = 1_800_000;
const RETRY_BACKOFF_MS = 31_000;

function blobTreeKey(rootHashHex: string): string {
  return `rabbithole/test-canister/v1/blobs/${rootHashHex}/tree.json`;
}

function blobKey(rootHashHex: string): string {
  return `rabbithole/test-canister/v1/blobs/${rootHashHex}/blob.bin`;
}

function externalTargetArgs(
  overrides: Partial<ConfigureExternalStorageTargetArgs> = {},
): ConfigureExternalStorageTargetArgs {
  return {
    region: 'us-east-1',
    displayName: ['Local MinIO'],
    endpoint: 'https://127.0.0.1:9000',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    sessionToken: [],
    prefix: 'rabbithole/test-canister',
    bucket: 'rabbithole-dev',
    targetId: [],
    forcePathStyle: true,
    ...overrides,
  };
}

async function createPic(
  initArgs: Parameters<typeof encodeStorageCanisterInitArgs>[0] = {},
): Promise<[PocketIc, CanisterFixture<_SERVICE>]> {
  const pic = await PocketIc.create(inject('PIC_URL'));
  const fixture = await pic.setupCanister<_SERVICE>({
    arg: encodeStorageCanisterInitArgs(initArgs),
    idlFactory,
    wasm: WASM_PATH,
    sender: ownerIdentity.getPrincipal(),
  });
  return [pic, fixture];
}

describe('External storage', () => {
  let pic: PocketIc;
  let actor: Actor<_SERVICE>;
  let deferredActor: DeferredActor<_SERVICE>;
  let canisterId: Principal;
  let s3: FakeS3;

  function bindFixture(picInstance: PocketIc, fixture: CanisterFixture<_SERVICE>): void {
    pic = picInstance;
    actor = fixture.actor;
    actor.setIdentity(ownerIdentity);
    canisterId = fixture.canisterId;
    deferredActor = pic.createDeferredActor<_SERVICE>(
      idlFactory,
      fixture.canisterId,
    );
    deferredActor.setIdentity(ownerIdentity);
    s3 = new FakeS3(pic);
  }

  beforeEach(async () => {
    const [picInstance, fixture] = await createPic();
    bindFixture(picInstance, fixture);
    await pic.setCertifiedTime(new Date('2029-12-31T00:00:00Z'));
  });

  afterEach(async () => {
    await pic?.tearDown();
  });

  /** Configure with the PUT -> HEAD -> DELETE -> HEAD capability probe answered. */
  async function configureTarget(
    overrides: Partial<ConfigureExternalStorageTargetArgs> = {},
    probeOutcalls = 4,
  ) {
    const finish = await deferredActor.configureExternalStorageTarget(
      externalTargetArgs(overrides),
    );
    await s3.serve(probeOutcalls);
    return await finish();
  }

  async function createFile(path: string): Promise<void> {
    await actor.create({
      entry: [FILE, path],
      createMode: CREATE_NEW,
    });
  }

  async function resolveUploadRoute(path: string) {
    await createFile(path);
    return await actor.resolveUploadRoute({
      entry: [FILE, path],
      size: 123n,
    });
  }

  async function commitExternalBlob(path: string, rootHashHex: string): Promise<void> {
    await actor.commitExternalBlobUpload({
      entry: [FILE, path],
      targetId: [],
      rootHashHex,
      sha256: SHA_256,
      contentType: 'application/octet-stream',
      size: 123n,
    });
  }

  async function commitExternalThumbnail(path: string, rootHashHex: string): Promise<void> {
    const prepared = await actor.prepareThumbnailUpload({
      entry: [FILE, path],
      contentType: 'image/jpeg',
      size: 12n,
    });
    await actor.commitExternalThumbnailUpload({
      entry: [FILE, path],
      targetId: [],
      rootHashHex,
      sha256: SHA_256,
      contentType: 'image/jpeg',
      size: 12n,
      encryption: {
        scopeKeyId: prepared.encryption.scopeKeyId,
        wrappedKey: new Uint8Array([1, 2, 3]),
        blobIv: new Uint8Array([4, 5, 6]),
        algorithm: 'AES-GCM-256+vetkey-wrap-v1',
      },
    });
  }

  async function createCommittedExternalBlob(path: string, rootHashHex: string): Promise<void> {
    await createFile(path);
    await commitExternalBlob(path, rootHashHex);
  }

  async function queueDeleteTask(path: string, rootHashHex = ROOT_HASH_A): Promise<void> {
    await configureTarget();
    await createCommittedExternalBlob(path, rootHashHex);
    await actor.delete({
      entry: [FILE, path],
      recursive: false,
    });
  }

  /** Run the next delete task, answering `outcalls` S3 requests. */
  async function runNextDeleteTask(outcalls: number) {
    const finish = await deferredActor.runNextExternalStorageDeleteTask();
    const served = await s3.serve(outcalls);
    return { result: await finish(), served };
  }

  test('owner-only cleanup APIs reject ordinary callers', async () => {
    await queueDeleteTask('External/private.bin');
    actor.setIdentity(aliceIdentity);

    await expect(actor.listExternalBlobReplicas()).rejects.toThrow(
      /owner-equivalent/,
    );
    await expect(actor.listExternalStorageDeleteTasks()).rejects.toThrow(
      /owner-equivalent/,
    );
    await expect(actor.runNextExternalStorageDeleteTask()).rejects.toThrow(
      /owner-equivalent/,
    );
    await expect(actor.runExternalStorageDeleteTask(0n)).rejects.toThrow(
      /owner-equivalent/,
    );
    await expect(actor.getExternalStorageCleanupStatus()).rejects.toThrow(
      /owner-equivalent/,
    );
    await expect(actor.sweepExternalStorageCleanup()).rejects.toThrow(
      /owner-equivalent/,
    );
    await expect(
      actor.revalidateExternalStorageTarget('external-target-0'),
    ).rejects.toThrow(/owner-equivalent/);
  });

  test('BlobStorage defaults to Caffeine-managed upload route', async () => {
    await pic.tearDown();
    const [picInstance, fixture] = await createPic({
      storageBackendType: { BlobStorage: null },
    });
    bindFixture(picInstance, fixture);

    await expect(resolveUploadRoute('External/caffeine-route.bin')).resolves.toEqual({
      CaffeineBlobStorage: null,
    });
  });

  test('configureExternalStorageTarget validates the bucket with a capability probe', async () => {
    const target = await configureTarget();

    expect(target).toMatchObject({
      id: 'external-target-0',
      status: { Active: null },
      hasCredential: true,
    });
    expect(target.lastValidatedAt).toHaveLength(1);

    // probe: PUT + HEAD(200) + DELETE + HEAD(404) on a throwaway key
    expect(s3.served.map((outcall) => outcall.http_method)).toEqual([
      'PUT',
      'HEAD',
      'DELETE',
      'HEAD',
    ]);
    for (const outcall of s3.served) {
      const url = new URL(outcall.url);
      expect(url.pathname).toContain('/rabbithole-dev/rabbithole/test-canister/v1/_probe/');
      expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    }
    // the probe cleans up after itself
    expect(s3.objects.size).toBe(0);
  });

  // pic-js deferred actors swallow rejections, so expected-to-fail calls are
  // submitted through the raw client whose awaitCall rejects properly.
  async function expectConfigureRejection(
    overrides: Partial<ConfigureExternalStorageTargetArgs>,
    probeOutcalls: number,
  ): Promise<unknown> {
    const service = idlFactory({ IDL });
    const [, func] = service._fields.find(
      ([name]) => name === 'configureExternalStorageTarget',
    )!;
    const client = (
      pic as unknown as {
        client: {
          submitCall(req: {
            canisterId: Principal;
            sender: Principal;
            method: string;
            payload: Uint8Array;
          }): Promise<unknown>;
          awaitCall(messageId: unknown): Promise<unknown>;
        };
      }
    ).client;

    const messageId = await client.submitCall({
      canisterId,
      sender: ownerIdentity.getPrincipal(),
      method: 'configureExternalStorageTarget',
      payload: new Uint8Array(
        IDL.encode(func.argTypes, [externalTargetArgs(overrides)]),
      ),
    });
    await s3.serve(probeOutcalls);
    try {
      await client.awaitCall(messageId);
      throw new Error('configure unexpectedly succeeded');
    } catch (error) {
      return error;
    }
  }

  test('configure fails and stores nothing when the probe is rejected', async () => {
    s3.force.PUT = 403;
    const error = await expectConfigureRejection({}, 1);

    expect((error as Error).message).toMatch(/bucket validation failed.*403/);
    expect(await actor.listExternalStorageTargets()).toEqual([]);
    expect(await actor.getActiveExternalStorageTarget()).toEqual([]);
  });

  test('failed rotation probe keeps the previous credential active', async () => {
    const target = await configureTarget();

    s3.force.HEAD = 403;
    // PUT succeeds, first HEAD is rejected
    const error = await expectConfigureRejection(
      {
        targetId: [target.id],
        accessKeyId: 'rotated-key',
        secretAccessKey: 'rotated-secret',
      },
      2,
    );

    expect((error as Error).message).toMatch(/bucket validation failed.*403/);
    expect(await actor.listExternalStorageTargets()).toMatchObject([
      {
        id: target.id,
        version: 1n,
        status: { Active: null },
        hasCredential: true,
      },
    ]);
  });

  test('connecting a target switches the upload route to external S3', async () => {
    await pic.tearDown();
    const [picInstance, fixture] = await createPic({
      storageBackendType: { BlobStorage: null },
    });
    bindFixture(picInstance, fixture);

    // Managed vault writes to Caffeine until an S3 target is connected.
    await expect(resolveUploadRoute('External/managed.bin')).resolves.toEqual({
      CaffeineBlobStorage: null,
    });

    const target = await configureTarget();
    await expect(resolveUploadRoute('External/external-route.bin')).resolves.toEqual({
      ExternalS3: {
        targetId: target.id,
        targetVersion: target.version,
        layoutVersion: 1n,
        readMode: { PublicEncrypted: null },
        writeMode: { CanisterPresigned: null },
      },
    });
  });

  test('resolveBlobReadRoute returns the committed external replica target', async () => {
    await pic.tearDown();
    const [picInstance, fixture] = await createPic({
      storageBackendType: { BlobStorage: null },
    });
    bindFixture(picInstance, fixture);

    const target = await configureTarget();
    await createCommittedExternalBlob('External/read-route.bin', ROOT_HASH_A);

    await expect(
      actor.resolveBlobReadRoute({
        entry: [FILE, 'External/read-route.bin'],
        version: [],
      }),
    ).resolves.toMatchObject({
      ExternalS3PublicEncrypted: {
        target: {
          id: target.id,
          status: { Active: null },
        },
        locator: {
          treeKey: blobTreeKey(ROOT_HASH_A),
          blobKey: blobKey(ROOT_HASH_A),
        },
      },
    });

    await actor.disableExternalStorageTarget({ targetId: target.id });
    await expect(
      actor.resolveBlobReadRoute({
        entry: [FILE, 'External/read-route.bin'],
        version: [],
      }),
    ).resolves.toMatchObject({
      ExternalS3PublicEncrypted: {
        target: {
          id: target.id,
          status: { Disabled: null },
        },
      },
    });
  });

  test('external thumbnail read route and cleanup use the thumbnail replica', async () => {
    await pic.tearDown();
    const [picInstance, fixture] = await createPic({
      storageBackendType: { BlobStorage: null },
    });
    bindFixture(picInstance, fixture);

    const target = await configureTarget();
    await createFile('External/thumbnail.jpg');
    const prepared = await actor.prepareThumbnailUpload({
      entry: [FILE, 'External/thumbnail.jpg'],
      contentType: 'image/jpeg',
      size: 42n,
    });

    await actor.commitExternalThumbnailUpload({
      entry: [FILE, 'External/thumbnail.jpg'],
      targetId: [],
      rootHashHex: ROOT_HASH_A,
      sha256: SHA_256,
      contentType: 'image/jpeg',
      size: 42n,
      encryption: {
        scopeKeyId: prepared.encryption.scopeKeyId,
        wrappedKey: new Uint8Array([1, 2, 3]),
        blobIv: new Uint8Array(12),
        algorithm: 'AES-GCM-256+vetkey-wrap-v1',
      },
    });

    await expect(
      actor.resolveThumbnailReadRoute({
        entry: [FILE, 'External/thumbnail.jpg'],
        rootHash: ROOT_HASH_A,
      }),
    ).resolves.toMatchObject({
      ExternalS3PublicEncrypted: {
        target: {
          id: target.id,
          status: { Active: null },
        },
        locator: {
          treeKey: blobTreeKey(ROOT_HASH_A),
          blobKey: blobKey(ROOT_HASH_A),
        },
      },
    });

    await actor.delete({
      entry: [FILE, 'External/thumbnail.jpg'],
      recursive: false,
    });

    expect(await actor.listExternalStorageDeleteTasks()).toMatchObject([
      {
        targetId: target.id,
        keys: [blobTreeKey(ROOT_HASH_A), blobKey(ROOT_HASH_A)],
        status: { Pending: null },
      },
    ]);
  });

  test('disabled target is kept in history but cannot be used for new writes', async () => {
    const target = await configureTarget();
    const disabled = await actor.disableExternalStorageTarget({
      targetId: target.id,
    });

    expect(disabled).toMatchObject({
      id: target.id,
      status: { Disabled: null },
      hasCredential: true,
    });
    expect(await actor.getActiveExternalStorageTarget()).toEqual([]);
    expect(await actor.listExternalStorageTargets()).toMatchObject([
      { id: target.id, status: { Disabled: null } },
    ]);

    await createFile('External/disabled-target.bin');
    await expect(
      actor.prepareExternalBlobUpload({
        entry: [FILE, 'External/disabled-target.bin'],
        targetId: [],
        rootHashHex: ROOT_HASH_A,
        size: 123n,
        expiresSeconds: [],
      }),
    ).rejects.toThrow(/active external storage target is not configured/);
    await expect(
      actor.commitExternalBlobUpload({
        entry: [FILE, 'External/disabled-target.bin'],
        targetId: [target.id],
        rootHashHex: ROOT_HASH_A,
        sha256: SHA_256,
        contentType: 'application/octet-stream',
        size: 123n,
      }),
    ).rejects.toThrow(/external storage target is not active/);
  });

  test('cleanup task waits until the last file reference is removed', async () => {
    await configureTarget();
    await createCommittedExternalBlob('External/a.bin', ROOT_HASH_A);
    await createCommittedExternalBlob('External/b.bin', ROOT_HASH_A);
    await createCommittedExternalBlob('External/c.bin', ROOT_HASH_B);

    await actor.delete({
      entry: [FILE, 'External/a.bin'],
      recursive: false,
    });
    expect(await actor.listExternalStorageDeleteTasks()).toHaveLength(0);

    await actor.delete({
      entry: [FILE, 'External/b.bin'],
      recursive: false,
    });

    expect(await actor.listExternalStorageDeleteTasks()).toMatchObject([
      {
        targetId: 'external-target-0',
        keys: [blobTreeKey(ROOT_HASH_A), blobKey(ROOT_HASH_A)],
        status: { Pending: null },
      },
    ]);
    expect(await actor.listExternalBlobReplicas()).toMatchObject([
      {
        rootHashHex: ROOT_HASH_A,
        status: { DeletePending: null },
      },
      {
        rootHashHex: ROOT_HASH_B,
        status: { Active: null },
      },
    ]);
  });

  test('delete task issues per-object DELETE and confirms with HEAD', async () => {
    await queueDeleteTask('External/delete-from-s3.bin');
    s3.objects.add(`/rabbithole-dev/${blobTreeKey(ROOT_HASH_A)}`);
    s3.objects.add(`/rabbithole-dev/${blobKey(ROOT_HASH_A)}`);

    const { result, served } = await runNextDeleteTask(4);

    expect(served.map((outcall) => outcall.http_method)).toEqual([
      'DELETE',
      'DELETE',
      'HEAD',
      'HEAD',
    ]);
    for (const outcall of served) {
      const url = new URL(outcall.url);
      expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
      expect(url.host).toBe('127.0.0.1:9000');
      expect(outcall.max_response_bytes).toBe(4096);
    }
    expect(
      served.map((outcall) => new URL(outcall.url).pathname).slice(0, 2),
    ).toEqual([
      `/rabbithole-dev/${blobTreeKey(ROOT_HASH_A)}`,
      `/rabbithole-dev/${blobKey(ROOT_HASH_A)}`,
    ]);

    expect(result).toMatchObject({
      attempts: 1n,
      keys: [blobTreeKey(ROOT_HASH_A), blobKey(ROOT_HASH_A)],
      status: { Done: null },
    });
    expect(s3.objects.size).toBe(0);
    expect(await actor.listExternalBlobReplicas()).toMatchObject([
      {
        rootHashHex: ROOT_HASH_A,
        status: { Deleted: null },
      },
    ]);
  });

  test('task retries with backoff when the object is still present after DELETE', async () => {
    await queueDeleteTask('External/sticky-object.bin');

    s3.force.HEAD = 200; // object refuses to disappear
    const { result } = await runNextDeleteTask(3); // DELETE, DELETE, HEAD(200)

    expect(result).toMatchObject({
      attempts: 1n,
      status: { Pending: null },
    });
    expect(result.lastError[0]).toMatch(/still present after DELETE/);

    // backoff: not runnable until nextAttemptAt
    await expect(actor.runNextExternalStorageDeleteTask()).rejects.toThrow(
      /no runnable external storage delete task/,
    );

    await pic.advanceTime(RETRY_BACKOFF_MS);
    await pic.tick();
    delete s3.force.HEAD;

    const { result: retried } = await runNextDeleteTask(4);
    expect(retried).toMatchObject({
      attempts: 2n,
      status: { Done: null },
    });
  });

  test('auth failure pauses the target queue until revalidation succeeds', async () => {
    await queueDeleteTask('External/credential-failure.bin');

    s3.force.DELETE = 403;
    const { result } = await runNextDeleteTask(1);

    expect(result).toMatchObject({
      attempts: 1n,
      status: { Pending: null },
    });
    expect(result.lastError[0]).toMatch(/credential failure/);
    expect(await actor.listExternalStorageTargets()).toMatchObject([
      { id: 'external-target-0', status: { CredentialFailed: null } },
    ]);

    // queue is paused for the credential-failed target even after the backoff
    await pic.advanceTime(RETRY_BACKOFF_MS);
    await pic.tick();
    await expect(actor.runNextExternalStorageDeleteTask()).rejects.toThrow(
      /no runnable external storage delete task/,
    );

    delete s3.force.DELETE;
    const finishRevalidate = await deferredActor.revalidateExternalStorageTarget(
      'external-target-0',
    );
    await s3.serve(4); // capability probe
    await expect(finishRevalidate()).resolves.toMatchObject({
      status: { Active: null },
    });

    const { result: retried } = await runNextDeleteTask(4);
    expect(retried).toMatchObject({
      attempts: 2n,
      status: { Done: null },
    });
  });

  test('re-upload of the same content cancels the pending delete task', async () => {
    await queueDeleteTask('External/reupload.bin');
    expect(await actor.listExternalStorageDeleteTasks()).toMatchObject([
      { status: { Pending: null } },
    ]);

    await createCommittedExternalBlob('External/reupload-again.bin', ROOT_HASH_A);

    expect(await actor.listExternalStorageDeleteTasks()).toMatchObject([
      { status: { Cancelled: null } },
    ]);
    expect(await actor.listExternalBlobReplicas()).toMatchObject([
      {
        rootHashHex: ROOT_HASH_A,
        status: { Active: null },
      },
    ]);
    await expect(actor.runNextExternalStorageDeleteTask()).rejects.toThrow(
      /no runnable external storage delete task/,
    );
  });

  test('expired upload session without a commit is swept into a delete task', async () => {
    await configureTarget();
    await createFile('External/orphan.bin');
    await actor.prepareExternalBlobUpload({
      entry: [FILE, 'External/orphan.bin'],
      targetId: [],
      rootHashHex: ROOT_HASH_A,
      size: 123n,
      expiresSeconds: [],
    });

    // not expired yet
    let status = await actor.sweepExternalStorageCleanup();
    expect(status.pendingUploadSessions).toBe(1n);
    expect(await actor.listExternalStorageDeleteTasks()).toHaveLength(0);

    await pic.advanceTime(UPLOAD_SESSION_EXPIRY_MS + 1_000);
    await pic.tick();

    status = await actor.sweepExternalStorageCleanup();
    expect(status.pendingUploadSessions).toBe(0n);
    expect(await actor.listExternalStorageDeleteTasks()).toMatchObject([
      {
        rootHashHex: ROOT_HASH_A,
        replicaId: [],
        keys: [blobTreeKey(ROOT_HASH_A), blobKey(ROOT_HASH_A)],
        status: { Pending: null },
      },
    ]);

    // the orphaned objects are removed from the bucket
    s3.objects.add(`/rabbithole-dev/${blobTreeKey(ROOT_HASH_A)}`);
    s3.objects.add(`/rabbithole-dev/${blobKey(ROOT_HASH_A)}`);
    const { result } = await runNextDeleteTask(4);
    expect(result).toMatchObject({ status: { Done: null } });
    expect(s3.objects.size).toBe(0);
  });

  test('committed upload session is consumed and never swept', async () => {
    await configureTarget();
    await createFile('External/committed.bin');
    await actor.prepareExternalBlobUpload({
      entry: [FILE, 'External/committed.bin'],
      targetId: [],
      rootHashHex: ROOT_HASH_A,
      size: 123n,
      expiresSeconds: [],
    });
    await commitExternalBlob('External/committed.bin', ROOT_HASH_A);

    await pic.advanceTime(UPLOAD_SESSION_EXPIRY_MS + 1_000);
    await pic.tick();

    const status = await actor.sweepExternalStorageCleanup();
    expect(status.pendingUploadSessions).toBe(0n);
    expect(await actor.listExternalStorageDeleteTasks()).toHaveLength(0);
  });

  test('delete queues external S3 cleanup for both file content and thumbnail blobs', async () => {
    await pic.tearDown();
    const [picInstance, fixture] = await createPic({
      storageBackendType: { BlobStorage: null },
    });
    bindFixture(picInstance, fixture);

    const path = 'External/delete-image-with-thumbnail.jpg';
    await configureTarget();
    await createCommittedExternalBlob(path, ROOT_HASH_A);
    await commitExternalThumbnail(path, ROOT_HASH_B);

    await actor.delete({
      entry: [FILE, path],
      recursive: false,
    });

    expect(await actor.listExternalStorageDeleteTasks()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keys: [blobTreeKey(ROOT_HASH_A), blobKey(ROOT_HASH_A)],
          status: { Pending: null },
        }),
        expect.objectContaining({
          keys: [blobTreeKey(ROOT_HASH_B), blobKey(ROOT_HASH_B)],
          status: { Pending: null },
        }),
      ]),
    );
  });

  test('disconnect removes an empty target and reverts the vault to managed storage', async () => {
    await pic.tearDown();
    const [picInstance, fixture] = await createPic({
      storageBackendType: { BlobStorage: null },
    });
    bindFixture(picInstance, fixture);

    const target = await configureTarget();
    await createCommittedExternalBlob('External/disconnect.bin', ROOT_HASH_A);

    // Live replica blocks disconnect.
    await expect(
      actor.disconnectExternalStorageTarget({ targetId: target.id }),
    ).rejects.toThrow(/still holds data/);

    await actor.delete({
      entry: [FILE, 'External/disconnect.bin'],
      recursive: false,
    });

    // The replica is DeletePending until cleanup confirms removal.
    await expect(
      actor.disconnectExternalStorageTarget({ targetId: target.id }),
    ).rejects.toThrow(/still holds data/);

    const { result } = await runNextDeleteTask(4);
    expect(result).toMatchObject({ status: { Done: null } });

    await actor.disconnectExternalStorageTarget({ targetId: target.id });

    expect(await actor.listExternalStorageTargets()).toEqual([]);
    expect(await actor.getActiveExternalStorageTarget()).toEqual([]);
    expect(await actor.listExternalBlobReplicas()).toEqual([]);
    expect(await actor.listExternalStorageDeleteTasks()).toEqual([]);

    // The vault falls back to managed Caffeine storage.
    await expect(resolveUploadRoute('External/after-disconnect.bin')).resolves.toEqual({
      CaffeineBlobStorage: null,
    });
  });

  test('disconnecting the active target repoints writes to a remaining target', async () => {
    await pic.tearDown();
    const [picInstance, fixture] = await createPic({
      storageBackendType: { BlobStorage: null },
    });
    bindFixture(picInstance, fixture);

    const first = await configureTarget();
    const second = await configureTarget({
      displayName: ['Second bucket'],
      bucket: 'second-bucket',
    });

    // Newest configured target is the active pointer.
    expect(await actor.getActiveExternalStorageTarget()).toMatchObject([
      { id: second.id },
    ]);

    // Disconnecting the active target (empty) falls back to the other one
    // instead of blocking uploads.
    await actor.disconnectExternalStorageTarget({ targetId: second.id });

    expect(await actor.getActiveExternalStorageTarget()).toMatchObject([
      { id: first.id },
    ]);
    await expect(resolveUploadRoute('External/after-repoint.bin')).resolves.toMatchObject({
      ExternalS3: { targetId: first.id },
    });

    // Disconnecting the last target reverts to managed Caffeine storage.
    await actor.disconnectExternalStorageTarget({ targetId: first.id });
    await expect(resolveUploadRoute('External/managed-fallback.bin')).resolves.toEqual({
      CaffeineBlobStorage: null,
    });
  });

  test('cleanup status summarizes queue, replicas, and blocked targets', async () => {
    await queueDeleteTask('External/status.bin');

    const status = await actor.getExternalStorageCleanupStatus();
    expect(status).toMatchObject({
      pendingTasks: 1n,
      runningTasks: 0n,
      doneTasks: 0n,
      cancelledTasks: 0n,
      deletePendingReplicas: 1n,
      activeReplicas: 0n,
      missingReplicas: 0n,
      credentialBlockedTargetIds: [],
    });
    expect(status.nextAttemptAt).toHaveLength(1);
  });

  test('runNextExternalStorageDeleteTask rejects when no cleanup task is runnable', async () => {
    await expect(actor.runNextExternalStorageDeleteTask()).rejects.toThrow(
      /no runnable external storage delete task/,
    );
    await expect(actor.runExternalStorageDeleteTask(999n)).rejects.toThrow(
      /external storage delete task not found/,
    );
  });
});
