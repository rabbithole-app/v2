import { InjectionToken } from '@angular/core';

import {
  STORAGE_LICENSE_INCLUDED_BYTES,
  STORAGE_LICENSE_MAX_FILE_BYTES,
} from '../constants/canister-env';

export interface StorageLicenseLimits {
  includedBytes: bigint;
  maxFileBytes: bigint;
}

export const STORAGE_LICENSE_LIMITS_TOKEN =
  new InjectionToken<StorageLicenseLimits>('STORAGE_LICENSE_LIMITS_TOKEN', {
    providedIn: 'root',
    factory: () => ({
      includedBytes: STORAGE_LICENSE_INCLUDED_BYTES,
      maxFileBytes: STORAGE_LICENSE_MAX_FILE_BYTES,
    }),
  });
