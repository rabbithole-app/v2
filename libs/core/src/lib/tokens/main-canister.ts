import { InjectionToken } from '@angular/core';
import { Principal } from '@icp-sdk/core/principal';

export const MAIN_CANISTER_ID_TOKEN = new InjectionToken<Principal>(
  'MAIN_CANISTER_ID_TOKEN',
);
