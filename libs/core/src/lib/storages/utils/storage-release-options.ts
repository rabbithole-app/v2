import { fromNullable } from '@dfinity/utils';
import type { Principal } from '@icp-sdk/core/principal';

import type { RabbitholeActorService } from '@rabbithole/declarations/backend';
import type { EncryptedStorageActorService } from '@rabbithole/declarations/encrypted-storage';

import type { UpdateInfo } from '../types/storage.types';
import { convertUpdateInfo } from './storage-converters';

export type StorageReleaseNoteSection = {
  items: string[];
  title: string;
};
export type StorageReleaseOption = {
  compatibleFrom: string[];
  disabled: boolean;
  disabledReason?: string;
  frontendUpdateAvailable: boolean;
  releaseNotesSections: StorageReleaseNoteSection[];
  releaseNotesSummary?: string;
  tagName: string;
  releaseUrl: string;
  updateInfo?: UpdateInfo;
  version: string;
  wasmUpdateAvailable: boolean;
};

export type StorageReleaseState = Awaited<
  ReturnType<EncryptedStorageActorService['getStorageReleaseState']>
>;

type CandidStorageReleaseOption = Extract<
  StorageUpgradePlanResult,
  { ok: unknown }
>['ok']['options'][number];

type StorageReleaseStateReader = Pick<
  EncryptedStorageActorService,
  'getStorageReleaseState'
>;

type StorageUpgradePlanResult = Awaited<
  ReturnType<RabbitholeActorService['getStorageUpgradePlan']>
>;

export async function buildStorageReleaseOptions(
  actor: RabbitholeActorService,
  storageActor: StorageReleaseStateReader,
  canisterId: Principal,
): Promise<StorageReleaseOption[]> {
  const storageState = await storageActor.getStorageReleaseState();
  const result = await actor.getStorageUpgradePlan(canisterId, storageState);

  if ('err' in result) {
    throw new Error(formatUpgradeStorageError(upgradeErrorKey(result.err)));
  }

  return result.ok.options.map(convertStorageReleaseOption);
}

export function formatUpgradeStorageError(errorKey: string): string {
  const errorMessages: Record<string, string> = {
    AlreadyUpgrading: 'An upgrade is already in progress',
    NoUpdateAvailable: 'No update available',
    NotCompleted: 'Storage is not ready for upgrade',
    NotFound: 'Storage not found',
    NotOwner: 'You are not the owner of this storage',
    ReleaseNotCompatible:
      'This release is not compatible with the installed storage version.',
    ReleaseNotReady: 'The selected release is not ready for installation.',
    StorageStateDrift:
      'The installed storage state differs from the backend record. Refresh releases and try again.',
    UpToDate: 'Storage is already up to date',
  };

  return errorMessages[errorKey] ?? errorKey;
}

export function hasBlockedStorageReleaseOption(
  option: StorageReleaseOption,
): boolean {
  return option.disabled && !!option.disabledReason;
}

export function hasInstallableStorageReleaseOption(
  option: StorageReleaseOption,
): boolean {
  return !option.disabled && !!option.updateInfo;
}

function convertStorageReleaseOption(
  option: CandidStorageReleaseOption,
): StorageReleaseOption {
  const updateInfo = fromNullable(option.updateInfo);

  return {
    compatibleFrom: option.compatibleFrom,
    disabled: option.disabled,
    disabledReason: fromNullable(option.disabledReason),
    frontendUpdateAvailable: option.frontendUpdateAvailable,
    releaseNotesSections: option.releaseNotesSections.map((section) => ({
      items: [...section.items],
      title: section.title,
    })),
    releaseNotesSummary: fromNullable(option.releaseNotesSummary),
    tagName: option.tagName,
    releaseUrl: option.releaseUrl,
    updateInfo: updateInfo ? convertUpdateInfo(updateInfo) : undefined,
    version: option.version,
    wasmUpdateAvailable: option.wasmUpdateAvailable,
  };
}

function upgradeErrorKey(error: object): string {
  return Object.keys(error)[0] ?? 'StorageStateDrift';
}
