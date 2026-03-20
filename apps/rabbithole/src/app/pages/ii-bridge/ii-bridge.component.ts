import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  signal,
} from '@angular/core';
import {
  createAuthClient,
  type Params,
  parseParams,
  popupCenter,
  startLogin,
} from '@perforate/ic-auth-bridge';

import { environment } from '../../../environments/environment';

const AUTH_POPUP_WIDTH = 576;
const AUTH_POPUP_HEIGHT = 826;

@Component({
  selector: 'app-ii-bridge',
  template: `
    <main class="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
      <div class="flex flex-col items-center gap-6 p-8">
        <h1 class="text-2xl font-semibold">Internet Identity</h1>

        @switch (state()) {
          @case ('loading') {
            <p class="text-neutral-400">Initializing...</p>
          }
          @case ('ready') {
            <p class="text-neutral-400">Press the button below to continue</p>
            <button
              type="button"
              class="inline-flex items-center gap-3 rounded-full bg-gradient-to-tl from-blue-600 to-violet-600 px-6 py-3 text-sm font-medium hover:from-violet-600 hover:to-blue-600"
              (click)="login()"
            >
              Sign in with Internet Identity
            </button>
          }
          @case ('success') {
            <p class="text-green-400">Authentication successful. You may close this tab.</p>
          }
          @case ('error') {
            <p class="text-red-400">{{ errorMessage() }}</p>
            <button
              type="button"
              class="rounded-full bg-neutral-800 px-6 py-2 text-sm hover:bg-neutral-700"
              (click)="retry()"
            >
              Try again
            </button>
          }
        }
      </div>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IiBridgeComponent implements OnInit {
  errorMessage = signal('');
  state = signal<'error' | 'loading' | 'ready' | 'success'>('loading');

  #authClient: Awaited<ReturnType<typeof createAuthClient>> | null = null;
  #params: Params | null = null;

  login() {
    if (!this.#authClient || !this.#params) return;

    this.state.set('loading');

    startLogin(
      this.#authClient,
      this.#params.redirectUri,
      popupCenter({ width: AUTH_POPUP_WIDTH, height: AUTH_POPUP_HEIGHT }),
      {
        onSuccess: () => this.state.set('success'),
        onError: (error) => {
          this.errorMessage.set(
            error ?? 'Authentication failed. Please try again.',
          );
          this.state.set('error');
        },
      },
    );
  }

  async ngOnInit() {
    try {
      this.#params = parseParams(window.location.href);

      const identityProvider =
        this.#params.identityProvider ?? this.#getIdentityProvider();

      this.#authClient = await createAuthClient(
        this.#params,
        identityProvider,
      );
      this.state.set('ready');
    } catch (e) {
      this.errorMessage.set(e instanceof Error ? e.message : String(e));
      this.state.set('error');
    }
  }

  retry() {
    this.state.set('ready');
  }

  #getIdentityProvider(): string {
    if (environment.production) {
      return 'https://identity.ic0.app';
    }
    return environment.identityProviderUrl;
  }
}
