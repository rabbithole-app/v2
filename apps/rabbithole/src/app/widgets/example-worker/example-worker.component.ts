import { Component } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { injectCoreWorker } from '@rabbithole/core';
import { messageByAction } from "@rabbithole/core";

@Component({
  selector: 'app-example-worker',
  templateUrl: `
    <div>
      <h1>Example Worker</h1>
      <button (click)="ping()">Ping</button>
    </div>
  `,
})
export class ExampleWorkerComponent {
  #coreWorkerService = injectCoreWorker();

  constructor() {
    this.#coreWorkerService.workerMessage$
      .pipe(messageByAction('worker:pong'), takeUntilDestroyed())
      .subscribe(() => console.log('pong'));
  }

  ping() {
    this.#coreWorkerService.postMessage({ action: 'worker:ping' });
  }
}