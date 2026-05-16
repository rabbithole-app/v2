import { computed, Injectable, resource } from '@angular/core';
import type { Principal } from '@icp-sdk/core/principal';

import { injectMainActor, parseCanisterRejectError } from '@rabbithole/core';

import {
  convertSharedStorageView,
  isSharedStorageOpenBlocked,
} from './utils/shared-storage-view';

export type SharedStorageOwnerProfile = {
  avatarSrc?: string;
  title: string;
  username?: string;
};

@Injectable()
export class SharedWithMeStore {
  readonly #actor = injectMainActor();

  readonly sharedStoragesResource = resource({
    params: () => ({ actor: this.#actor() }),
    loader: async ({ params: { actor } }) =>
      (await actor.listSharedWithMeStorageViews()).map(convertSharedStorageView),
  });

  readonly errorMessage = computed(() => {
    const error = this.sharedStoragesResource.error();
    return error
      ? parseCanisterRejectError(error) ?? 'Shared storages failed to load'
      : null;
  });

  readonly isLoading = this.sharedStoragesResource.isLoading;
  isOpenBlocked = isSharedStorageOpenBlocked;
  readonly sharedStorages = computed(() =>
    this.sharedStoragesResource.hasValue()
      ? this.sharedStoragesResource.value()
      : [],
  );
  readonly #ownerPrincipals = computed(() => [
    ...new Map(
      this.sharedStorages().map((storage) => [
        storage.access.accountOwner.toText(),
        storage.access.accountOwner,
      ]),
    ).values(),
  ]);

  readonly #ownerProfiles = resource({
    params: () => ({
      actor: this.#actor(),
      principals: this.#ownerPrincipals(),
    }),
    loader: async ({ params: { actor, principals } }) => {
      if (principals.length === 0) {
        return new Map<string, SharedStorageOwnerProfile>();
      }

      const lookups = await actor.getPublicProfiles(principals);
      return new Map(
        lookups.map(({ principal, profile }) => {
          const principalId = principal.toText();
          const summary = profile[0];
          if (!summary) {
            return [
              principalId,
              { title: this.#shortPrincipal(principal) },
            ] as const;
          }

          const displayName = summary.displayName[0];
          return [
            principalId,
            {
              avatarSrc: summary.avatarUrl[0],
              title: displayName ?? summary.username,
              username: displayName ? summary.username : undefined,
            },
          ] as const;
        }),
      );
    },
    defaultValue: new Map<string, SharedStorageOwnerProfile>(),
  });

  ownerProfile(principal: Principal): SharedStorageOwnerProfile | null {
    return this.#ownerProfiles.value().get(principal.toText()) ?? null;
  }

  reload(): void {
    this.sharedStoragesResource.reload();
  }

  #shortPrincipal(principal: Principal): string {
    const value = principal.toText();
    return value.length > 18
      ? `${value.slice(0, 8)}...${value.slice(-6)}`
      : value;
  }
}
