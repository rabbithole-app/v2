import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { HlmDialogService } from '@spartan-ng/helm/dialog';

import {
  USER_SETTINGS_DIALOG_CONTENT_CLASS,
  type UserSettingsDialogContext,
  type UserSettingsDialogResult,
  type UserSettingsDialogSection,
  type UserSettingsProUpgradeSource,
} from './user-settings-dialog.types';

@Injectable({ providedIn: 'root' })
export class UserSettingsDialogService {
  readonly #dialogService = inject(HlmDialogService);

  async open(section: UserSettingsDialogSection = 'settings') {
    return this.#open({ section });
  }

  async openProUpgrade(
    source: UserSettingsProUpgradeSource = 'subscription',
  ): Promise<boolean> {
    const dialogRef = await this.#open({
      closeOnUpgrade: true,
      section: 'subscription',
      upgradeSource: source,
    });
    const result = (await firstValueFrom(
      dialogRef.closed$,
    )) as UserSettingsDialogResult | undefined;

    return result?.upgraded === true;
  }

  async #open(context: UserSettingsDialogContext) {
    const { UserSettingsDialogComponent } = await import(
      './user-settings-dialog.component'
    );

    return this.#dialogService.open(UserSettingsDialogComponent, {
      contentClass: USER_SETTINGS_DIALOG_CONTENT_CLASS,
      context,
    });
  }
}
