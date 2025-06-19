import { InjectionToken } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { HttpAgent } from '@dfinity/agent';
import { createAgent, CreateAgentParams } from '@dfinity/utils';
import { createInjectionToken } from 'ngxtension/create-injection-token';
import { filter, switchMap } from 'rxjs/operators';

import { ExtractInjectionToken } from '../types';
import { AUTH_SERVICE } from '@rabbithole/auth';

export const CREATE_AGENT_PARAMS_TOKEN = new InjectionToken<
  Omit<CreateAgentParams, 'identity'>
>('CREATE_AGENT_PARAMS');

export const [injectHttpAgent, provideHttpAgent, HTTP_AGENT_TOKEN] =
  createInjectionToken(
    (
      authService: ExtractInjectionToken<typeof AUTH_SERVICE>,
      agentParams: ExtractInjectionToken<typeof CREATE_AGENT_PARAMS_TOKEN>
    ) => {
      const identity$ = toObservable(authService.identity);
      return toSignal(
        authService.ready$.pipe(
          filter((v) => v),
          switchMap(() =>
            identity$.pipe(
              switchMap((identity) => createAgent({ ...agentParams, identity }))
            )
          )
        ),
        { initialValue: null }
      );
    },
    {
      isRoot: false,
      deps: [AUTH_SERVICE, CREATE_AGENT_PARAMS_TOKEN],
    }
  );

export function assertHttpAgent(
  agent: HttpAgent | null
): asserts agent is HttpAgent {
  if (!agent) throw Error('The HttpAgent instance is not initialized');
}
