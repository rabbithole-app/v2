import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideShield } from '@ng-icons/lucide';
import {
  BrnDialogClose,
  BrnDialogRef,
  injectBrnDialogContext,
} from '@spartan-ng/brain/dialog';

import { UserSettingsDialogService } from '@rabbithole/core';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';

export interface UpgradePromptContext {
  feature: 'encrypt' | 'file-size-limit' | 'share' | 'storage-limit';
}

const FEATURE_CONFIG = {
  encrypt: {
    title: 'Pro required',
    description: 'Upgrade to Pro for encrypted uploads beyond Starter Vault limits and managed operations credit across your vaults.',
  },
  share: {
    title: 'Sharing requires Pro',
    description: 'Upgrade to use sharing for encrypted files, folders, and vaults.',
  },
  'storage-limit': {
    title: 'Starter Vault limit reached',
    description: 'Your starter encrypted storage is full. Upgrade to Pro to continue uploads while managed operations credit or your balance can fund them.',
  },
  'file-size-limit': {
    title: 'File too large for Starter Vault',
    description: 'This file is larger than the starter file limit. Upgrade to Pro for uploads beyond starter limits and managed funding.',
  },
} as const;

@Component({
  selector: 'rbth-feat-upgrade-prompt',
  imports: [
    BrnDialogClose,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmIcon,
    NgIcon,
  ],
  providers: [provideIcons({ lucideShield })],
  template: `
    <hlm-dialog-header>
      <h3 hlmDialogTitle>{{ config.title }}</h3>
      <p hlmDialogDescription>
        {{ config.description }}
      </p>
    </hlm-dialog-header>

    <div class="py-4 space-y-2">
      <div class="flex items-center gap-2 text-sm">
        <ng-icon name="lucideShield" hlmIcon size="sm" class="text-primary" />
        Encrypted uploads beyond starter limits
      </div>
      <div class="flex items-center gap-2 text-sm">
        <ng-icon name="lucideShield" hlmIcon size="sm" class="text-primary" />
        Sharing
      </div>
      <div class="flex items-center gap-2 text-sm">
        <ng-icon name="lucideShield" hlmIcon size="sm" class="text-primary" />
        2 TC managed operations credit per period
      </div>

      <p class="text-sm text-muted-foreground pt-2">
        Pro · $9.90/month · Applies to all vaults under your identity
      </p>
    </div>

    <hlm-dialog-footer>
      <button hlmBtn variant="outline" brnDialogClose>Maybe Later</button>
      <button hlmBtn (click)="upgrade()">Upgrade to Pro</button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradePromptComponent {
  feature = injectBrnDialogContext<UpgradePromptContext>().feature;
  config = FEATURE_CONFIG[this.feature];

  #dialogRef = inject(BrnDialogRef);
  #settingsDialogService = inject(UserSettingsDialogService);

  upgrade(): void {
    this.#dialogRef.close();
    void this.#settingsDialogService.openProUpgrade(this.feature);
  }
}
