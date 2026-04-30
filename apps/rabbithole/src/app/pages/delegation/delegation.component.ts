import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { fromNullable } from '@dfinity/utils';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleAlert,
  lucideLogOut,
  lucideShieldCheck,
} from '@ng-icons/lucide';
import {
  hugeApple,
  hugeDeveloper,
  hugeGoogle,
  hugeMicrosoft,
} from '@ng-icons/huge-icons';
import { SignIdentity } from '@icp-sdk/core/agent';
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519PublicKey,
} from '@icp-sdk/core/identity';
import { Principal } from '@icp-sdk/core/principal';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { linkedQueryParam } from 'ngxtension/linked-query-param';

import { AUTH_CONFIG, AUTH_SERVICE, AuthSignInOptions } from '@rabbithole/auth';
import {
  CopyToClipboardComponent,
  injectMainActor,
  ProfileService,
} from '@rabbithole/core';
import {
  RbthFrameComponent,
  RbthFrameDescriptionDirective,
  RbthFrameHeaderDirective,
  RbthFramePanelDirective,
  RbthFrameTitleDirective,
} from '@rabbithole/ui/frame';
import { RbthRainbowButton } from '@rabbithole/ui/rainbow-button';
import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { environment } from '../../../environments/environment';

const DELEGATION_POPUP_CLOSE_DELAY_MS = 2000;
const MANAGEMENT_CANISTER_ID = Principal.fromText('aaaaa-aa');

