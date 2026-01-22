import { computed, Injectable, signal } from '@angular/core';
import { toBigIntNanoSeconds } from '@dfinity/utils';
import { endOfMonth, startOfMonth, subDays } from 'date-fns';
import { isNonNullish } from 'remeda';

import {
  ListOptions,
  Profile as ProfileRaw,
  RabbitholeActorService,
} from '@rabbithole/declarations';

import { timeInNanosToDate } from '../../../utils';

export interface DateFilter {
  max?: Date;
  min?: Date;
}

export interface Profile {
  avatarUrl?: string;
  createdAt: Date;
  displayName?: string;
  id: string;
  inviter?: string;
  updatedAt: Date;
  username: string;
}

export interface UsersTableState {
  data: Profile[];
  error: string | null;
  loading: boolean;
  totalCount: number;
}

function convertProfile(item: ProfileRaw): Profile {
  return {
    id: item.id.toText(),
    username: item.username,
    createdAt: timeInNanosToDate(item.createdAt),
    updatedAt: timeInNanosToDate(item.updatedAt),
    displayName: isNonNullish(item.displayName)
      ? item.displayName[0]
      : undefined,
    avatarUrl: isNonNullish(item.avatarUrl) ? item.avatarUrl[0] : undefined,
    inviter: item.inviter[0] ? item.inviter[0].toText() : undefined,
  };
}

@Injectable()
export class UsersTableService {
  private readonly _filters = signal<{
    dateFilter: DateFilter | null;
    pageIndex: number;
    pageSize: number;
    search: string;
  }>({
    search: '',
    dateFilter: null,
    pageSize: 10,
    pageIndex: 0,
  });

  readonly filters = this._filters.asReadonly();

  private readonly _sorting = signal<{
    direction: 'asc' | 'desc';
    field: string;
  }>({
    field: 'createdAt',
    direction: 'desc',
  });

  readonly listOptions = computed(() => {
    const filters = this._filters();
    const sorting = this._sorting();

    const options: ListOptions = {
      pagination: {
        offset: BigInt(filters.pageIndex * filters.pageSize),
        limit: BigInt(filters.pageSize),
      },
      count: true,
      sort: [
        [
          sorting.field,
          sorting.direction === 'asc'
            ? { Ascending: null }
            : { Descending: null },
        ],
      ],
      filter: {
        id: [],
        username: filters.search ? [filters.search] : [],
        displayName: [],
        inviter: [],
        createdAt: filters.dateFilter
          ? [
              {
                min: filters.dateFilter.min
                  ? [toBigIntNanoSeconds(filters.dateFilter.min)]
                  : [],
                max: filters.dateFilter.max
                  ? [toBigIntNanoSeconds(filters.dateFilter.max)]
                  : [],
              },
            ]
          : [],
        avatarUrl: [],
      },
    };

    return options;
  });
  readonly sorting = this._sorting.asReadonly();
  private readonly _state = signal<UsersTableState>({
    data: [],
    totalCount: 0,
    loading: false,
    error: null,
  });

  readonly state = this._state.asReadonly();

  clearDateFilter() {
    this.setDateFilter(null);
  }

  async loadProfiles(actor: RabbitholeActorService) {
    this.setLoading(true);
    this.setError(null);

    try {
      const options = this.listOptions();
      const response = await actor.listProfiles(options);

      const profiles = response.data.map(convertProfile);
      const totalCount = Number(response.total[0] ?? 0n);

      this.setData(profiles, totalCount);
    } catch (error) {
      this.setError(
        error instanceof Error ? error.message : 'Failed to load profiles',
      );
    } finally {
      this.setLoading(false);
    }
  }

  setCurrentMonthFilter() {
    const now = new Date();
    const min = startOfMonth(now);
    const max = endOfMonth(now);
    this.setDateFilter({ min, max });
  }

  setData(data: Profile[], totalCount: number) {
    this._state.update((state) => ({
      ...state,
      data,
      totalCount,
      error: null,
    }));
  }

  setDateFilter(dateFilter: DateFilter | null) {
    this._filters.update((filters) => ({ ...filters, dateFilter }));
  }

  setError(error: string | null) {
    this._state.update((state) => ({ ...state, error }));
  }

  // Utilities for date filtering
  setLastDaysFilter(days: number) {
    const max = new Date();
    const min = subDays(max, days);
    this.setDateFilter({ min, max });
  }

  setLoading(loading: boolean) {
    this._state.update((state) => ({ ...state, loading }));
  }

  setPageIndex(pageIndex: number) {
    this._filters.update((filters) => ({ ...filters, pageIndex }));
  }

  setPageSize(pageSize: number) {
    this._filters.update((filters) => ({ ...filters, pageSize, pageIndex: 0 }));
  }

  setSearch(search: string) {
    this._filters.update((filters) => ({ ...filters, search }));
  }

  setSorting(field: string, direction: 'asc' | 'desc') {
    this._sorting.set({ field, direction });
  }
}
