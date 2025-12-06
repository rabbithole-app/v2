import { CdkMenu } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountIdentifier } from '@dfinity/ledger-icp';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLogOut, lucideUser } from '@ng-icons/lucide';
import { BrnPopoverImports } from '@spartan-ng/brain/popover';
import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';

import { ProfileService } from '../../../services';
// import { AccountMenuTriggerContentDescriptionDirective } from '../account-menu-trigger-content/account-menu-trigger-content-description.directive';
import { CopyToClipboardComponent } from '../../ui';
import { AccountMenuTriggerContentComponent } from '../account-menu-trigger-content/account-menu-trigger-content.component';
import { IcpWalletCardComponent } from '../icp-wallet-card/icp-wallet-card.component';
import { AUTH_SERVICE } from '@rabbithole/auth';

@Component({
  selector: 'core-account-menu',
  imports: [
    BrnPopoverImports,
    HlmPopoverImports,
    AccountMenuTriggerContentComponent,
    HlmButtonImports,
    HlmAvatarImports,
    HlmDropdownMenuImports,
    NgIcon,
    CopyToClipboardComponent,
    HlmSeparatorImports,
    HlmItemImports,
    HlmDropdownMenuImports,
    CdkMenu,
    IcpWalletCardComponent,
    RouterLink,
    // AccountMenuTriggerContentDescriptionDirective,
  ],
  providers: [
    provideIcons({
      lucideLogOut,
      lucideUser,
    }),
  ],
  templateUrl: './account-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountMenuComponent {
  readonly #authService = inject(AUTH_SERVICE);
  accountIdentifier = computed(() =>
    AccountIdentifier.fromPrincipal({
      principal: this.#authService.identity().getPrincipal(),
    }).toHex(),
  );

  readonly popoverState = signal<'closed' | 'open'>('closed');
  readonly principalId = this.#authService.principalId;
  readonly #profileService = inject(ProfileService);

  readonly profile = this.#profileService.profile;

  handleLogout(): void {
    this.#authService.signOut();
  }
}
