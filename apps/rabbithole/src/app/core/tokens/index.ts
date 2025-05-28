import { InjectionToken } from '@angular/core';
import { Principal } from '@dfinity/principal';

export const ASSETS_CANISTER_ID = new InjectionToken<Principal>(
  'ASSETS_CANISTER_ID'
);
