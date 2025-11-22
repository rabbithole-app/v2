import { inject, InjectionToken } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Principal } from '@dfinity/principal';

export const ENCRYPTED_STORAGE_CANISTER_ID = new InjectionToken<Principal>(
  'ENCRYPTED_STORAGE_CANISTER_ID',
);

export const ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER = {
  provide: ENCRYPTED_STORAGE_CANISTER_ID,
  useFactory: () => {
    const route = inject(ActivatedRoute);
    const canisterId = route.snapshot.paramMap.get('id');

    if (!canisterId) {
      throw new Error('Canister ID parameter is required');
    }

    return Principal.fromText(canisterId);
  },
};
