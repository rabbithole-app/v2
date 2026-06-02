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
    title: 'Encryption requires Pro',
    description: 'End-to-end encryption is a Pro feature. Upgrade to protect your files with VetKey encryption that only you can unlock.',
  },
  share: {
    title: 'Sharing requires Pro',
    description: 'File sharing is a Pro feature. Upgrade to share encrypted files with trusted people using granular permissions.',
  },
  'storage-limit': {
    title: 'Included storage limit reached',
    description: 'Your included encrypted storage is full. Upgrade to Pro for managed funding and higher limits.',
  },
  'file-size-limit': {
    title: 'File too large for included storage',
    description: 'This file is larger than the included storage file limit. Upgrade to Pro for larger files and managed storage funding.',
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
        Unlimited E2E encryption
      </div>
      <div class="flex items-center gap-2 text-sm">
        <ng-icon name="lucideShield" hlmIcon size="sm" class="text-primary" />
        File sharing with permissions
      </div>
      <div class="flex items-center gap-2 text-sm">
        <ng-icon name="lucideShield" hlmIcon size="sm" class="text-primary" />
        Covers all your storages
      </div>

      <p class="text-sm text-muted-foreground pt-2">
        $9.90/month · Cancel anytime
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
