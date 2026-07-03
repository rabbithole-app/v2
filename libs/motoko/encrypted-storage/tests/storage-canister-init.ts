import { IDL } from '@icp-sdk/core/candid';

type StorageBackend = { OnChain: null } | { BlobStorage: null };

export function encodeStorageCanisterInitArgs(args: {
  storageBackendType?: StorageBackend;
} = {}): Uint8Array {
  const storageBackend = IDL.Variant({
    OnChain: IDL.Null,
    BlobStorage: IDL.Null,
  });
  const initArgs = IDL.Opt(IDL.Record({
    storageBackendType: IDL.Opt(storageBackend),
  }));

  return IDL.encode([initArgs], [[{
    storageBackendType: args.storageBackendType
      ? [args.storageBackendType]
      : [],
  }]]);
}
