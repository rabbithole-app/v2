import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideCheck, lucideX } from '@ng-icons/lucide';

import { AvatarService } from '@rabbithole/core';
import { AdminUserListItem, Role } from '@rabbithole/declarations/backend';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';

type BadgeVariant = 'default' | 'destructive' | 'outline' | 'secondary';

@Component({
  selector: 'app-admin-user-header',
  imports: [
    CopyToClipboardComponent,
    HlmBadge,
    HlmIcon,
    NgIcon,
    RouterLink,
    ...HlmAvatarImports,
    ...HlmButtonImports,
    ...HlmItemImports,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCheck,
      lucideX,
    }),
  ],
  templateUrl: './admin-user-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUserHeaderComponent {
  readonly userDetail = input.required<AdminUserListItem>();

  readonly #avatarService = inject(AvatarService);

  protected _avatarSrc(user: AdminUserListItem): string | undefined {
    return this.#avatarService.avatarSrc(user.profile[0]?.avatarRef[0]) ??
      undefined;
  }

  protected _identityProvider(user: AdminUserListItem): string {
    return user.identity.provider[0] ?? 'unknown';
  }

  protected _profileTitle(user: AdminUserListItem): string {
    const profile = user.profile[0];
    if (profile?.displayName[0]) return profile.displayName[0];
    if (profile?.username) return `@${profile.username}`;
    if (user.identity.name[0]) return user.identity.name[0];
    return user.id.toText();
  }

  protected _roleLabel(role: Role): string {
    if ('admin' in role) return 'Admin';
    if ('moderator' in role) return 'Moderator';
    return 'User';
  }

  protected _roleVariant(role: Role): BadgeVariant {
    if ('admin' in role) return 'default';
    if ('moderator' in role) return 'secondary';
    return 'outline';
  }

  protected _showPrincipalSubtitle(user: AdminUserListItem): boolean {
    return this._profileTitle(user) !== user.id.toText();
  }
}
