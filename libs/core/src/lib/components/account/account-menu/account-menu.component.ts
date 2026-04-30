import { CdkMenu } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLogOut, lucideUser, lucideWallet } from '@ng-icons/lucide';
import { BrnPopoverImports } from '@spartan-ng/brain/popover';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';

import { ProfileService } from '../../../services';
import {
  ACCOUNT_MENU_BACKEND_LINKS_ENABLED_TOKEN,
  BACKEND_FEATURES_ENABLED_TOKEN,
} from '../../../tokens';
import { CopyToClipboardComponent } from '../../ui';
import { AccountMenuTriggerContentComponent } from '../account-menu-trigger-content/account-menu-trigger-content.component';

@Component({
  selector: 'core-account-menu',
  imports: [
    BrnPopoverImports,
    HlmPopoverImports,
    AccountMenuTriggerContentComponent,
    HlmButtonImports,
    HlmDropdownMenuImports,
    NgIcon,
    CopyToClipboardComponent,
    CdkMenu,
  ],
  providers: [
    provideIcons({
      lucideLogOut,
      lucideUser,
      lucideWallet,
    }),
  ],
  templateUrl: './account-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountMenuComponent {
  readonly popoverState = signal<'closed' | 'open'>('closed');

  readonly #authService = inject(AUTH_SERVICE);
  readonly principalId = this.#authService.principalId;
  readonly #profileService = inject(ProfileService);
  readonly profile = this.#profileService.profile;
  readonly backendFeaturesEnabled = inject(BACKEND_FEATURES_ENABLED_TOKEN);
  readonly backendLinksEnabled = inject(ACCOUNT_MENU_BACKEND_LINKS_ENABLED_TOKEN);

  readonly truncatedPrincipal = computed(() => {
    const id = this.principalId();
    if (!id || id.length <= 15) return id;
    return `${id.slice(0, 7)}...${id.slice(-5)}`;
  });

  readonly #route = inject(ActivatedRoute);
  readonly #router = inject(Router);

  handleLogout(): void {
    this.#authService.signOut();
  }

  navigateToProfile(): void {
    this.#router.navigate(['profile'], { relativeTo: this.#route });
  }

  navigateToWallet(): void {
    this.#router.navigate(['wallet'], { relativeTo: this.#route });
  }
}
