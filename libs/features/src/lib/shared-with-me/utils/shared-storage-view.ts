import { fromNullable } from '@dfinity/utils';
import type { Principal } from '@icp-sdk/core/principal';

import {
  convertCreationStatus,
  type StorageCreationStatus,
  timeInNanosToDate,
} from '@rabbithole/core';
import type {
  AccessClass,
  AccessSource,
  SharedStorageAccess,
  SharedStorageAccessView as SharedStorageAccessViewCandid,
} from '@rabbithole/declarations/backend';

export type SharedStorageView = {
  access: SharedStorageAccess;
  activeAccessClasses: AccessClass[];
  firstSeenAt: Date;
  lastSource?: AccessSource;
  pendingAccessClasses: AccessClass[];
  storageCanisterId: Principal;
  storageStatus?: StorageCreationStatus;
  updatedAt: Date;
};

export function convertSharedStorageView(
  view: SharedStorageAccessViewCandid,
): SharedStorageView {
  const storageStatus = fromNullable(view.storageStatus);
  return {
    access: view.access,
    activeAccessClasses: view.access.activeAccessClasses,
    firstSeenAt: timeInNanosToDate(view.access.firstSeenAt),
    lastSource: fromNullable(view.access.lastSource),
    pendingAccessClasses: view.access.pendingAccessClasses,
    storageCanisterId: view.access.storageCanisterId,
    storageStatus: storageStatus
      ? convertCreationStatus(storageStatus)
      : undefined,
    updatedAt: timeInNanosToDate(view.access.updatedAt),
  };
}

export function isSharedStorageOpenBlocked(view: SharedStorageView): boolean {
  switch (view.storageStatus?.type) {
    case 'InstallingWasm':
    case 'ReinstallingWasm':
    case 'RevokingInstallerPermission':
    case 'UpdatingControllers':
    case 'UpgradingFrontend':
    case 'UpgradingWasm':
    case 'UploadingFrontend':
      return true;
    default:
      return false;
  }
}
