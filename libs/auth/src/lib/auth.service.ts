import { inject, Injectable } from '@angular/core';
import { SignedAttributes } from '@icp-sdk/auth/client';

import { BrokerAuthService } from './broker-auth.service';
import { AuthClientSignOutOptions, AuthSignInOptions, IAuthService } from './tokens';

@Injectable()
export class AuthService implements IAuthService {
  #broker = inject(BrokerAuthService);
  identity = this.#broker.identity;
  isAuthenticated = this.#broker.isAuthenticated;
  lastAuthEvent = this.#broker.lastAuthEvent;
  principalId = this.#broker.principalId;
  ready$ = this.#broker.ready$;

  async requestAttributes(params: {
    keys: string[];
    nonce: Promise<Uint8Array> | Uint8Array;
  }): Promise<SignedAttributes> {
    return this.#broker.requestAttributes(params);
  }

  async signIn(options?: AuthSignInOptions) {
    await this.#broker.signIn(options);
  }

  async signOut(opts?: AuthClientSignOutOptions) {
    await this.#broker.signOut(opts);
  }
}
