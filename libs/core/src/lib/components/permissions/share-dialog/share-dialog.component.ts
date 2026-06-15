import {
  Component,
  computed,
  inject,
  input,
  output,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAtSign,
  lucideCircleDashed,
  lucideDatabase,
  lucideFile,
  lucideFiles,
  lucideFolder,
  lucideKeyRound,
  lucideRabbit,
  lucideShare2,
  lucideShieldAlert,
  lucideTrash2,
  lucideUserRound,
  lucideUsersRound,
} from '@ng-icons/lucide';
import { BrnDialogContent } from '@spartan-ng/brain/dialog';
import { BrnPopoverImports } from '@spartan-ng/brain/popover';
import { BrnSelectImports } from '@spartan-ng/brain/select';
import { BrnTabsImports } from '@spartan-ng/brain/tabs';

import type {
  CreateStorageAccessGrants,
  RevokeStorageAccessGrants,
  StoragePermission,
  StoragePermissionItem,
} from '@rabbithole/encrypted-storage';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialog,
  HlmDialogContent,
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { injectMainActor } from '../../../injectors/main-actor';
import { AvatarService } from '../../../services/avatar.service';
import { CoreTransparentSelectBackdropDirective } from '../../ui/transparent-select-backdrop.directive';
import {
  UserTarget,
  UserTargetComboboxComponent,
} from '../../users/user-target-combobox/user-target-combobox.component';
import {
  AccessTargetItemActionsDirective,
  AccessTargetItemComponent,
  AccessTargetItemDescriptionDirective,
} from '../access-target-item/access-target-item.component';

export type AccessScopeKind = 'batch' | 'directory' | 'file';

type AccessProfile = {
  avatarSrc?: string;
  title: string;
  username?: string;
};

@Component({
  selector: 'rbth-core-share-dialog',
  templateUrl: './share-dialog.component.html',
  imports: [
    BrnDialogContent,
    BrnPopoverImports,
    BrnSelectImports,
    BrnTabsImports,
    CopyToClipboardComponent,
    CoreTransparentSelectBackdropDirective,
    FormsModule,
    HlmBadge,
    HlmButton,
    HlmDialog,
    HlmDialogContent,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    ...HlmEmptyImports,
    ...HlmFieldImports,
    HlmIcon,
    HlmPopoverImports,
    HlmSelectImports,
    HlmTabsImports,
    ...HlmTooltipImports,
    NgIcon,
    AccessTargetItemActionsDirective,
    AccessTargetItemComponent,
    AccessTargetItemDescriptionDirective,
    UserTargetComboboxComponent,
  ],
  providers: [
    provideIcons({
      lucideAtSign,
      lucideCircleDashed,
      lucideDatabase,
      lucideFile,
      lucideFiles,
      lucideFolder,
      lucideKeyRound,
      lucideRabbit,
      lucideShare2,
      lucideShieldAlert,
      lucideTrash2,
      lucideUserRound,
      lucideUsersRound,
    }),
  ],
})
export class ShareDialogComponent {
  readonly accessGrantsChange = output<CreateStorageAccessGrants>();
  readonly accessList = input<StoragePermissionItem[]>([]);
  readonly accessListLoading = input(false);
  readonly activeTab = signal<'manage' | 'share'>('share');
  readonly cancelPendingAccessGrant = output<bigint>();
  readonly selectedTargets = signal<UserTarget[]>([]);
  readonly canSubmit = computed(
    () => this.selectedTargets().length > 0,
  );
  readonly itemCount = input(1);
  readonly currentAccessVisible = computed(() => this.itemCount() === 1);
  readonly dialog = viewChild.required(HlmDialog);

  readonly isBatchScope = computed(() => this.itemCount() > 1);
  readonly permissions = [
    { value: 'Read', label: 'View' },
    { value: 'ReadWrite', label: 'Edit' },
    { value: 'ReadWriteManage', label: 'Manage' },
  ] satisfies { label: string; value: StoragePermission }[];
  readonly principalAccessTargets = computed(() => [
    ...new Set(
      this.accessList()
        .filter((item) => item.targetKind === 'principal')
        .map((item) => item.user),
    ),
  ]);
  readonly #avatarService = inject(AvatarService);
  readonly #mainActor = injectMainActor();
  readonly profiles = resource({
    params: () => ({
      actor: this.#mainActor(),
      principalIds: this.principalAccessTargets(),
    }),
    loader: async ({ params: { actor, principalIds } }) => {
      if (principalIds.length === 0) return new Map<string, AccessProfile>();
      const lookups = await actor.getPublicProfiles(
        principalIds.map((principalId) => Principal.fromText(principalId)),
      );
      return new Map<string, AccessProfile>(
        lookups.map(({ principal, profile }): [string, AccessProfile] => {
          const principalId = principal.toText();
          const summary = profile[0];
          if (!summary) {
            return [
              principalId,
              { title: 'Principal access' },
            ];
          }
          const displayName = summary.displayName[0];
          return [
            principalId,
            {
              avatarSrc:
                this.#avatarService.avatarSrc(summary.avatarRef[0]) ??
                undefined,
              title: displayName ?? `@${summary.username}`,
              username: summary.username,
            },
          ];
        }),
      );
    },
    defaultValue: new Map<string, AccessProfile>(),
  });

