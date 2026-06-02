export const USER_SETTINGS_DIALOG_CONTENT_CLASS =
  'w-[min(94vw,760px)] sm:max-w-[760px] gap-0 overflow-hidden p-0';

export interface UserSettingsDialogContext {
  closeOnUpgrade?: boolean;
  section?: UserSettingsDialogSection;
  upgradeSource?: UserSettingsProUpgradeSource;
}

export interface UserSettingsDialogResult {
  upgraded?: boolean;
}

export type UserSettingsDialogSection = 'settings' | 'subscription' | 'wallet';

export type UserSettingsProUpgradeSource =
  | 'encrypt'
  | 'expired-subscription'
  | 'file-size-limit'
  | 'managed-funding'
  | 'pricing'
  | 'share'
  | 'storage-limit'
  | 'subscription';
