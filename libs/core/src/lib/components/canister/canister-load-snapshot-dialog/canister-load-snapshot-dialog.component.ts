import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideAlertTriangle, lucideHistory } from '@ng-icons/lucide';
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

type RestoreSnapshotStatus = 'idle' | 'restoring' | 'starting' | 'stopping';

@Component({
  selector: 'core-canister-load-snapshot-dialog',
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
      lucideHistory,
    }),
  ],
  template: `
    <hlm-dialog-header>
      <h3 hlmDialogTitle>Load Canister Snapshot</h3>
      <p hlmDialogDescription>
        This operation will restore the canister's state from a snapshot,
        including WASM memory, stable memory, certified variables, WASM chunk
        store, and WASM binary. The canister will be temporarily stopped during
        this process.
      </p>
      <div hlmAlert variant="destructive" class="mt-4">
        <ng-icon hlmAlertIcon name="lucideAlertTriangle" />
        <h4 hlmAlertTitle>Warning</h4>
        <p hlmAlertDescription>
          The canister will be stopped during snapshot restoration. All ongoing
          operations will be interrupted. The current state will be replaced
          with the snapshot state. The canister will be automatically restarted
          after the snapshot is loaded.
        </p>
      </div>
    </hlm-dialog-header>
    <hlm-dialog-footer class="mt-4">
      <button
        hlmBtn
        variant="outline"
        brnDialogClose
        [disabled]="restoreStatus() !== 'idle'"
      >
        Cancel
      </button>
      <button
        hlmBtn
        [disabled]="restoreStatus() !== 'idle'"
        (click)="_handleLoadSnapshot()"
      >
        @if (restoreStatus() === 'idle') {
          <ng-icon hlmIcon size="sm" name="lucideHistory" />
          Load Snapshot
        } @else if (restoreStatus() === 'stopping') {
          <hlm-spinner class="size-4" />
          Stopping canister...
        } @else if (restoreStatus() === 'restoring') {
          <hlm-spinner class="size-4" />
          Restoring canister...
        } @else if (restoreStatus() === 'starting') {
          <hlm-spinner class="size-4" />
          Starting canister...
        }
      </button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanisterLoadSnapshotDialogComponent {
  #dialogContext = injectBrnDialogContext<{
    action: () => Promise<void>;
    snapshotId: string;
    state: Signal<RestoreSnapshotStatus>;
  }>();
  restoreStatus = this.#dialogContext.state;
  #dialogRef = inject(BrnDialogRef<boolean | undefined>);

  constructor() {
    // Auto-close dialog when operation completes successfully
    toObservable(this.restoreStatus)
      .pipe(
        pairwise(),
        filter(
          ([previous, current]: [
            RestoreSnapshotStatus,
            RestoreSnapshotStatus,
          ]) => previous !== 'idle' && current === 'idle',
        ),
        observeOn(asyncScheduler, 500),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.#dialogRef.close(true);
      });
  }

  protected async _handleLoadSnapshot() {
    try {
      await this.#dialogContext.action();
    } catch (error) {
      console.error('Failed to load snapshot:', error);
    }
  }
}