  readonly revokeAccessGrants = output<RevokeStorageAccessGrants>();
  readonly scopeKind = input<AccessScopeKind>('file');
  readonly scopeBadgeIcon = computed(() => {
    if (this.isBatchScope() || this.scopeKind() === 'batch') return 'lucideFiles';
    return this.scopeKind() === 'directory' ? 'lucideFolder' : 'lucideFile';
  });
  readonly scopeBadgeLabel = computed(() => {
    if (this.isBatchScope() || this.scopeKind() === 'batch') return 'Selection';
    return this.scopeKind() === 'directory' ? 'Folder' : 'File';
  });
  readonly scopeLabel = input('Selected item');
  readonly selectedPermissions = signal<Record<string, StoragePermission>>({});
  accessProfile(item: StoragePermissionItem): AccessProfile | null {
    if (item.targetKind !== 'principal') return null;
    return this.profiles.value().get(item.user) ?? null;
  }

  accessTargetIcon(item: StoragePermissionItem): string {
    if (item.claimedPrincipals?.length) return 'lucideUsersRound';
    if (item.targetKind !== 'principal') return 'lucideAtSign';
    return this.accessProfile(item) ? 'lucideUserRound' : 'lucideKeyRound';
  }

  accessTargetSubtitle(item: StoragePermissionItem): string {
    if (item.claimedPrincipals?.length) {
      return item.claimedPrincipals.length > 1
        ? 'Rabbithole and storage accounts linked'
        : `${this.claimedPrincipalOriginLabel(item.claimedPrincipals[0].origin)} account linked`;
    }
    if (item.status === 'pending') return 'Pending email invite';
    if (item.targetKind === 'email') return 'Email invite';
    if (item.targetKind === 'emailCommitment') return 'Email is hidden';
    return item.user;
  }

  accessTargetTitle(item: StoragePermissionItem): string {
    if (item.targetKind === 'email') return item.user;
    if (item.targetKind === 'emailCommitment') return 'Pending email invite';
    return this.accessProfile(item)?.title ?? 'Principal access';
  }

  canCancelInvite(item: StoragePermissionItem): boolean {
    return (
      item.grantId !== undefined &&
      (item.status === 'pending' || (item.claimedPrincipals?.length ?? 0) > 0)
    );
  }

  claimedPrincipalOriginIcon(
    origin: NonNullable<
      StoragePermissionItem['claimedPrincipals']
    >[number]['origin'],
  ): string {
    return origin === 'rabbithole' ? 'lucideRabbit' : 'lucideDatabase';
  }

  claimedPrincipalOriginLabel(
    origin: NonNullable<
      StoragePermissionItem['claimedPrincipals']
    >[number]['origin'],
  ): string {
    return origin === 'rabbithole' ? 'Rabbithole' : 'Storage';
  }

  close(): void {
    this.dialog().close();
  }

  handleCancelPendingAccessGrant(item: StoragePermissionItem): void {
    if (item.grantId === undefined) return;
    this.cancelPendingAccessGrant.emit(item.grantId);
  }

  handleRemoveAccess(item: StoragePermissionItem): void {
    if (this.canCancelInvite(item)) {
      this.handleCancelPendingAccessGrant(item);
      return;
    }

    this.handleRevokeAccessGrant(item);
  }

  handleRevokeAccessGrant(item: StoragePermissionItem): void {
    if (item.targetKind !== 'principal') return;
    this.revokeAccessGrants.emit({
      items: [{ principal: item.user }],
    });
  }

  handleSubmit(): void {
    if (!this.canSubmit()) return;

    this.accessGrantsChange.emit({
      items: this.selectedTargets().map((target) => ({
        target: target.kind === 'email'
          ? { email: target.email }
          : { principal: target.principalId },
        permission: this.targetPermission(target),
      })),
    });
    this.reset();
  }

  handleTargetsChange(targets: UserTarget[] | null): void {
    const nextTargets = targets ?? [];
    const nextKeys = new Set(nextTargets.map((target) => this.targetKey(target)));
    const current = this.selectedPermissions();
    this.selectedPermissions.set(
      Object.fromEntries(
        nextTargets.map((target) => {
          const key = this.targetKey(target);
          return [key, nextKeys.has(key) ? (current[key] ?? 'Read') : 'Read'];
        }),
      ),
    );
    this.selectedTargets.set(nextTargets);
  }

  open(tab: 'manage' | 'share' = 'share'): void {
    this.activeTab.set(tab);
    this.dialog().open();
  }

  permissionLabel(permission: StoragePermission): string {
    return this.permissions.find((option) => option.value === permission)?.label ?? permission;
  }

  removeAccessLabel(item: StoragePermissionItem): string {
    return item.status === 'pending' ? 'Cancel invite' : 'Revoke access';
  }

  setTargetPermission(target: UserTarget, permission: StoragePermission): void {
    this.selectedPermissions.update((value) => ({
      ...value,
      [this.targetKey(target)]: permission,
    }));
  }

  targetAvatarSrc(target: UserTarget): string | undefined {
    return target.kind === 'user' ? target.avatarSrc : undefined;
  }

  targetIcon(target: UserTarget): string {
    if (target.kind === 'email') return 'lucideAtSign';
    if (target.kind === 'principal') return 'lucideKeyRound';
    return 'lucideUserRound';
  }

  targetIdentityTitle(target: UserTarget): string {
    if (target.kind === 'email') return target.email;
    if (target.kind === 'principal') {
      return target.match === 'emailExact' && target.matchedEmail
        ? target.matchedEmail
        : 'Principal access';
    }
    return target.displayName ?? `@${target.username ?? target.label}`;
  }

  targetKey(target: UserTarget): string {
    return target.kind === 'email'
      ? `email:${target.email}`
      : `principal:${target.principalId}`;
  }

  targetPermission(target: UserTarget): StoragePermission {
    return this.selectedPermissions()[this.targetKey(target)] ?? 'Read';
  }

  targetPrincipalId(target: UserTarget): string | undefined {
    return target.kind === 'email' ? undefined : target.principalId;
  }

  private reset(): void {
    this.selectedTargets.set([]);
    this.selectedPermissions.set({});
  }
}
