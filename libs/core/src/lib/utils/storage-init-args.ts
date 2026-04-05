import { toNullable } from '@dfinity/utils';
import { IDL } from '@icp-sdk/core/candid';
import { Principal } from '@icp-sdk/core/principal';

import { type StorageBackend, initEncryptedStorage } from '@rabbithole/declarations';

import type { ExtractVariantKeys } from '../types';

export type StorageBackendType = ExtractVariantKeys<StorageBackend>;

export type EncryptedStorageInitArgs = {
  owner: Principal;
  storageBackendType?: StorageBackendType;
}

/**
 * Encode EncryptedStorageInitArgs to Candid binary format.
 * Uses the IDL definition from generated declarations to ensure type compatibility.
 *
 * Note: vetKeyName, backendId, and cashierCanisterId are now set via
 * environment variables on the storage canister (not init args).
 */
export function encodeStorageInitArgs(args: EncryptedStorageInitArgs): Uint8Array {
  const [InitArgsIDL] = initEncryptedStorage({ IDL });

  const storageBackendVariant = args.storageBackendType
    ? { [args.storageBackendType]: null } as StorageBackend
    : undefined;

  const candidArgs = {
    owner: args.owner,
    storageBackendType: toNullable(storageBackendVariant),
  };

  return new Uint8Array(IDL.encode([InitArgsIDL], [candidArgs]));
}
