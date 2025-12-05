import { InjectionToken } from '@angular/core';
import { Principal } from '@dfinity/principal';

export const MAIN_CANISTER_ID_TOKEN = new InjectionToken<Principal>(
  'MAIN_CANISTER_ID_TOKEN',
);
