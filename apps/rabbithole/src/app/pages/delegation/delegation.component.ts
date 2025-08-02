import { ChangeDetectionStrategy, Component, forwardRef } from '@angular/core';
import { DelegationChain, Ed25519PublicKey } from '@dfinity/identity';
import { Principal } from '@dfinity/principal';
import { hexToBytes } from '@noble/hashes/utils';
import { injectQueryParams } from 'ngxtension/inject-query-params';

import { environment } from '../../../environments/environment';
import { LoginComponent } from '../login/login.component';
import { RbthInternetIdentityModule } from '@rabbithole/auth';

@Component({
  selector: 'app-delegation',
  imports: [RbthInternetIdentityModule, forwardRef(() => LoginComponent)],
  templateUrl: './delegation.component.html',
  host: {
    class: 'squared-layout',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DelegationComponent {
  publicKey = injectQueryParams<Ed25519PublicKey | null>(
    ({ sessionPublicKey }) =>
      sessionPublicKey
        ? Ed25519PublicKey.fromDer(hexToBytes(sessionPublicKey))
        : null,
  );
  readonly targets = [Principal.fromText(environment.backendCanisterId)];

  handleDelegate(delegationChain: DelegationChain) {
    // Send above delegationChainForPublicKey back to Tauri
    const json = JSON.stringify(delegationChain.toJSON());
    window.open(
      `${
        environment.scheme
      }://internetIdentityCallback?delegationChain=${encodeURIComponent(json)}`,
    );
  }
}
