import type {
  ExternalStorageTargetView,
  S3CompatibleTargetConfig,
  TargetStatus,
  Time,
} from '@rabbithole/declarations/encrypted-storage';

export type BadgeVariant = 'default' | 'destructive' | 'outline' | 'secondary';

export function compareTimeDesc(a: bigint, b: bigint): number {
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

export function formatSize(bytes: bigint | number): string {
  const n = Number(bytes);
  if (n === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${parseFloat((n / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function nanosToDate(time: Time): Date {
  return new Date(Number(time / 1_000_000n));
}

export function s3Config(
  target: ExternalStorageTargetView,
): S3CompatibleTargetConfig {
  return target.kind.S3CompatiblePublicEncrypted;
}

export function targetLabel(
  target: ExternalStorageTargetView | null,
): string {
  return target?.displayName[0] || target?.id || 'New external target';
}

export function targetStatusLabel(status: TargetStatus): string {
  if ('Active' in status) return 'Active';
  if ('Disabled' in status) return 'Disabled';
  if ('CredentialFailed' in status) return 'Credential failed';
  return 'Unknown';
}

export function targetStatusVariant(status: TargetStatus): BadgeVariant {
  if ('Active' in status) return 'default';
  if ('CredentialFailed' in status) return 'destructive';
  if ('Disabled' in status) return 'secondary';
  return 'outline';
}
