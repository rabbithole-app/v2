import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert } from '@ng-icons/lucide';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { toast } from 'ngx-sonner';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { injectAssetManager } from '../../../injectors';
import { parseCanisterRejectError } from '../../../utils';
import { UPLOAD_SERVICE_TOKEN } from '../../../tokens';

@Component({
  selector: 'core-commit-permission-warning',
  imports: [
    ...HlmAlertImports,
    ...HlmButtonImports,
    ...HlmSpinnerImports,
    NgIcon,
    HlmIcon,
  ],
  providers: [provideIcons({ lucideCircleAlert })],
  template: `
    <div hlmAlert variant="destructive">
      <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
      <h4 hlmAlertTitle>No permission to upload assets</h4>
      <div hlmAlertDescription>
        You don't have Commit permission to upload frontend assets to the
        canister. You can grant yourself this permission as you are a
        controller.
      </div>
    </div>
    <button
      hlmBtn
      class="mt-4"
      [disabled]="isGrantingPermission()"
      (click)="grantCommitPermission()"
    >
      @if (isGrantingPermission()) {
        <hlm-spinner class="size-4" />
        <span>Granting permission...</span>
      } @else {
        Grant Commit Permission
      }
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommitPermissionWarningComponent {
  readonly isGrantingPermission = signal(false);
  #assetManager = injectAssetManager();
  #authService = inject(AUTH_SERVICE);
  #uploadService = inject(UPLOAD_SERVICE_TOKEN);

  async grantCommitPermission() {
    this.isGrantingPermission.set(true);
    const id = toast.loading('Granting Commit permission...');
    const assetManager = this.#assetManager();
    const principalId = this.#authService.principalId();

    try {
      await assetManager.grantPermission('Commit', principalId);
      toast.success('Commit permission granted successfully', { id });
      this.#uploadService.reloadPermissions();
    } catch (err) {
      const errorMessage =
        parseCanisterRejectError(err) ?? 'An error has occurred';
      toast.error(errorMessage, { id });
    } finally {
      this.isGrantingPermission.set(false);
    }
  }
}
