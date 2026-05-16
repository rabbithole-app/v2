import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCalendar,
  lucideChevronRight,
  lucideCircleCheck,
  lucideClock,
  lucideEllipsisVertical,
  lucideExternalLink,
  lucideHardDrive,
  lucideShieldCheck,
} from '@ng-icons/lucide';

import { IS_PRODUCTION_TOKEN } from '@rabbithole/core';
import { CopyToClipboardComponent } from '@rabbithole/ui';
import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmHoverCardImports } from '@spartan-ng/helm/hover-card';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import type { SharedStorageOwnerProfile } from '../../shared-with-me.store';
import type { SharedStorageView } from '../../utils/shared-storage-view';
import { isSharedStorageOpenBlocked } from '../../utils/shared-storage-view';

const STORAGE_DEV_FRONTEND_ORIGIN = 'http://localhost:4201';

@Component({
  selector: 'rbth-feat-shared-with-me-storage-card',
  imports: [
    DatePipe,
    RouterLink,
    NgIcon,
    HlmAvatarImports,
    HlmBadge,
    HlmIcon,
    CopyToClipboardComponent,
    ...HlmButtonImports,
    ...HlmButtonGroupImports,
    ...HlmDropdownMenuImports,
    ...HlmHoverCardImports,
    ...HlmItemImports,
    ...HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideChevronRight,
      lucideCalendar,
      lucideCircleCheck,
      lucideClock,
      lucideEllipsisVertical,
      lucideExternalLink,
      lucideHardDrive,
      lucideShieldCheck,
    }),
  ],
  templateUrl: './shared-storage-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedStorageCardComponent {
  readonly storage = input.required<SharedStorageView>();
  readonly canisterIdText = computed(() =>
    this.storage().storageCanisterId.toText(),
  );

  readonly #isProduction = inject(IS_PRODUCTION_TOKEN);

  readonly canisterUrl = computed(() => {
    const id = this.canisterIdText();
    if (!id) return null;

    if (!this.#isProduction) {
      return `${STORAGE_DEV_FRONTEND_ORIGIN}/?canisterId=${encodeURIComponent(id)}`;
    }

    return `https://${id}.icp0.io`;
  });
  readonly canOpen = computed(
    () =>
      this.storage().activeAccessClasses.length > 0 &&
      !isSharedStorageOpenBlocked(this.storage()),
  );
  readonly openTooltip = computed(() => {
    const storage = this.storage();
    if (isSharedStorageOpenBlocked(storage)) {
      return 'Storage is being updated by the owner. Try again in a few minutes.';
    }
    if (storage.activeAccessClasses.length === 0) {
      return 'Access is still pending.';
    }
    return '';
  });
  readonly ownerPrincipalId = computed(() =>
    this.storage().access.accountOwner.toText(),
  );

  readonly ownerProfile = input<SharedStorageOwnerProfile | null>(null);

  readonly ownerHoverTitle = computed(() => {
    const profile = this.ownerProfile();
    if (!profile) return 'Rabbithole user';

    const shortPrincipal = this.#shortPrincipal(this.ownerPrincipalId());
    return profile.title === shortPrincipal ? 'Rabbithole user' : profile.title;
  });

  readonly ownerTitle = computed(
    () => this.ownerProfile()?.title ?? this.#shortPrincipal(this.ownerPrincipalId()),
  );

  accessClassLabel(value: unknown): string {
    if (this.#hasKey(value, 'ownerEquivalent')) return 'Recovery access';
    if (this.#hasKey(value, 'durable')) return 'Durable access';
    return 'Standard access';
  }

  openStorageApp(): void {
    const url = this.canisterUrl();
    if (url && this.canOpen()) {
      window.open(url, '_blank');
    }
  }

  sourceLabel(): string | null {
    const source = this.storage().lastSource;
    if (!source) return null;
    if (this.#hasKey(source, 'accessRequest')) return 'Access request';
    if (this.#hasKey(source, 'ordinaryInvite')) return 'Invite';
    if (this.#hasKey(source, 'durablePolicy')) return 'Durable policy';
    if (this.#hasKey(source, 'recoverySetup')) return 'Recovery setup';
    return null;
  }

  statusLabel(): string | null {
    const status = this.storage().storageStatus;
    if (!status) return null;
    if (isSharedStorageOpenBlocked(this.storage())) return 'Updating';
    if (status.type === 'Completed') return 'Ready';
    return null;
  }

  #hasKey(value: unknown, key: string): boolean {
    return !!value && typeof value === 'object' && key in value;
  }

  #shortPrincipal(value: string): string {
    return value.length > 18
      ? `${value.slice(0, 8)}...${value.slice(-6)}`
      : value;
  }
}
