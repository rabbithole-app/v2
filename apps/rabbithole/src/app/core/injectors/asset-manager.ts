import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Principal } from '@dfinity/principal';
import { createAgent } from '@dfinity/utils';
import { createInjectionToken } from 'ngxtension/create-injection-token';
import { map, switchMap } from 'rxjs/operators';

import { AssetManager } from '@rabbithole/assets';
import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  ASSETS_CANISTER_ID,
  CREATE_AGENT_PARAMS_TOKEN,
  ExtractInjectionToken,
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
      createAgentParams: ExtractInjectionToken<
        typeof CREATE_AGENT_PARAMS_TOKEN
      >,
    ) =>
      toSignal(
        toObservable(authService.identity).pipe(
          switchMap((identity) =>
            createAgent({
              ...createAgentParams,
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
      deps: [AUTH_SERVICE, ASSETS_CANISTER_ID, CREATE_AGENT_PARAMS_TOKEN],
    },
  );
