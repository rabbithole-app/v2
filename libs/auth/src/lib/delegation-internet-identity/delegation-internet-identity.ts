import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  inject,
  input,
  output,
} from '@angular/core';
import { AuthClient } from '@icp-sdk/auth/client';
import {
  DelegationChain,
  DelegationIdentity,
  ECDSAKeyIdentity,
  Ed25519PublicKey,
} from '@icp-sdk/core/identity';
import { Principal } from '@icp-sdk/core/principal';
import { addMilliseconds } from 'date-fns';

import { assertPublicKey } from '../asserts';
import { AUTH_CONFIG, AUTH_SERVICE } from '../tokens';

@Directive({
  selector: '[rbthDelegationInternetIdentityTrigger]',
  standalone: true,
  host: {
    '(click)': 'component.signInWithDelegation()',
  },
})
export class RbthDelegationInternetIdentityTriggerDirective {
  component = inject(RbthDelegationInternetIdentityComponent);
}

@Component({
  selector: 'rbth-delegation-internet-identity',
  imports: [],
  template: `<ng-content />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthDelegationInternetIdentityComponent {
  authService = inject(AUTH_SERVICE);
  delegate = output<DelegationChain>();
  publicKey = input.required<Ed25519PublicKey>();
  targets = input<Principal[]>([]);
  #authConfig = inject(AUTH_CONFIG);

  constructor() {
    console.log(this.#authConfig);
  }

  async signInWithDelegation() {
    const publicKey = this.publicKey();

    assertPublicKey(publicKey);

    const middleKeyIdentity = await ECDSAKeyIdentity.generate({
      extractable: false,
      keyUsages: ['sign', 'verify'],
    });
    const client = await AuthClient.create({
      identity: middleKeyIdentity,
      idleOptions: {
        disableDefaultIdleCallback: true,
        disableIdle: true,
      },
      storage: {
        get: () => Promise.resolve(null),
        remove: () => Promise.resolve(),
        set: () => Promise.resolve(),
      },
    });

    await new Promise((resolve, reject) =>
      client.login({
        ...(this.#authConfig.loginOptions ?? {}),
        onError: reject,
        onSuccess: resolve,
      }),
    );
    const middleIdentity = client.getIdentity() as DelegationIdentity;
    const maxTimeToLive =
      this.#authConfig.loginOptions?.maxTimeToLive ??
      BigInt(8 * 60 * 60 * 1000 * 1000 * 1000);
    const expiration = addMilliseconds(
      new Date(),
      Number(maxTimeToLive / 1_000_000n),
    );

    // Create delegation chain from II delegation chain for public key
    const delegationChainForPublicKey = await DelegationChain.create(
      middleKeyIdentity,
      publicKey,
      expiration,
      {
        previous: middleIdentity.getDelegation(),
        targets: this.targets(),
      },
    );

    this.delegate.emit(delegationChainForPublicKey);
  }
}
