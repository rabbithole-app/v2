import { InjectionToken, Signal } from '@angular/core';
import {
  AuthClient,
  AuthClientCreateOptions,
  AuthClientSignInOptions,
  OpenIdProvider,
  SignedAttributes,
} from '@icp-sdk/auth/client';
import { Identity } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { Observable } from 'rxjs';

export type AuthClientInstance = AuthClient;

export type AuthClientLogoutOptions = Parameters<
  AuthClientInstance['logout']
>[0];

export type AuthConfig = {
  appUrl: string;
  delegationPath: string;
  delegationTargets?: Principal[];
  identitySignerCanisterId?: string;
  loginOptions?: AuthClientCreateOptions & AuthClientSignInOptions;
  openIdProviders?: (AuthOpenIdProviderConfig | OpenIdProvider)[];
  scheme: string;
};

export type AuthOpenIdProviderConfig = {
  icon?: string;
  id: OpenIdProvider | 'dev';
  issuer?: string;
  label?: string;
  logo?: string;
  logoClass?: string;
  ssoDomain?: string;
};

export type AuthSessionEvent = {
  hasAttributes: boolean;
  id: number;
  identityAttributes?: SignedIdentityAttributes;
  openIdIssuer?: string;
  openIdProvider?: OpenIdProvider;
  ssoDomain?: string;
};

export type IdentityAttributesRequest = {
  keys: string[];
  nonce: Uint8Array;
};

export type SignedIdentityAttributes = IdentityAttributesRequest & {
  attributes: SignedAttributes;
};

export type IdentityAttributesProvider = (
  authEvent: AuthSessionEvent,
) => Promise<IdentityAttributesRequest | null>;

export type AuthSignInOptions = {
  openIdIssuer?: string;
  openIdProvider?: OpenIdProvider;
  ssoDomain?: string;
};

export interface IAuthService {
  identity: Signal<Identity>;
  isAuthenticated: Signal<boolean>;
  lastAuthEvent: Signal<AuthSessionEvent | null>;
  principalId: Signal<string>;
  ready$: Observable<boolean>;
  requestAttributes?(params: {
    keys: string[];
    nonce: Uint8Array;
  }): Promise<SignedAttributes>;
  signIn(options?: AuthSignInOptions): Promise<void> | void;
  signOut(): Promise<void> | void;
}

export const AUTH_CONFIG = new InjectionToken<AuthConfig>('AUTH_CONFIG');

export const AUTH_IDENTITY_ATTRIBUTES_PROVIDER =
  new InjectionToken<IdentityAttributesProvider>(
    'AUTH_IDENTITY_ATTRIBUTES_PROVIDER',
  );

export const AUTH_SERVICE = new InjectionToken<IAuthService>('AUTH_SERVICE');
