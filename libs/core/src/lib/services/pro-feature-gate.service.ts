import { inject, Injectable } from '@angular/core';
import { filter, firstValueFrom, take } from 'rxjs';

import { UserSettingsDialogService } from '../components/account/user-settings-dialog/user-settings-dialog.service';
import type { UserSettingsProUpgradeSource } from '../components/account/user-settings-dialog/user-settings-dialog.types';
import { SubscriptionService } from './subscription.service';

@Injectable({ providedIn: 'root' })
export class ProFeatureGateService {
  readonly #settingsDialogService = inject(UserSettingsDialogService);
  readonly #subscriptionService = inject(SubscriptionService);

  async ensurePro(
    source: UserSettingsProUpgradeSource = 'share',
  ): Promise<boolean> {
    await firstValueFrom(
      this.#subscriptionService.ready$.pipe(
        filter((ready) => ready),
        take(1),
      ),
    );

    if (this.#subscriptionService.isPro()) return true;

    return this.#settingsDialogService.openProUpgrade(source);
  }

  async run(
    source: UserSettingsProUpgradeSource,
    action: () => Promise<void> | void,
  ): Promise<void> {
    if (!(await this.ensurePro(source))) return;

    await action();
  }
}
