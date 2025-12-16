export type {
  CreateProfileArgs,
  ListOptions,
  Profile,
  _SERVICE as RabbitholeActorService,
  UpdateProfileArgs,
} from './backend/rabbithole-backend.did';
export { idlFactory as rabbitholeIdlFactory } from './backend/rabbithole-backend.did';
export type {
  DirectoryColor,
  _SERVICE as EncryptedStorageActorService,
  NodeDetails,
} from './encrypted-storage/encrypted-storage.did';
export { idlFactory as encryptedStorageIdlFactory } from './encrypted-storage/encrypted-storage.did';
