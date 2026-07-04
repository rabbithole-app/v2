import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronsUpDown,
  lucideCreditCard,
  lucideLogOut,
  lucideMegaphone,
  lucideSettings,
  lucideSparkles,
  lucideStar,
  lucideUser,
  lucideWallet,
} from '@ng-icons/lucide';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { UserIdentityComponent } from '@rabbithole/ui/user-identity';
import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmSidebarImports, HlmSidebarService } from '@spartan-ng/helm/sidebar';

import { ProfileService } from '../../../services';
import { AvatarService } from '../../../services/avatar.service';
import { BalanceService } from '../../../services/balance.service';
import { SubscriptionService } from '../../../services/subscription.service';
import {
  ACCOUNT_MENU_BACKEND_LINKS_ENABLED_TOKEN,
  BACKEND_FEATURES_ENABLED_TOKEN,
} from '../../../tokens';
import { formatUsd } from '../../../utils/format-number';
import { UserSettingsDialogService } from '../user-settings-dialog/user-settings-dialog.service';
import type { UserSettingsDialogSection } from '../user-settings-dialog/user-settings-dialog.types';

@Component({
  selector: 'rbth-core-account-menu',
  imports: [
    ...HlmSidebarImports,
    HlmAvatarImports,
    HlmBadge,
    HlmDropdownMenuImports,
    NgIcon,
    UserIdentityComponent,
  ],
  providers: [
    provideIcons({
      lucideChevronsUpDown,
      lucideCreditCard,
      lucideLogOut,
      lucideMegaphone,
      lucideSettings,
      lucideSparkles,
      lucideStar,
      lucideUser,
      lucideWallet,
    }),
  ],
  templateUrl: './account-menu.component.html',
  host: { class: 'block w-full' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountMenuComponent {
  readonly #profileService = inject(ProfileService);

  readonly profile = this.#profileService.profile;
  readonly #avatarService = inject(AvatarService);
  readonly avatarSrc = computed(
    () =>
      this.#avatarService.avatarSrc(this.profile()?.avatarRef[0]) ?? undefined,
  );
  readonly backendFeaturesEnabled = inject(BACKEND_FEATURES_ENABLED_TOKEN);
  readonly backendLinksEnabled = inject(ACCOUNT_MENU_BACKEND_LINKS_ENABLED_TOKEN);
  readonly #sidebarService = inject(HlmSidebarService);
  readonly iconOnlyTrigger = computed(
    () =>
      this.#sidebarService.state() === 'collapsed' &&
      !this.#sidebarService.isMobile(),
  );
  readonly #subscriptionService = inject(SubscriptionService);
  readonly isPro = this.#subscriptionService.isPro;
  readonly menuSide = computed(() =>
    this.#sidebarService.isMobile() ? 'top' : 'right',
  );
  readonly #authService = inject(AUTH_SERVICE);
  readonly principalId = this.#authService.principalId;

  readonly subscriptionActionIcon = computed(() =>
    this.#subscriptionService.isPro() ? 'lucideCreditCard' : 'lucideSparkles',
  );
  readonly subscriptionActionLabel = computed(() =>
    this.#subscriptionService.isPro() ? 'Subscription' : 'Upgrade to Pro',
  );
  readonly title = computed(() => {
    const profile = this.profile();
    return profile?.displayName[0] ?? profile?.username ?? 'Account';
  });
  readonly username = computed(() => {
    const profile = this.profile();
    if (!profile?.displayName[0]) return undefined;

    return profile.username;
  });
  readonly #balanceService = inject(BalanceService);
  readonly walletBalanceLabel = computed(() =>
    this.#balanceService.isLoading()
      ? '...'
      : formatUsd(this.#balanceService.totalUsd()),
  );

  readonly #route = inject(ActivatedRoute);
  readonly #router = inject(Router);
  readonly #settingsDialogService = inject(UserSettingsDialogService);

  handleLogout(): void {
    this.#authService.signOut();
  }

  handleSubscriptionAction(): void {
    this.openSettingsDialog('subscription');
  }

  navigateToAmbassador(): void {
    this.#router.navigate(['ambassador'], { relativeTo: this.#route });
  }

  navigateToProfile(): void {
    this.#router.navigate(['profile'], { relativeTo: this.#route });
  }

  navigateToWallet(): void {
    this.openSettingsDialog('wallet');
  }

  openSettingsDialog(section: UserSettingsDialogSection = 'settings'): void {
    void this.#settingsDialogService.open(section);
  }
}
