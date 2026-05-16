import { ApplicationInitStatus, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Actor, AnonymousIdentity, HttpAgent } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_CONFIG, AUTH_SERVICE } from '@rabbithole/auth';

import { HTTP_AGENT_OPTIONS_TOKEN } from '../injectors/http-agent';
import { MAIN_ACTOR_TOKEN } from '../injectors/main-actor';
import { MAIN_CANISTER_ID_TOKEN } from '../tokens/main-canister';

// ── Referral Capture ────────────────────────────────────────────────

describe('provideReferralCapture', () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sessionStorage.clear();
    replaceStateSpy = vi.spyOn(window.history, 'replaceState');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset URL to clean state
    window.history.replaceState({}, '', '/');
  });

  it('should capture ref from URL and save to sessionStorage', async () => {
    window.history.pushState({}, '', '/pricing?ref=ABC123&plan=pro');

    const { provideReferralCapture } = await import('./registration.service');

    TestBed.configureTestingModule({
      providers: [provideReferralCapture()],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;

    expect(sessionStorage.getItem('referralCode')).toBe('ABC123');
    expect(replaceStateSpy).toHaveBeenCalled();
    const replacedUrl = replaceStateSpy.mock.lastCall?.[2];
    if (typeof replacedUrl !== 'string') {
      throw new Error('expected replaced URL');
    }
    expect(replacedUrl).not.toContain('ref=');
    expect(replacedUrl).toContain('plan=pro');
  });

  it('should not touch sessionStorage when no ref param', async () => {
    window.history.pushState({}, '', '/dashboard');

    const { provideReferralCapture } = await import('./registration.service');

    TestBed.configureTestingModule({
      providers: [provideReferralCapture()],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;

    expect(sessionStorage.getItem('referralCode')).toBeNull();
    expect(replaceStateSpy).toHaveBeenCalledTimes(0);
  });

  it('should preserve other query params when removing ref', async () => {
    window.history.pushState(
      {},
      '',
      '/login?redirectUrl=/dashboard&ref=XYZ789&lang=en',
    );

    const { provideReferralCapture } = await import('./registration.service');

    TestBed.configureTestingModule({
      providers: [provideReferralCapture()],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;

    expect(sessionStorage.getItem('referralCode')).toBe('XYZ789');
    const replacedUrl = replaceStateSpy.mock.lastCall?.[2];
    if (typeof replacedUrl !== 'string') {
      throw new Error('expected replaced URL');
    }
    expect(replacedUrl).toContain('redirectUrl');
    expect(replacedUrl).toContain('lang=en');
    expect(replacedUrl).not.toContain('ref=');
  });
});

// ── Registration ────────────────────────────────────────────────────

describe('provideRegistration', () => {
  const isAuthenticated = signal(false);
  const lastAuthEvent = signal<{
    hasAttributes: boolean;
    id: number;
    identityAttributes?: {
      attributes: never;
      keys: string[];
      nonce: Uint8Array;
    };
    openIdIssuer?: string;
    openIdProvider?: 'apple' | 'google' | 'microsoft';
  } | null>(null);
  let authEventId = 0;
  const mockActor = {
    applyReferralCode: vi.fn(),
    attributeNonceBegin: vi.fn(),
    ensureUser: vi.fn(),
    getUser: vi.fn(),
    syncIdentityAttributes: vi.fn(),
  };
  const actorSignal = signal(mockActor);

  const mockAuthService = {
    ready$: of(true),
    isAuthenticated,
    identity: signal(new AnonymousIdentity()),
    lastAuthEvent,
    principalId: signal('anonymous'),
    requestAttributes: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  };

  beforeEach(() => {
    sessionStorage.clear();
    isAuthenticated.set(false);
    lastAuthEvent.set(null);
    authEventId = 0;
    vi.spyOn(Actor, 'agentOf').mockReturnValue({
      getPrincipal: vi.fn().mockResolvedValue(Principal.fromText('aaaaa-aa')),
    } as never);
    mockActor.applyReferralCode.mockReset();
    mockActor.attributeNonceBegin.mockReset();
    mockActor.ensureUser.mockReset();
    mockActor.getUser.mockReset();
    mockActor.syncIdentityAttributes.mockReset();
    mockAuthService.requestAttributes.mockReset();
    mockActor.attributeNonceBegin.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockActor.ensureUser.mockResolvedValue(undefined);
    mockActor.syncIdentityAttributes.mockResolvedValue({ ok: null });
    vi.spyOn(HttpAgent, 'create').mockResolvedValue({
      call: vi.fn().mockResolvedValue(undefined),
    } as never);
  });

  afterEach(() => vi.restoreAllMocks());

  async function setup() {
    const { provideRegistration } = await import('./registration.service');

    TestBed.configureTestingModule({
      providers: [
        { provide: AUTH_SERVICE, useValue: mockAuthService },
        {
          provide: AUTH_CONFIG,
          useValue: {
            appUrl: 'http://localhost:4200',
            delegationPath: '/delegation',
            identitySignerCanisterId: 'rdmx6-jaaaa-aaaaa-aaadq-cai',
            scheme: 'rabbithole',
          },
        },
        { provide: MAIN_ACTOR_TOKEN, useValue: actorSignal },
        { provide: HTTP_AGENT_OPTIONS_TOKEN, useValue: {} },
        {
          provide: MAIN_CANISTER_ID_TOKEN,
          useValue: Principal.fromText('aaaaa-aa'),
        },
        provideRegistration(),
      ],
    });
  }

  function triggerAuthEvent(
    event: {
      hasAttributes: boolean;
      identityAttributes?: {
        attributes: never;
        keys: string[];
        nonce: Uint8Array;
      };
      openIdIssuer?: string;
      openIdProvider?: 'apple' | 'google' | 'microsoft';
    } = {
      hasAttributes: false,
    },
  ) {
    isAuthenticated.set(true);
    lastAuthEvent.set({ ...event, id: ++authEventId });
    TestBed.tick();
  }

  function restoreAuthenticatedSession() {
    isAuthenticated.set(true);
    TestBed.tick();
  }

  it('should call ensureUser when user does not exist', async () => {
    mockActor.getUser.mockResolvedValue([]);

    await setup();

    triggerAuthEvent();

    // Wait for async ensureRegistered
    await vi.waitFor(() => {
      expect(mockActor.getUser).toHaveBeenCalledOnce();
      expect(mockActor.ensureUser).toHaveBeenCalledWith(['internet_identity']);
    });
  });

  it('should call ensureUser for restored authenticated session without auth event', async () => {
    mockActor.getUser.mockResolvedValue([]);

    await setup();

    restoreAuthenticatedSession();

    await vi.waitFor(() => {
      expect(mockActor.getUser).toHaveBeenCalledOnce();
      expect(mockActor.ensureUser).toHaveBeenCalledWith(['internet_identity']);
    });
  });

  it('should not call ensureUser when user already exists', async () => {
    mockActor.getUser.mockResolvedValue([
      { id: 'test', inviter: [], createdAt: 0n, updatedAt: 0n },
    ]);

    await setup();

    triggerAuthEvent();

    await vi.waitFor(() => {
      expect(mockActor.getUser).toHaveBeenCalledOnce();
    });
    expect(mockActor.ensureUser).not.toHaveBeenCalled();
  });

  it('should apply referral code from sessionStorage after ensuring user', async () => {
    sessionStorage.setItem('referralCode', 'ABC123');
    mockActor.getUser.mockResolvedValue([]);
    mockActor.applyReferralCode.mockResolvedValue({ ok: null });

    await setup();

    triggerAuthEvent();

    await vi.waitFor(() => {
      expect(mockActor.ensureUser).toHaveBeenCalledWith(['internet_identity']);
      expect(mockActor.applyReferralCode).toHaveBeenCalledWith('ABC123');
    });
    expect(sessionStorage.getItem('referralCode')).toBeNull();
  });

  it('should not register when actor principal is anonymous', async () => {
    vi.mocked(Actor.agentOf).mockReturnValue({
      getPrincipal: vi.fn().mockResolvedValue(Principal.anonymous()),
    } as never);

    await setup();

    triggerAuthEvent();

    await new Promise((r) => setTimeout(r, 50));
    expect(mockActor.getUser).not.toHaveBeenCalled();
  });

  it('should fallback to ensureUser when accepted identity attributes do not create a user', async () => {
    mockActor.getUser.mockResolvedValue([]);

    await setup();

    triggerAuthEvent({
      hasAttributes: true,
      openIdIssuer: 'https://openid.localhost',
      identityAttributes: {
        attributes: {} as never,
        keys: ['openid:https://openid.localhost:name'],
        nonce: new Uint8Array([1, 2, 3]),
      },
    });

    await vi.waitFor(
      () => {
        expect(mockActor.ensureUser).toHaveBeenCalledWith(['dev_openid']);
      },
      { timeout: 2500 },
    );
  });

  it('should request the verified email attribute for OpenID issuer sign-in', async () => {
    mockActor.getUser
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { id: 'test', inviter: [], createdAt: 0n, updatedAt: 0n },
      ]);
    mockAuthService.requestAttributes.mockResolvedValue({} as never);

    await setup();

    triggerAuthEvent({
      hasAttributes: true,
      openIdIssuer: 'https://openid.localhost',
    });

    await vi.waitFor(() => {
      expect(mockAuthService.requestAttributes).toHaveBeenCalledWith({
        keys: [
          'openid:https://openid.localhost:name',
          'openid:https://openid.localhost:email',
          'openid:https://openid.localhost:verified_email',
        ],
        nonce: new Uint8Array([1, 2, 3]),
      });
    });
  });
});
