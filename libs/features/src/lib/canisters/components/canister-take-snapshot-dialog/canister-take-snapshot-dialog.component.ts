import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideAlertTriangle, lucideCamera } from '@ng-icons/lucide';
import {
  BrnDialogClose,
  BrnDialogRef,
  injectBrnDialogContext,
} from '@spartan-ng/brain/dialog';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { asyncScheduler } from 'rxjs';
import { filter, observeOn, pairwise } from 'rxjs/operators';

type TakeSnapshotStatus = 'idle' | 'starting' | 'stopping' | 'taking';

@Component({
  selector: 'rbth-feat-canisters-canister-take-snapshot-dialog',
  imports: [
    BrnDialogClose,
    HlmButton,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmSpinner,
    HlmIcon,
    NgIcon,
    ...HlmAlertImports,
  ],
  providers: [
    provideIcons({
      lucideAlertTriangle,
      lucideCamera,
    }),
  ],
  template: `
    <hlm-dialog-header>
      <h3 hlmDialogTitle>Take Canister Snapshot</h3>
      <p hlmDialogDescription>
        This operation will create a snapshot of the canister's state, including
        WASM memory, stable memory, certified variables, WASM chunk store, and
        WASM binary. The canister will be temporarily stopped during this
        process.
      </p>
      <div hlmAlert variant="destructive" class="mt-4">
        <ng-icon hlmAlertIcon name="lucideAlertTriangle" />
        <h4 hlmAlertTitle>Warning</h4>
        <p hlmAlertDescription>
          The canister will be stopped during snapshot creation. All ongoing
          operations will be interrupted. The canister will be automatically
          restarted after the snapshot is created.
        </p>
      </div>
    </hlm-dialog-header>
    <hlm-dialog-footer class="mt-4">
      <button
        hlmBtn
        variant="outline"
        brnDialogClose
        [disabled]="takeStatus() !== 'idle'"
      >
        Cancel
      </button>
      <button
        hlmBtn
        [disabled]="takeStatus() !== 'idle'"
        (click)="_handleTakeSnapshot()"
      >
        @if (takeStatus() === 'idle') {
          <ng-icon hlmIcon size="sm" name="lucideCamera" />
          Take Snapshot
        } @else if (takeStatus() === 'stopping') {
          <hlm-spinner class="size-4" />
          Stopping canister...
        } @else if (takeStatus() === 'taking') {
          <hlm-spinner class="size-4" />
          Creating snapshot...
        } @else if (takeStatus() === 'starting') {
          <hlm-spinner class="size-4" />
          Starting canister...
        }
      </button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanisterTakeSnapshotDialogComponent {
  #dialogContext = injectBrnDialogContext<{
    action: () => Promise<void>;
    snapshotId?: string;
    state: Signal<TakeSnapshotStatus>;
  }>();
  takeStatus = this.#dialogContext.state;
  #dialogRef = inject(BrnDialogRef<boolean | undefined>);

  constructor() {
    // Auto-close dialog when operation completes successfully
    toObservable(this.takeStatus)
      .pipe(
        pairwise(),
        filter(
          ([previous, current]: [TakeSnapshotStatus, TakeSnapshotStatus]) =>
            previous !== 'idle' && current === 'idle',
        ),
        observeOn(asyncScheduler, 500),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.#dialogRef.close(true);
      });
  }

  protected async _handleTakeSnapshot() {
    try {
      await this.#dialogContext.action();
    } catch (error) {
      console.error('Failed to take snapshot:', error);
    }
  }
}
