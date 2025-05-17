import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  inject,
  input,
  output,
} from '@angular/core';
import { AuthClient } from '@dfinity/auth-client';
import {
  DelegationChain,
  DelegationIdentity,
  ECDSAKeyIdentity,
  Ed25519PublicKey,
} from '@dfinity/identity';
import { Principal } from '@dfinity/principal';

import { assertPublicKey } from '../asserts';
import { AUTH_CONFIG, AUTH_SERVICE } from '../tokens';

// expires in 10 minutes
function getDefaultExpirationDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 10);
  return date;
}

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
  expiration = input<Date>(getDefaultExpirationDate());
  publicKey = input.required<Ed25519PublicKey>();
  targets = input<Principal[]>([]);
  #authConfig = inject(AUTH_CONFIG);

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
      })
    );
    const middleIdentity = client.getIdentity() as DelegationIdentity;
    const expiration = this.expiration();

    // Create delegation chain from II delegation chain for public key
    const delegationChainForPublicKey = await DelegationChain.create(
      middleKeyIdentity,
      publicKey,
      expiration,
      {
        previous: middleIdentity.getDelegation(),
        targets: this.targets(),
      }
    );

    this.delegate.emit(delegationChainForPublicKey);
  }
}
