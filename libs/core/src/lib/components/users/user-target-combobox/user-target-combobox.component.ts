import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  Directive,
  inject,
  input,
  model,
  resource,
  signal,
  TemplateRef,
} from '@angular/core';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideAtSign, lucideKeyRound } from '@ng-icons/lucide';

import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { HlmComboboxImports } from '@spartan-ng/helm/combobox';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { injectMainActor } from '../../../injectors/main-actor';
import { AvatarService } from '../../../services/avatar.service';
import { CoreTransparentComboboxBackdropDirective } from './transparent-combobox-backdrop.directive';

export interface EmailUserTarget extends UserTargetBase {
  email: string;
  kind: 'email';
}

export interface PrincipalUserTarget extends UserTargetBase {
  kind: 'principal';
  match?: Exclude<UserTargetMatch, 'profile'>;
  matchedEmail?: string;
  principalId: string;
}

export interface ProfileUserTarget extends UserTargetBase {
  avatarSrc?: string;
  displayName?: string;
  kind: 'user';
  match: UserTargetMatch;
  matchedEmail?: string;
  principalId: string;
  username?: string;
}

export type UserTarget =
  | EmailUserTarget
  | PrincipalUserTarget
  | ProfileUserTarget;

interface UserTargetBase {
  label: string;
  searchText?: string;
}

type UserTargetMatch = 'emailExact' | 'principalExact' | 'profile';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Directive({
  selector: 'ng-template[rbthCoreUserTargetComboboxValue]',
})
export class UserTargetComboboxValueDirective {
  readonly templateRef =
    inject<TemplateRef<{ $implicit: UserTarget[] }>>(TemplateRef);
}

@Directive({
  selector: 'ng-template[rbthCoreUserTargetComboboxOption]',
})
export class UserTargetComboboxOptionDirective {
  readonly templateRef =
    inject<TemplateRef<{ $implicit: UserTarget }>>(TemplateRef);
}

