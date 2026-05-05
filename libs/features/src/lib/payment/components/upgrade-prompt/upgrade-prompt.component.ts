import {
  ChangeDetectionStrategy,
  Component,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideShield } from '@ng-icons/lucide';
import { injectBrnDialogContext } from '@spartan-ng/brain/dialog';

import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';

export interface UpgradePromptContext {
  feature: 'encrypt' | 'share' | 'trial-expired' | 'trial-limit';
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
  'trial-limit': {
    title: 'Trial encryption limit reached',
    description: "You've used 100 MB of trial encryption. Upgrade to Pro for unlimited E2E encryption.",
  },
  'trial-expired': {
    title: 'Your trial has ended',
    description: 'Your 14-day Pro trial is over. Your encrypted files are safe — upgrade to continue encrypting and sharing.',
  },
} as const;

@Component({
  selector: 'rbth-feat-upgrade-prompt',
  imports: [
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
      <button hlmBtn brnDialogClose="upgrade">Upgrade to Pro</button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradePromptComponent {
  #context = injectBrnDialogContext<UpgradePromptContext>();
  config = FEATURE_CONFIG[this.#context.feature];
}
