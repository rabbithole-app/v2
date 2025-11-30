import { computed, Injectable, resource, signal } from '@angular/core';
import { ActorSubclass } from '@dfinity/agent';
import { isDeepEqual, isNonNullish } from 'remeda';

import { injectMainActor } from '@rabbithole/core';
import { timeInNanosToDate } from '@rabbithole/core';
import {
  ListOptions,
  Profile as ProfileRaw,
  RabbitholeActorService,
} from '@rabbithole/declarations';

export type Profile = {
  avatarUrl?: string;
  createdAt: Date;
  displayName?: string;
  id: string;
  inviter?: string;
  updatedAt: Date;
  username: string;
};

type State = {
  count: number;
  data: Profile[];
  options: ListOptions;
};

function convertProfile(item: ProfileRaw): Profile {
  return {
    id: item.id.toText(),
    username: item.username,
    createdAt: timeInNanosToDate(item.createdAt),
    updatedAt: timeInNanosToDate(item.updatedAt),
    displayName: isNonNullish(item.displayName)
      ? item.displayName[0]
      : undefined,
    avatarUrl: item.avatarUrl[0] || undefined,
    inviter: item.inviter[0] ? item.inviter[0].toText() : undefined,
  };
}

const INITIAL_VALUE: State = {
  count: 0,
  options: {
    pagination: { offset: 0n, limit: 10n },
    count: true,
    sort: [],
    filter: {
      id: [],
      username: [],
      displayName: [],
      inviter: [],
      createdAt: [],
      avatarUrl: [],
    },
  },
  data: [],
};

@Injectable({ providedIn: 'root' })
export class UsersService {
  actor = injectMainActor();
  #state = signal(INITIAL_VALUE);
  #options = computed(() => this.#state().options);
  list = resource<
    Pick<State, 'count' | 'data'>,
    {
      actor: ActorSubclass<RabbitholeActorService>;
      options: ListOptions;
    }
  >({
    params: () => ({
      actor: this.actor(),
      options: this.#options(),
    }),
    loader: async ({ params: { actor, options } }) => {
      const { data, total } = await actor.listProfiles(options);
      return {
        count: Number(total[0] ?? 0n),
        data: data.map(convertProfile),
      };
    },
    defaultValue: { count: 0, data: [] },
    equal: isDeepEqual,
  });
  state = this.#state.asReadonly();

  setOptions(options: ListOptions) {
    this.#state.update(state => ({
      ...state,
      options,
    }));
  }
}
