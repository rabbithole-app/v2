import { computed, Injectable, linkedSignal, resource, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { connect } from 'ngxtension/connect'
import { isNonNullish } from 'remeda';
import {
  distinctUntilChanged,
  exhaustMap,
  filter,
  finalize,
  from,
  interval,
  map,
  repeat,
  share,
  takeUntil,
} from 'rxjs';

import { injectMainActor } from '@rabbithole/core';

import { convertReleasesFullStatus } from '../utils';

const POLLING_INTERVAL_MS = 3000;

@Injectable()
export class ReleasesService {
  readonly #actor = injectMainActor();
  releasesResource = resource({
    params: () => ({ actor: this.#actor() }),
    loader: async ({ params: { actor } }) => {
      const result = await actor.getReleasesFullStatus();
      return convertReleasesFullStatus(result);
    }
  });
  #isLoading = linkedSignal(() => this.releasesResource.isLoading());
  readonly isLoading = this.#isLoading.asReadonly();

  #isPolling = signal(false);
  isPolling = this.#isPolling.asReadonly();
  releases = computed(() =>
    this.releasesResource.hasValue()
      ? this.releasesResource.value().releases
      : []
  );

  constructor() {
    const hasWorkInProgress$ = toObservable(this.releasesResource.value).pipe(
      filter(v => isNonNullish(v)),
      map(status => {
        if (status.pendingDownloads) return true;
        return status.releases.some((release) =>
          release.assets.some((asset) => {
            if (asset.downloadStatus.type === 'Downloading') return true;

            if (
              asset.extractionStatus?.type === 'Decoding' ||
              asset.extractionStatus?.type === 'Idle'
            ) {
              return asset.downloadStatus.type === 'Completed';
            }

            return false;
          }),
        );
      }),
      distinctUntilChanged(),
      share(),
    );
    connect(this.#isPolling, hasWorkInProgress$);
    const on$ = hasWorkInProgress$.pipe(filter(v => v));
    const off$ = hasWorkInProgress$.pipe(filter(v => !v));
    interval(POLLING_INTERVAL_MS).pipe(
      exhaustMap(() => {
        const actor = this.#actor();
        this.#isLoading.set(true);
        return from(actor.getReleasesFullStatus()).pipe(
          map(result => convertReleasesFullStatus(result)),
          finalize(() => this.#isLoading.set(false))
        );
      }),
      takeUntil(off$),
      repeat({ delay: () => on$ }),
      takeUntilDestroyed(),
    ).subscribe((status) => {
      this.releasesResource.set(status);
    });
  }

  /**
   * Reload releases data from backend
   */
  reload(): void {
    this.releasesResource.reload();
  }
}
