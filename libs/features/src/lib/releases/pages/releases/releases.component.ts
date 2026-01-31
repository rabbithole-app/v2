import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideInbox, lucideRefreshCw } from '@ng-icons/lucide';

import { HlmButton } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import { ReleaseCardComponent } from '../../components';
import { ReleasesService } from '../../services';

@Component({
  selector: 'rbth-feat-releases',
  imports: [
    NgIcon,
    HlmIcon,
    HlmButton,
    HlmSpinner,
    ...HlmEmptyImports,
    ReleaseCardComponent,
    NgTemplateOutlet
  ],
  providers: [
    ReleasesService,
    provideIcons({
      lucideInbox,
      lucideRefreshCw,
    }),
  ],
  host: {
    class: 'space-y-4',
  },
  templateUrl: './releases.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleasesComponent {
  readonly #releasesService = inject(ReleasesService);
  readonly isLoading = this.#releasesService.isLoading;
  readonly isPolling = this.#releasesService.isPolling;
  readonly releases = this.#releasesService.releases;

  refresh(): void {
    this.#releasesService.reload();
  }
}
