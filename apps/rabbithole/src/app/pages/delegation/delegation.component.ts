import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
} from '@angular/core';
import { DelegationChain, Ed25519PublicKey } from '@icp-sdk/core/identity';
import { Principal } from '@icp-sdk/core/principal';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { linkedQueryParam } from 'ngxtension/linked-query-param';

import { environment } from '../../../environments/environment';
import { RbthInternetIdentityModule } from '@rabbithole/auth';
import { isPrincipal } from '@rabbithole/core';
import { LoginComponent } from '@rabbithole/pages/login';

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
  publicKey = linkedQueryParam('sessionPublicKey', {
    parse: (sessionPublicKey) =>
      sessionPublicKey
        ? Ed25519PublicKey.fromDer(hexToBytes(sessionPublicKey))
        : null,
    stringify: (publicKey) =>
      publicKey ? bytesToHex(publicKey.toDer()) : null,
  });
  target = linkedQueryParam('target', {
    parse: (target) => {
      if (!target || !isPrincipal(target)) {
        return null;
      }

      return Principal.fromText(target);
    },
    stringify: (target) => (target ? target.toText() : null),
  });
  readonly targets = computed(() => {
    const storageCanisterId = this.target();
    const backendCanisterId = Principal.fromText(environment.backendCanisterId);
    const ledgerCanisterId = Principal.fromText(environment.ledgerCanisterId);
    const cyclesMintingCanisterId = Principal.fromText(
      environment.cyclesMintingCanisterId,
    );
    return [
      backendCanisterId,
      ledgerCanisterId,
      cyclesMintingCanisterId,
      ...(storageCanisterId ? [storageCanisterId] : []),
    ];
  });

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

      // Close popup after sending
      window.close();
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
}
