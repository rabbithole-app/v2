import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMousePointerClick } from '@ng-icons/lucide';

import { HlmEmptyImports } from '@spartan-ng/helm/empty';

@Component({
  selector: 'rbth-feat-access-requests-empty',
  template: `
    <div hlmEmpty class="min-h-full">
      <div hlmEmptyHeader>
        <div hlmEmptyMedia variant="icon">
          <ng-icon name="lucideMousePointerClick" />
        </div>
        <div hlmEmptyTitle>Select a request</div>
        <div hlmEmptyDescription>
          Choose a request from the list to review the message, requester and access scope.
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...HlmEmptyImports, NgIcon],
  providers: [provideIcons({ lucideMousePointerClick })],
})
export class AccessRequestsEmptyComponent {}
