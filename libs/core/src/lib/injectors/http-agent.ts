import { InjectionToken } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { HttpAgent, HttpAgentOptions } from '@icp-sdk/core/agent';
import { createInjectionToken } from 'ngxtension/create-injection-token';
import { filter, switchMap } from 'rxjs/operators';

import { AUTH_SERVICE } from '@rabbithole/auth';

import { ExtractInjectionToken } from '../types';

export const HTTP_AGENT_OPTIONS_TOKEN = new InjectionToken<
  Omit<HttpAgentOptions, 'identity'>
>('HTTP_AGENT_OPTIONS');

export const [injectHttpAgent, provideHttpAgent, HTTP_AGENT_TOKEN] =
  createInjectionToken(
    (
      authService: ExtractInjectionToken<typeof AUTH_SERVICE>,
      httpAgentOptions: ExtractInjectionToken<typeof HTTP_AGENT_OPTIONS_TOKEN>,
    ) => {
      const identity$ = toObservable(authService.identity);
      return toSignal(
        authService.ready$.pipe(
          filter((v) => v),
          switchMap(() =>
            identity$.pipe(
              switchMap((identity) =>
                HttpAgent.create({ ...httpAgentOptions, identity }),
              ),
            ),
          ),
        ),
        { initialValue: HttpAgent.createSync(httpAgentOptions) },
      );
    },
    {
      deps: [AUTH_SERVICE, HTTP_AGENT_OPTIONS_TOKEN],
    },
  );

export function assertHttpAgent(
  agent: HttpAgent | null,
): asserts agent is HttpAgent {
  if (!agent) throw Error('The HttpAgent instance is not initialized');
}
