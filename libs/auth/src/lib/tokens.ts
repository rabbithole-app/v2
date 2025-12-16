import { InjectionToken, Signal } from '@angular/core';
import { Identity } from '@dfinity/agent';
import { AuthClient, AuthClientLoginOptions } from '@dfinity/auth-client';
import { Principal } from '@dfinity/principal';
import { Observable } from 'rxjs';

export type AuthClientInstance = Awaited<ReturnType<typeof AuthClient.create>>;

export type AuthClientLogoutOptions = Parameters<
  AuthClientInstance['logout']
>[0];

export type AuthConfig = {
  appUrl: string;
  delegationPath: string;
  loginOptions?: AuthClientLoginOptions;
  // identityProviderUrl: string;
  scheme: string;
};

export interface IAuthService {
  identity: Signal<Identity>;
  isAuthenticated: Signal<boolean>;
  principalId: Signal<string>;
  ready$: Observable<boolean>;
  signIn(options?: { target?: Principal }): Promise<void> | void;
  signOut(): Promise<void> | void;
}

export const AUTH_CONFIG = new InjectionToken<AuthConfig>('AUTH_CONFIG');

export const AUTH_SERVICE = new InjectionToken<IAuthService>('AUTH_SERVICE');
