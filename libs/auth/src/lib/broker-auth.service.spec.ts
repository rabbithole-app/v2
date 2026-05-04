import { TestBed } from '@angular/core/testing';
import { AnonymousIdentity } from '@icp-sdk/core/agent';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BrokerAuthService } from './broker-auth.service';
import {
  AUTH_CONFIG,
  AUTH_IDENTITY_ATTRIBUTES_PROVIDER,
  AuthSessionEvent,
} from './tokens';

const mockClient = {
  getIdentity: vi.fn(),
  isAuthenticated: vi.fn(),
  requestAttributes: vi.fn(),
  signIn: vi.fn(),
};

vi.mock('@icp-sdk/auth/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icp-sdk/auth/client')>();
  return {
    ...actual,
    AuthClient: vi.fn(function AuthClient() {
      return mockClient;
    }),
  };
});

describe('BrokerAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getIdentity.mockResolvedValue(new AnonymousIdentity());
    mockClient.isAuthenticated.mockReturnValue(false);
    mockClient.requestAttributes.mockResolvedValue({
      data: new Uint8Array([1]),
      signature: new Uint8Array([2]),
    });
    mockClient.signIn.mockResolvedValue(new AnonymousIdentity());
  });

  it('starts identity attributes preparation before sign-in without blocking sign-in', async () => {
    const order: string[] = [];
    let resolveAttributesRequest:
      | ((value: { keys: string[]; nonce: Uint8Array }) => void)
      | null = null;
    const provider = vi.fn((event: AuthSessionEvent) => {
      order.push(`prepare:${event.openIdIssuer ?? ''}`);
      return new Promise<{ keys: string[]; nonce: Uint8Array }>((resolve) => {
        resolveAttributesRequest = resolve;
      });
    });
    mockClient.signIn.mockImplementation(async () => {
      order.push('signIn');
      resolveAttributesRequest?.({
        keys: ['openid:https://openid.localhost:name'],
        nonce: new Uint8Array([3]),
      });
      return new AnonymousIdentity();
    });
    mockClient.requestAttributes.mockImplementation(async () => {
      order.push('requestAttributes');
      return {
        data: new Uint8Array([1]),
        signature: new Uint8Array([2]),
      };
    });

    TestBed.configureTestingModule({
      providers: [
        BrokerAuthService,
        {
          provide: AUTH_CONFIG,
          useValue: {
            appUrl: 'http://localhost:4200',
            delegationPath: '/delegation',
            scheme: 'rabbithole',
          },
        },
        { provide: AUTH_IDENTITY_ATTRIBUTES_PROVIDER, useValue: provider },
      ],
    });

    const service = TestBed.inject(BrokerAuthService);
    await service.signIn({ openIdIssuer: 'https://openid.localhost' });

    expect(order).toEqual([
      'prepare:https://openid.localhost',
      'signIn',
      'requestAttributes',
    ]);
    expect(service.lastAuthEvent()?.identityAttributes?.keys).toEqual([
      'openid:https://openid.localhost:name',
    ]);
  });
});
