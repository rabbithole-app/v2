import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { firstValueFrom, map, timer } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BalanceService } from '../services/balance.service';
import { ProfileService } from '../services/profile.service';
import { SubscriptionService } from '../services/subscription.service';
import { StoragesService } from '../storages/services/storages.service';
import { profileResolver } from './profile';

describe('profileResolver dashboard startup', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('starts dashboard account resources while waiting for the profile', async () => {
    const profileReadyAt = vi.fn();
    const resources: Record<string, { readyAt?: number; startedAt: number }> = {};
    const load = (name: string) => {
      resources[name] = { startedAt: Date.now() };
      return {
        loaded: new Promise<void>((resolve) =>
          setTimeout(() => {
            resources[name].readyAt = Date.now();
            resolve();
          }, 40),
        ),
      };
    };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ProfileService,
          useValue: {
            ready$: timer(40).pipe(
              map(() => {
                profileReadyAt(Date.now());
                return true;
              }),
            ),
            profile: () => null,
          },
        },
        { provide: StoragesService, useFactory: () => load('listStorages') },
        { provide: SubscriptionService, useFactory: () => load('getSubscription') },
        { provide: BalanceService, useFactory: () => load('walletAndRates') },
      ],
    });

    const resolved = firstValueFrom(
      TestBed.runInInjectionContext(() =>
        profileResolver(
          {} as ActivatedRouteSnapshot,
          {} as RouterStateSnapshot,
        ),
      ),
    );
    await resolved;
    const services = [
      TestBed.inject(StoragesService),
      TestBed.inject(SubscriptionService),
      TestBed.inject(BalanceService),
    ] as unknown as Array<{ loaded: Promise<void> }>;
    await Promise.all(services.map(({ loaded }) => loaded));

    expect(Object.keys(resources).sort()).toEqual(
      ['getSubscription', 'listStorages', 'walletAndRates'].sort(),
    );
    expect(profileReadyAt).toHaveBeenCalledOnce();
    const profileReadyTime = profileReadyAt.mock.calls[0][0];
    for (const resource of Object.values(resources)) {
      expect(resource.startedAt).toBeLessThanOrEqual(profileReadyTime);
      expect(resource.readyAt).toBeLessThanOrEqual(profileReadyTime);
    }
  });
});
