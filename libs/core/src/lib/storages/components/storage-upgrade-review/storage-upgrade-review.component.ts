import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCamera,
  lucideCircleAlert,
  lucideExternalLink,
  lucideGlobe,
  lucideListChecks,
  lucidePackage,
  lucideShieldCheck,
} from '@ng-icons/lucide';

import { RbthTransparentSelectBackdropDirective } from '@rabbithole/ui/data-table-filter';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmSelectImports } from '@spartan-ng/helm/select';

import type { UpdateInfo } from '../../types/storage.types';
import type { StorageReleaseOption } from '../../utils/storage-release-options';

@Component({
  selector: 'rbth-core-storage-upgrade-review',
  imports: [
    NgIcon,
    HlmBadge,
    HlmIcon,
    RbthTransparentSelectBackdropDirective,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ...HlmItemImports,
    ...HlmSelectImports,
  ],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideExternalLink,
      lucideGlobe,
      lucideListChecks,
      lucidePackage,
      lucideShieldCheck,
      lucideCamera,
    }),
  ],
  templateUrl: './storage-upgrade-review.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageUpgradeReviewComponent {
  readonly canisterManagementHref = input<string | null>(null);

  readonly currentReleaseTag = input<string | null>(null);
  readonly selectedReleaseOption = input<StorageReleaseOption | undefined>();
  readonly hasInstallableRelease = computed(
    () => !!this.selectedReleaseOption()?.updateInfo,
  );
  readonly releaseOptions = input<readonly StorageReleaseOption[]>([]);
  readonly releaseOptionsLoading = input(false);
  readonly releaseTagChange = output<string | null>();
  readonly selectedReleaseNotesSections = computed(
    () =>
      this.selectedReleaseOption()?.releaseNotesSections.filter(
        (section) => section.items.length > 0,
      ) ?? [],
  );
  readonly selectedReleaseNotesSummary = computed(
    () => this.selectedReleaseOption()?.releaseNotesSummary,
  );
  readonly selectedReleaseTag = input<string | null>(null);
  readonly selectedUpdateInfo = input<UpdateInfo | undefined>();
  readonly selectId = input('storage-release-select');

  readonly snapshotsGuideHref =
    'https://docs.internetcomputer.org/guides/canister-management/snapshots/';

  selectRelease(releaseTag: string | null): void {
    this.releaseTagChange.emit(releaseTag);
  }
}
