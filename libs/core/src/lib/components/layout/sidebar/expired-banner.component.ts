import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideInfo } from '@ng-icons/lucide';

import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { SubscriptionService } from '../../../services/subscription.service';
import { BACKEND_FEATURES_ENABLED_TOKEN } from '../../../tokens';
import { UserSettingsDialogService } from '../../account/user-settings-dialog/user-settings-dialog.service';

@Component({
  selector: 'core-expired-banner',
  imports: [HlmButton, HlmIcon, NgIcon],
  providers: [provideIcons({ lucideInfo })],
  template: `
    @if (backendFeaturesEnabled && subscriptionService.isExpired()) {
      <div class="border-b bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5 flex items-center gap-3 text-sm">
        <ng-icon name="lucideInfo" hlmIcon size="sm" class="text-amber-600 shrink-0" />
        <p class="flex-1 text-amber-800 dark:text-amber-200">
          Your subscription has expired. Your data is safe — you can still
          decrypt your files. Encryption and sharing are paused.
        </p>
        <button
          hlmBtn
          size="sm"
          variant="outline"
          type="button"
          class="shrink-0"
          (click)="openSubscriptionSettings()"
        >
          Resubscribe
        </button>
      </div>
    }
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpiredBannerComponent {
  readonly backendFeaturesEnabled = inject(BACKEND_FEATURES_ENABLED_TOKEN);
  subscriptionService = inject(SubscriptionService);
  readonly #settingsDialogService = inject(UserSettingsDialogService);

  openSubscriptionSettings(): void {
    void this.#settingsDialogService.open('subscription');
  }
}
