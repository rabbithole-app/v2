import { describe, expect, it, vi } from 'vitest';

import type { RabbitholeActorService } from '@rabbithole/declarations/backend';
import type { EncryptedStorageActorService } from '@rabbithole/declarations/encrypted-storage';

import {
  buildStorageReleaseOptions,
  hasBlockedStorageReleaseOption,
  hasInstallableStorageReleaseOption,
} from './storage-release-options';

describe('buildStorageReleaseOptions', () => {
  it('returns release options in backend-provided order', async () => {
    const actor = createActor([
      releaseOption('storage-v1.0.0-dev', {
        disabled: true,
        disabledReason: ['Compatible from storage-v0.2.0-dev'],
      }),
      releaseOption('storage-v0.2.0-dev', {
        compatibleFrom: ['storage-v0.1.0-dev'],
      }),
      releaseOption('storage-v0.1.1-dev'),
    ]);
    const storageActor = createStorageActor();

    const options = await buildStorageReleaseOptions(
      actor,
      storageActor,
      {} as Parameters<RabbitholeActorService['getStorageUpgradePlan']>[0],
    );

    expect(options.map((option) => option.tagName)).toEqual([
      'storage-v1.0.0-dev',
      'storage-v0.2.0-dev',
      'storage-v0.1.1-dev',
    ]);
    expect(options[0]).toMatchObject({
      disabled: true,
      disabledReason: 'Compatible from storage-v0.2.0-dev',
    });
    expect(options[1]).toMatchObject({
      changelogSections: [
        {
          items: [
            {
              commit: 'abc1234',
              commitUrl: 'https://github.com/rabbithole-app/v2/commit/abc1234',
              text: `${options[1]?.tagName} change`,
            },
          ],
          kind: 'fixes',
          title: 'Fixes',
        },
      ],
      disabled: false,
      releaseNotesSections: [
        {
          items: [`${options[1]?.tagName} release note`],
          title: 'Highlights',
        },
      ],
      releaseNotesSummary: `${options[1]?.tagName} release notes`,
      tagName: 'storage-v0.2.0-dev',
    });
    expect(storageActor.getStorageReleaseState).toHaveBeenCalledTimes(1);
    expect(actor.getStorageUpgradePlan).toHaveBeenCalledTimes(1);
  });

  it('exposes predicates for installable and blocked release options', async () => {
    const actor = createActor([
      releaseOption('storage-v0.2.0-dev'),
      releaseOption('storage-v1.0.0-dev', {
        disabled: true,
        disabledReason: ['Compatible from storage-v0.2.0-dev'],
      }),
    ]);
    const storageActor = createStorageActor();

    const options = await buildStorageReleaseOptions(
      actor,
      storageActor,
      {} as Parameters<RabbitholeActorService['getStorageUpgradePlan']>[0],
    );

    expect(
      options
        .filter(hasInstallableStorageReleaseOption)
        .map((option) => option.tagName),
    ).toEqual(['storage-v0.2.0-dev']);
    expect(
      options
        .filter(hasBlockedStorageReleaseOption)
        .map((option) => option.tagName),
    ).toEqual(['storage-v1.0.0-dev']);
  });

  it('throws when backend options are unavailable', async () => {
    const actor = createActor([releaseOption('storage-v0.1.1-dev')], {
      optionsError: { StorageStateDrift: 'query endpoint is unavailable' },
    });
    const storageActor = createStorageActor();

    await expect(
      buildStorageReleaseOptions(
        actor,
        storageActor,
        {} as Parameters<RabbitholeActorService['getStorageUpgradePlan']>[0],
      ),
    ).rejects.toThrow(
      'The installed storage state differs from the backend record. Refresh releases and try again.',
    );
    expect(storageActor.getStorageReleaseState).toHaveBeenCalledTimes(1);
    expect(actor.getStorageUpgradePlan).toHaveBeenCalledTimes(1);
  });

  it('throws when storage state cannot be read', async () => {
    const actor = createActor([releaseOption('storage-v0.1.1-dev')]);
    const storageActor = createStorageActor(
      new Error('storage canister is unavailable'),
    );

    await expect(
      buildStorageReleaseOptions(
        actor,
        storageActor,
        {} as Parameters<RabbitholeActorService['getStorageUpgradePlan']>[0],
      ),
    ).rejects.toThrow('storage canister is unavailable');
    expect(actor.getStorageUpgradePlan).not.toHaveBeenCalled();
  });
});

type CreateActorOptions = {
  optionsError?: object;
  stateInSync?: boolean;
};

function createActor(
  options: unknown[],
  liveResult: CreateActorOptions = { stateInSync: true },
): RabbitholeActorService {
  return {
    getStorageUpgradePlan: vi.fn(async () =>
      liveResult.optionsError
        ? { err: liveResult.optionsError }
        : {
            ok: {
              options,
              stateInSync: liveResult.stateInSync ?? true,
            },
          },
    ),
  } as unknown as RabbitholeActorService;
}

function createStorageActor(
  error?: Error,
): Pick<EncryptedStorageActorService, 'getStorageReleaseState'> {
  return {
    getStorageReleaseState: vi.fn(async () => {
      if (error) throw error;
      return {
        frontendAssetTreeHash: [],
        installedAt: [],
        manifestHash: [],
        releaseTag: ['storage-v0.1.0'],
        schemaVersion: 1n,
        wasmHash: [],
      };
    }),
  } as unknown as Pick<EncryptedStorageActorService, 'getStorageReleaseState'>;
}

function releaseOption(
  tagName: string,
  overrides: Partial<{
    changelogSections: unknown[];
    changelogSummary: [] | [string];
    compatibleFrom: string[];
    disabled: boolean;
    disabledReason: [] | [string];
    frontendUpdateAvailable: boolean;
    releaseNotesSections: unknown[];
    releaseNotesSummary: [] | [string];
    updateInfo: [] | [unknown];
    version: string;
    wasmUpdateAvailable: boolean;
  }> = {},
): unknown {
  return {
    changelogSections: [
      {
        items: [
          {
            commit: ['abc1234'],
            commitUrl: ['https://github.com/rabbithole-app/v2/commit/abc1234'],
            text: `${tagName} change`,
          },
        ],
        kind: 'fixes',
        title: 'Fixes',
      },
    ],
    changelogSummary: [`${tagName} summary`],
    compatibleFrom: [],
    disabled: false,
    disabledReason: [],
    frontendUpdateAvailable: true,
    releaseNotesSections: [
      {
        items: [`${tagName} release note`],
        title: 'Highlights',
      },
    ],
    releaseNotesSummary: [`${tagName} release notes`],
    tagName,
    updateInfo: [
      {
        availableReleaseTag: [tagName],
        availableWasmHash: [],
        currentReleaseTag: ['storage-v0.1.0-dev'],
        currentWasmHash: [],
        frontendUpdateAvailable: true,
        wasmUpdateAvailable: true,
      },
    ],
    version: tagName.replace(/^storage-v/, ''),
    wasmUpdateAvailable: true,
    ...overrides,
  };
}
