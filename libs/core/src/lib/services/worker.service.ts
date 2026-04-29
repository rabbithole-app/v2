import { inject, Injectable, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { map, mergeWith } from 'rxjs/operators';

import { assertWorker } from '../asserts';
import { messageByAction } from '../operators';
import { WORKER, WORKER_FACTORY } from '../tokens';
import { Message, WorkerMessageIn, WorkerMessageOut } from '../types';

@Injectable()
export class WorkerService<
  TIn extends Message<{ [key: string]: unknown }> = WorkerMessageIn,
  TOut extends Message<{ [key: string]: unknown }> = WorkerMessageOut,
> {
  worker = inject(WORKER);
  #workerMessage: Subject<MessageEvent<TOut>> = new Subject();
  workerMessage$ = this.#workerMessage.asObservable();
  #terminate = new Subject<void>();
  workerInited: Signal<boolean> = toSignal(
    this.workerMessage$.pipe(
      messageByAction('worker:init'),
      map(() => true),
      mergeWith(this.#terminate.asObservable().pipe(map(() => false))),
    ),
    { initialValue: false },
  );
  #workerFactory = inject(WORKER_FACTORY, { optional: true });

  constructor() {
    this.init();
  }

  init() {
    if (!this.worker && this.#workerFactory) {
      this.worker = this.#workerFactory();
    }
    assertWorker(this.worker);
    this.worker.onmessage = (event) => this.#workerMessage.next(event);
  }

  postMessage(message: TIn, options?: StructuredSerializeOptions) {
    assertWorker(this.worker);
    this.worker.postMessage(message, options);
  }

  terminate() {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.#terminate.next();
  }
}
