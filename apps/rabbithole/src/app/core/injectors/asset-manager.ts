import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { createInjectionToken } from 'ngxtension/create-injection-token';
import { map, switchMap } from 'rxjs/operators';

import { AssetManager } from '@rabbithole/assets';
import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  ASSETS_CANISTER_ID,
  ExtractInjectionToken,
  HTTP_AGENT_OPTIONS_TOKEN,
} from '@rabbithole/core';

export function assertAssetManager(
  assetManager: AssetManager | null,
): asserts assetManager is AssetManager {
  if (!assetManager)
    throw Error('The AssetManager instance is not initialized');
}

export const [injectAssetManager, provideAssetManager, ASSET_MANAGER_TOKEN] =
  createInjectionToken(
    (
      authService: ExtractInjectionToken<typeof AUTH_SERVICE>,
      assetCanisterId: Principal,
      httpAgentOptions: ExtractInjectionToken<typeof HTTP_AGENT_OPTIONS_TOKEN>,
    ) =>
      toSignal(
        toObservable(authService.identity).pipe(
          switchMap((identity) =>
            HttpAgent.create({
              ...httpAgentOptions,
              identity,
            }),
          ),
          map(
            (agent) =>
              new AssetManager({
                canisterId: assetCanisterId,
                agent,
              }),
          ),
        ),
        { initialValue: null },
      ),
    {
      isRoot: false,
      deps: [AUTH_SERVICE, ASSETS_CANISTER_ID, HTTP_AGENT_OPTIONS_TOKEN],
    },
  );
