import { IDL } from '@icp-sdk/core/candid';
import type { Principal } from '@icp-sdk/core/principal';

import { initEncryptedStorage } from '@rabbithole/declarations';

export type EncryptedStorageInitArgs = {
  owner: Principal;
  vetKeyName: string;
}

/**
 * Encode EncryptedStorageInitArgs to Candid binary format.
 * Uses the IDL definition from generated declarations to ensure type compatibility.
 */
export function encodeStorageInitArgs(args: EncryptedStorageInitArgs): Uint8Array {
  const [InitArgsIDL] = initEncryptedStorage({ IDL });
  return new Uint8Array(IDL.encode([InitArgsIDL], [args]));
}
