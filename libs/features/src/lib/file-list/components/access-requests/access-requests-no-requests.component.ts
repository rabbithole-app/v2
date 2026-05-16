import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideInbox } from '@ng-icons/lucide';

import { HlmEmptyImports } from '@spartan-ng/helm/empty';

@Component({
  selector: 'rbth-feat-access-requests-no-requests',
  template: `
    <section
      class="-mx-4 -my-6 flex min-h-[calc(100vh-3.5rem)] flex-1 items-center justify-center sm:-mx-6"
    >
      <div hlmEmpty class="min-h-[420px]">
        <div hlmEmptyHeader>
          <div hlmEmptyMedia variant="icon">
            <ng-icon name="lucideInbox" />
          </div>
          <div hlmEmptyTitle>No access requests</div>
          <div hlmEmptyDescription>
            Requests from users with this storage URL will appear here.
          </div>
        </div>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...HlmEmptyImports, NgIcon],
  providers: [provideIcons({ lucideInbox })],
})
export class AccessRequestsNoRequestsComponent {}