@Component({
  selector: 'app-delegation',
  imports: [
    CopyToClipboardComponent,
    ...HlmAlertImports,
    HlmAvatarImports,
    HlmIcon,
    RbthFrameComponent,
    RbthFrameDescriptionDirective,
    RbthFrameHeaderDirective,
    RbthFramePanelDirective,
    RbthFrameTitleDirective,
    RbthRainbowButton,
    ...HlmButtonImports,
    ...HlmTooltipImports,
    NgIcon,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCircleAlert,
      lucideLogOut,
      lucideShieldCheck,
      hugeApple,
      hugeDeveloper,
      hugeGoogle,
      hugeMicrosoft,
    }),
  ],
  templateUrl: './delegation.component.html',
  host: {
    class: 'relative z-10 flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-4 py-12',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DelegationComponent {
  readonly delegationSent = signal(false);
  #authService = inject(AUTH_SERVICE);
  #actor = injectMainActor();
  readonly isAuthenticated = this.#authService.isAuthenticated;
  #profileService = inject(ProfileService);
  readonly profile = this.#profileService.profile;
  readonly #userResource = resource({
    params: () => ({
      actor: this.#actor(),
      isAuthenticated: this.isAuthenticated(),
    }),
    loader: async ({ params: { actor, isAuthenticated } }) => {
      if (!isAuthenticated) return null;
      return fromNullable(await actor.getUser()) ?? null;
    },
  });
  readonly userName = computed(() => {
    const user = this.#userResource.value();
    const profile = this.profile();

    return (
      user?.name[0] ??
      profile?.displayName[0] ??
      profile?.username ??
      'Rabbithole account'
    );
  });
  readonly avatarSrc = computed(() => this.profile()?.avatarUrl[0] ?? null);
  readonly userInitials = computed(() => {
    const words = this.userName().trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'U';
    return words
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join('');
  });
  openIdIssuer = linkedQueryParam('openid');
  openIdProvider = linkedQueryParam('provider');
  readonly principalId = this.#authService.principalId;
  publicKey = linkedQueryParam('sessionPublicKey', {
    parse: (sessionPublicKey) =>
      sessionPublicKey
        ? Ed25519PublicKey.fromDer(hexToBytes(sessionPublicKey))
        : null,
    stringify: (publicKey) =>
      publicKey ? bytesToHex(publicKey.toDer()) : null,
  });
  readonly signInError = signal<string | null>(null);
  readonly signingIn = signal(false);
  ssoDomain = linkedQueryParam('sso');
  signInLabel = computed(() => {
    if (this.openIdIssuer()) return 'Continue with Dev OpenID';
    if (this.openIdProvider() === 'google') return 'Continue with Google';
    if (this.openIdProvider() === 'microsoft') return 'Continue with Microsoft';
    if (this.openIdProvider() === 'apple') return 'Continue with Apple';
    if (this.ssoDomain()) return 'Continue with SSO';
    return 'Sign in with Internet Identity';
  });
  signInIcon = computed(() => {
    if (this.openIdIssuer()) return 'hugeDeveloper';
    if (this.openIdProvider() === 'google') return 'hugeGoogle';
    if (this.openIdProvider() === 'microsoft') return 'hugeMicrosoft';
    if (this.openIdProvider() === 'apple') return 'hugeApple';
    if (this.ssoDomain()) return 'hugeDeveloper';
    return null;
  });
  readonly hasPresetSignInProvider = computed(
    () => !!(this.openIdIssuer() || this.openIdProvider() || this.ssoDomain()),
  );
  target = linkedQueryParam('target', {
    parse: (target) => {
      if (!target) {
        return null;
      }

      try {
        return Principal.fromText(target);
      } catch {
        return null;
      }
    },
    stringify: (target) => (target ? target.toText() : null),
  });
  readonly storageCanisterId = computed(() => this.target()?.toText() ?? null);
  readonly targets = computed(() => {
    const storageCanisterId = this.target();
    const backendCanisterId = Principal.fromText(environment.backendCanisterId);
    return [
      backendCanisterId,
      MANAGEMENT_CANISTER_ID,
      ...(storageCanisterId ? [storageCanisterId] : []),
    ];
  });
  #authConfig = inject(AUTH_CONFIG);

  cancel() {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'DELEGATION_CANCELLED' }, '*');
      window.close();
    }
  }

  async delegateFromBrokerSession() {
    const publicKey = this.publicKey();
    if (!publicKey) return;
    this.delegationSent.set(true);

    const identity = this.#authService.identity();
    if (!(identity instanceof DelegationIdentity)) {
      this.delegationSent.set(false);
      console.error('Cannot issue storage delegation without a broker delegation identity.');
      return;
    }

    const maxTimeToLive =
      this.#authConfig.loginOptions?.maxTimeToLive ??
      BigInt(8 * 60 * 60 * 1000 * 1000 * 1000);
    const expiration = new Date(
      Date.now() + Number(maxTimeToLive / 1_000_000n),
    );
    const delegationChain = await DelegationChain.create(
      identity as SignIdentity,
      publicKey,
      expiration,
      {
        previous: identity.getDelegation(),
        targets: this.targets(),
      },
    );

    this.handleDelegate(delegationChain);
  }

  handleDelegate(delegationChain: DelegationChain) {
    // Check if the tab is a child window (opened via window.open)
    if (window.opener && !window.opener.closed) {
      // Send delegation via postMessage to parent window (storage application)
      // Use '*' as targetOrigin to allow cross-origin communication
      // The parent window will validate the origin in its message handler
      const message = {
        type: 'DELEGATION_CHAIN',
        delegationChain: delegationChain.toJSON(),
      };

      window.opener.postMessage(message, '*');

      window.setTimeout(() => window.close(), DELEGATION_POPUP_CLOSE_DELAY_MS);
    } else {
      // If no parent window, use deep link (for tauri application)
      const json = JSON.stringify(delegationChain.toJSON());
      window.open(
        `${
          environment.scheme
        }://internetIdentityCallback?delegationChain=${encodeURIComponent(json)}`,
      );
    }
  }

  async signIn() {
    const options: AuthSignInOptions = {};
    const openIdIssuer = this.openIdIssuer();
    const openIdProvider = this.openIdProvider();
    const ssoDomain = this.ssoDomain();

    if (openIdIssuer) {
      options.openIdIssuer = openIdIssuer;
    }
    if (
      openIdProvider === 'google' ||
      openIdProvider === 'microsoft' ||
      openIdProvider === 'apple'
    ) {
      options.openIdProvider = openIdProvider;
    }
    if (ssoDomain) {
      options.ssoDomain = ssoDomain;
    }

    this.signInError.set(null);
    this.signingIn.set(true);

    try {
      await this.#authService.signIn(options);
      window.focus();
    } catch (error) {
      this.signInError.set(
        error instanceof Error ? error.message : 'Sign-in failed',
      );
    } finally {
      this.signingIn.set(false);
    }
  }

  async switchAccount() {
    this.delegationSent.set(false);
    this.signInError.set(null);
    await this.#authService.signOut();
  }
}
