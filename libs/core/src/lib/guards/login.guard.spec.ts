import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  GuardResult,
  RedirectCommand,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { AnonymousIdentity } from '@icp-sdk/core/agent';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { Observable, of } from 'rxjs';
import { TestScheduler } from 'rxjs/testing';
import { assert, describe, expect, it, vi } from 'vitest';

import { AUTH_SERVICE } from '@rabbithole/auth';

import { factoryDelegationIdentity } from '../testing/factory-delegation-identity';
import { loginGuard } from './login.guard';

function provideMockAuthService(value: Record<string, unknown>) {
  return { provide: AUTH_SERVICE, useValue: value };
}

describe('loginGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => loginGuard(...guardParameters));

  const testScheduler = new TestScheduler((actual, expected) => {
    assert.deepEqual(actual, expected);
  });

  const mockAuthServiceValue = {
    ready$: of(true),
    isAuthenticated: () => false,
    identity: () => new AnonymousIdentity(),
  };

  afterEach(() => vi.resetAllMocks());

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });

  it('should call isAuthenticated method', () => {
    vi.spyOn(mockAuthServiceValue, 'isAuthenticated').mockReturnValue(false);
    const module = TestBed.configureTestingModule({
      providers: [provideMockAuthService(mockAuthServiceValue)],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const route: ActivatedRouteSnapshot = { queryParams: {} } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state: RouterStateSnapshot = { url: '/' } as any;

    const mockAuthService = module.inject(AUTH_SERVICE);
    const result = executeGuard(route, state) as Observable<GuardResult>;
    result.subscribe(() => {
      expect(mockAuthService.isAuthenticated).toBeCalledTimes(1);
    });
  });

  it('should activate if user is not autentificated', () => {
    TestBed.configureTestingModule({
      providers: [provideMockAuthService(mockAuthServiceValue)],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const route: ActivatedRouteSnapshot = { queryParams: {} } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state: RouterStateSnapshot = { url: '/' } as any;

    testScheduler.run(({ expectObservable }) => {
      const result = executeGuard(route, state) as Observable<GuardResult>;
      const expected = '(a|)';
      expectObservable(result).toBe(expected, { a: true });
    });
  });

  it('should activate if user is autentificated with DelegationIdentity', async () => {
    const identity = await factoryDelegationIdentity();
    vi.spyOn(mockAuthServiceValue, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(mockAuthServiceValue, 'identity').mockReturnValue(identity);
    TestBed.configureTestingModule({
      providers: [provideMockAuthService(mockAuthServiceValue)],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const route: ActivatedRouteSnapshot = { queryParams: {} } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state: RouterStateSnapshot = { url: '/' } as any;

    testScheduler.run(({ expectObservable }) => {
      const result = executeGuard(route, state) as Observable<GuardResult>;
      const expected = '(a|)';
      expectObservable(result).toBe(expected, { a: true });
    });
  });

  it('should redirect if user is autentificated', () => {
    const identity = Ed25519KeyIdentity.generate();
    vi.spyOn(mockAuthServiceValue, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(mockAuthServiceValue, 'identity').mockReturnValue(identity);
    const module = TestBed.configureTestingModule({
      providers: [provideMockAuthService(mockAuthServiceValue)],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const route: ActivatedRouteSnapshot = { queryParams: {} } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state: RouterStateSnapshot = { url: '/' } as any;
    const router = module.inject(Router);

    testScheduler.run(({ expectObservable }) => {
      const result = executeGuard(route, state) as Observable<GuardResult>;
      const expected = '(a|)';
      expectObservable(result).toBe(expected, {
        a: new RedirectCommand(router.parseUrl('/'), { replaceUrl: true }),
      });
    });
  });
});

