import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleSlash,
  lucideClock,
  lucideLockKeyhole,
  lucideRefreshCw,
  lucideSend,
  lucideX,
} from '@ng-icons/lucide';

import { StorageAccessRequest } from '@rabbithole/encrypted-storage';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';

@Component({
  selector: 'rbth-feat-file-list-no-access-empty',
  templateUrl: "./no-access-empty.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-0 flex-1',
  },
  imports: [
    NgIcon,
    ...HlmAlertImports,
    ...HlmEmptyImports,
    HlmButton,
    HlmIcon,
  ],
  providers: [
    provideIcons({
      lucideLockKeyhole,
      lucideClock,
      lucideCheck,
      lucideX,
      lucideCircleSlash,
      lucideRefreshCw,
      lucideSend,
    }),
  ],
})
export class NoAccessEmptyComponent {
  readonly accessRequest = input<StorageAccessRequest | null>(null);
  readonly cancelAccessRequest = output<StorageAccessRequest>();
  readonly cancelling = input(false);
  readonly refreshAccessRequest = output<void>();

  readonly refreshing = input(false);
  readonly reloadStorage = output<void>();
  readonly requestAccess = output<void>();
  readonly submitting = input(false);

  canCreateAccessRequest(): boolean {
    const request = this.accessRequest();
    return (
      !request ||
      'rejected' in request.status ||
      'cancelled' in request.status
    );
  }

  statusIcon(request: StorageAccessRequest): string {
    if ('pending' in request.status) return 'lucideClock';
    if ('approved' in request.status) return 'lucideCheck';
    if ('rejected' in request.status) return 'lucideX';
    return 'lucideCircleSlash';
  }

  statusLabel(request: StorageAccessRequest): string {
    if ('pending' in request.status) return 'Request pending';
    if ('approved' in request.status) return 'Request approved';
    if ('rejected' in request.status) return 'Request rejected';
    return 'Request cancelled';
  }
}
