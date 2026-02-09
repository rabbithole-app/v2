import {
  effect,
  inject,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject } from 'rxjs';
import { filter, map, mergeWith } from 'rxjs/operators';

import { AUTH_SERVICE } from '@rabbithole/auth';

import { assertWorker } from '../asserts';

@Injectable({
  providedIn: 'root',
})
export class CoreService {
  worker: WritableSignal<Worker | null> = signal(null);
  readonly workerEnabled = true;
  #workerMessage: Subject<MessageEvent> = new Subject();
  workerMessage$: Observable<MessageEvent> = this.#workerMessage.asObservable();
  workerInited: Signal<boolean> = toSignal(
    this.workerMessage$.pipe(
      filter(({ data }) => data.action === 'init'),
      map(() => true),
      mergeWith(
        toObservable(this.worker).pipe(
          filter((worker) => worker === null),
          map(() => false)
        )
      )
    ),
    { initialValue: false }
  );
  #authService = inject(AUTH_SERVICE);

  constructor() {
    effect(() => {
      if (this.#authService.isAuthenticated()) {
        this.#initWorker();
      } else {
        this.#terminate();
      }
    });
    this.workerMessage$
      .pipe(filter(({ data }) => data.action === 'rabbitholeSignOutAuthTimer'))
      .subscribe(() => this.#authService.signOut());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  postMessage(message: any, options?: StructuredSerializeOptions) {
    const worker = this.worker();
    assertWorker(worker);
    worker.postMessage(message, options);
  }

  #initWorker() {
    if (typeof Worker !== 'undefined' && this.workerEnabled) {
      const worker = new Worker(
        new URL('../workers/core.worker', import.meta.url),
        { type: 'module' },
      );
      worker.onmessage = (event) => this.#workerMessage.next(event);
      this.worker.set(worker);
    }
  }

  #terminate() {
    const worker = this.worker();
    if (worker) {
      worker.terminate();
      this.worker.set(null);
    }
  }
}
