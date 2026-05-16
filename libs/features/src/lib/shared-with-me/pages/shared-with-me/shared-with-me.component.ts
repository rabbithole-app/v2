import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideInbox,
  lucideRefreshCw,
  lucideShare2,
} from '@ng-icons/lucide';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import { SharedStorageCardComponent } from '../../components/shared-storage-card/shared-storage-card.component';
import { SharedWithMeStore } from '../../shared-with-me.store';

@Component({
  selector: 'rbth-feat-shared-with-me',
  imports: [
    NgIcon,
    HlmIcon,
    HlmSpinner,
    SharedStorageCardComponent,
    ...HlmButtonImports,
    ...HlmButtonGroupImports,
    ...HlmEmptyImports,
  ],
  providers: [
    SharedWithMeStore,
    provideIcons({
      lucideInbox,
      lucideRefreshCw,
      lucideShare2,
    }),
  ],
  host: {
    class: 'flex min-h-0 flex-1 flex-col gap-4',
  },
  templateUrl: './shared-with-me.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedWithMeComponent {
  readonly store = inject(SharedWithMeStore);
}
