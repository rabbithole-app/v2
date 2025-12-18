import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert } from '@ng-icons/lucide';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmIcon } from '@spartan-ng/helm/icon';

@Component({
  selector: 'core-frontend-take-ownership-alert',
  imports: [...HlmAlertImports, NgIcon, HlmIcon],
  providers: [provideIcons({ lucideCircleAlert })],
  template: `
    <div hlmAlert variant="destructive">
      <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
      <h4 hlmAlertTitle>No permission to upload assets</h4>
      <div hlmAlertDescription>
        You don't have Commit permission to upload frontend assets to the
        canister. Take ownership to get this permission.
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FrontendTakeOwnershipAlertComponent {}