@Component({
  selector: 'rbth-core-user-target-combobox',
  imports: [
    CoreTransparentComboboxBackdropDirective,
    HlmAvatarImports,
    HlmIcon,
    NgIcon,
    NgTemplateOutlet,
    ...HlmComboboxImports,
  ],
  providers: [
    provideIcons({
      lucideAtSign,
      lucideKeyRound,
    }),
  ],
  templateUrl: './user-target-combobox.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserTargetComboboxComponent {
  readonly allowTypedEmail = input(true);
  readonly allowTypedPrincipal = input(true);
  readonly search = signal('');
  readonly trimmedSearch = computed(() => this.search().trim());
  readonly #actor = injectMainActor();
  readonly #avatarService = inject(AvatarService);
  readonly options = resource({
    params: () => ({
      actor: this.#actor(),
      search: this.trimmedSearch(),
    }),
    loader: async ({ params: { actor, search } }) => {
      if (search.length < 2) return [];
      const results = await actor.searchUserDirectory(search, 10n);
      const targets = results.flatMap((item): UserTarget[] => {
        const profile = this.optional(item.profile);
        const match = this.directoryMatch(item.match);
        const principalId = item.id.toText();

        if (!profile) {
          if (match !== 'principalExact' && match !== 'emailExact') return [];

          return [
            {
              kind: 'principal',
              principalId,
              label: match === 'emailExact' ? search : this.shortPrincipal(principalId),
              match,
              matchedEmail: match === 'emailExact' ? search : undefined,
              searchText: match === 'emailExact' ? search : undefined,
            },
          ];
        }

        const displayName = this.optional(profile.displayName);
        const username = profile.username;
        const label = displayName ?? `@${username}`;

        return [
          {
            kind: 'user',
            principalId,
            label: match === 'emailExact' ? search : label,
            username,
            displayName,
            avatarSrc:
              this.#avatarService.avatarSrc(profile.avatarRef[0]) ?? undefined,
            match,
            matchedEmail: match === 'emailExact' ? search : undefined,
            searchText: match === 'emailExact' ? search : undefined,
          },
        ];
      });

      const principalId = this.parsePrincipalId(search);
      if (
        this.allowTypedPrincipal() &&
        principalId &&
        !targets.some(
          (target) =>
            target.kind !== 'email' &&
            target.principalId === principalId &&
            target.match === 'principalExact',
        )
      ) {
        targets.unshift({
          kind: 'principal',
          principalId,
          label: this.shortPrincipal(principalId),
        });
      }

      if (
        this.allowTypedEmail() &&
        EMAIL_PATTERN.test(search) &&
        !targets.some(
          (target) => target.kind !== 'email' && target.match === 'emailExact',
        )
      ) {
        targets.unshift({
          kind: 'email',
          email: search,
          label: search,
        });
      }

      return targets;
    },
    defaultValue: [],
  });
  readonly value = model<UserTarget[]>([]);
  readonly searchOptions = computed(() =>
    this.options
      .value()
      .filter(
        (item) => !this.value().some((value) => this.sameTarget(value, item)),
      ),
  );
  readonly foundOptions = computed(() =>
    this.searchOptions().filter((item) => item.kind !== 'email' && item.match),
  );
  readonly hasSearch = computed(() => this.trimmedSearch().length >= 2);
  readonly optionTemplate = contentChild(UserTargetComboboxOptionDirective);

  readonly placeholder = input('Search user, principal or email');

  readonly selectedOptions = computed(() => this.value());
  readonly shouldShowContent = computed(
    () => this.hasSearch() || this.value().length > 0,
  );
  readonly typedOptions = computed(() =>
    this.searchOptions().filter((item) => item.kind === 'email' || !item.match),
  );
  readonly valueTemplate = contentChild(UserTargetComboboxValueDirective);

  readonly filterTarget = (
    item: UserTarget,
    search: string,
    collator: Intl.Collator,
  ) => {
    if (this.value().some((value) => this.sameTarget(value, item))) {
      return true;
    }

    const query = search.trim();
    if (!query) return true;

    const text = this.targetSearchText(item);
    for (let index = 0; index <= text.length - query.length; index += 1) {
      if (
        collator.compare(text.slice(index, index + query.length), query) === 0
      ) {
        return true;
      }
    }

    return false;
  };
  initials(item: UserTarget): string {
    const source =
      item.kind === 'user'
        ? (item.displayName ?? item.username ?? item.principalId)
        : item.kind === 'email'
          ? item.email
          : item.principalId;
    return (
      source
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'U'
    );
  }

  readonly isItemEqualToValue = (
    left: UserTarget | null,
    right: UserTarget | null,
  ) => Boolean(left && right && this.targetKey(left) === this.targetKey(right));

  readonly itemToString = (item: UserTarget | null) =>
    item ? this.targetSearchText(item) : '';

  selectOption(item: UserTarget, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.value().some((value) => this.sameTarget(value, item))) {
      this.value.update((value) => [...value, item]);
    }
    this.search.set('');
  }

  setValue(value: UserTarget[] | null): void {
    this.value.set(value ?? []);
  }

  shortPrincipal(principalId: string): string {
    return principalId.length > 18
      ? `${principalId.slice(0, 8)}...${principalId.slice(-6)}`
      : principalId;
  }

  targetKey(item: UserTarget): string {
    return item.kind === 'email'
      ? `email:${item.email}`
      : `principal:${item.principalId}`;
  }

  targetSubtitle(item: UserTarget): string {
    if (item.kind === 'email') return item.email ?? '';
    if (item.kind === 'principal') return item.principalId;
    if (item.match === 'emailExact' && item.matchedEmail) {
      return `Found by ${item.matchedEmail}`;
    }
    if (item.match === 'emailExact') return 'Found by email';
    if (item.match === 'principalExact' && item.kind === 'user') {
      return 'Found by principal ID';
    }
    return item.principalId ?? '';
  }

  targetTitle(item: UserTarget): string {
    if (item.kind === 'email') return 'Invite by email';
    if (item.kind === 'principal') {
      if (item.match === 'emailExact')
        return item.matchedEmail ?? 'Found by email';
      return item.match ? 'Principal ID' : 'Use principal ID';
    }
    if (item.match === 'emailExact' && item.matchedEmail) {
      return item.matchedEmail;
    }

    return item.displayName
      ? `${item.displayName} · @${item.username ?? item.label}`
      : `@${item.username ?? item.label}`;
  }

  private directoryMatch(
    match: { emailExact: null } | { principalExact: null } | { profile: null },
  ): UserTargetMatch {
    if ('emailExact' in match) return 'emailExact';
    if ('principalExact' in match) return 'principalExact';
    return 'profile';
  }

  private optional<T>(value: [] | [T] | undefined): T | undefined {
    return value?.[0];
  }

  private parsePrincipalId(value: string): string | undefined {
    try {
      return Principal.fromText(value.trim()).toText();
    } catch {
      return undefined;
    }
  }

  private sameTarget(left: UserTarget, right: UserTarget): boolean {
    return this.targetKey(left) === this.targetKey(right);
  }

  private targetSearchText(item: UserTarget): string {
    return [
      item.label,
      item.kind === 'user' ? item.displayName : undefined,
      item.kind === 'user' ? item.username : undefined,
      item.kind === 'email' ? item.email : undefined,
      item.kind !== 'email' ? item.principalId : undefined,
      item.kind !== 'email' ? item.matchedEmail : undefined,
      item.searchText,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ');
  }
}
