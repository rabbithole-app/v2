import { ApplicationInitStatus, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnonymousIdentity } from '@icp-sdk/core/agent';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_SERVICE } from '@rabbithole/auth';

import { HTTP_AGENT_TOKEN } from '../injectors/http-agent';
import { MAIN_ACTOR_TOKEN } from '../injectors/main-actor';
import { MAIN_CANISTER_ID_TOKEN } from '../tokens';

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
    const replacedUrl = replaceStateSpy.mock.lastCall![2] as string;
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
    const replacedUrl = replaceStateSpy.mock.lastCall![2] as string;
    expect(replacedUrl).toContain('redirectUrl');
    expect(replacedUrl).toContain('lang=en');
    expect(replacedUrl).not.toContain('ref=');
  });
});

// ── Registration ────────────────────────────────────────────────────

describe('provideRegistration', () => {
  const isAuthenticated = signal(false);
  const mockActor = {
    getUser: vi.fn(),
    register: vi.fn(),
  };
  const actorSignal = signal(mockActor);

  const mockAuthService = {
    ready$: of(true),
    isAuthenticated,
    identity: signal(new AnonymousIdentity()),
    principalId: signal('anonymous'),
    signIn: vi.fn(),
    signOut: vi.fn(),
  };

  beforeEach(() => {
    sessionStorage.clear();
    isAuthenticated.set(false);
    mockActor.getUser.mockReset();
    mockActor.register.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  async function setup() {
    const { provideRegistration } = await import('./registration.service');

    TestBed.configureTestingModule({
      providers: [
        { provide: AUTH_SERVICE, useValue: mockAuthService },
        { provide: MAIN_ACTOR_TOKEN, useValue: actorSignal },
        { provide: HTTP_AGENT_TOKEN, useValue: signal(null) },
        { provide: MAIN_CANISTER_ID_TOKEN, useValue: 'aaaaa-aa' },
        provideRegistration(),
      ],
    });
  }

  it('should call register when user does not exist', async () => {
    mockActor.getUser.mockResolvedValue([]);
    mockActor.register.mockResolvedValue(undefined);

    await setup();

    // Trigger authentication
    isAuthenticated.set(true);
    TestBed.tick();

    // Wait for async ensureRegistered
    await vi.waitFor(() => {
      expect(mockActor.getUser).toHaveBeenCalledOnce();
      expect(mockActor.register).toHaveBeenCalledWith([]);
    });
  });

  it('should not call register when user already exists', async () => {
    mockActor.getUser.mockResolvedValue([
      { id: 'test', inviter: [], createdAt: 0n, updatedAt: 0n },
    ]);

    await setup();

    isAuthenticated.set(true);
    TestBed.tick();

    await vi.waitFor(() => {
      expect(mockActor.getUser).toHaveBeenCalledOnce();
    });
    expect(mockActor.register).not.toHaveBeenCalled();
  });

  it('should pass referral code from sessionStorage to register', async () => {
    sessionStorage.setItem('referralCode', 'ABC123');
    mockActor.getUser.mockResolvedValue([]);
    mockActor.register.mockResolvedValue(undefined);

    await setup();

    isAuthenticated.set(true);
    TestBed.tick();

    await vi.waitFor(() => {
      expect(mockActor.register).toHaveBeenCalledWith(['ABC123']);
    });
    expect(sessionStorage.getItem('referralCode')).toBeNull();
  });

  it('should not call register when not authenticated', async () => {
    await setup();

    // Stay unauthenticated
    TestBed.tick();

    // Give time for any potential async calls
    await new Promise((r) => setTimeout(r, 50));
    expect(mockActor.getUser).not.toHaveBeenCalled();
  });
});
