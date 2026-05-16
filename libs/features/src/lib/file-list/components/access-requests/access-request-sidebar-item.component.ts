import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideClock,
  lucideSlash,
  lucideX,
} from '@ng-icons/lucide';

import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmIcon } from '@spartan-ng/helm/icon';

@Component({
  selector: 'rbth-feat-access-request-sidebar-item',
  templateUrl: "./access-request-sidebar-item.component.html",
  host: {
    class: 'flex min-w-0 flex-1 items-center gap-3',
  },
  imports: [HlmBadge, HlmIcon, ...HlmAvatarImports, NgIcon],
  providers: [
    provideIcons({
      lucideCheck,
      lucideClock,
      lucideSlash,
      lucideX,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessRequestSidebarItemComponent {
  readonly avatarSrc = input<string | undefined>();
  readonly relativeTime = input.required<string>();
  readonly statusIconName = input.required<string>();
  readonly statusLabel = input.required<string>();
  readonly title = input.required<string>();
  readonly username = input<string | undefined>();
}
