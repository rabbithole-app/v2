import { InjectionToken } from '@angular/core';
import { Principal } from '@dfinity/principal';

export const ENCRYPTED_STORAGE_CANISTER_ID = new InjectionToken<Principal>(
  'ENCRYPTED_STORAGE_CANISTER_ID',
);
