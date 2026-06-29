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
