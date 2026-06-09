import { describe, expect, it } from 'vitest';

import { buildUpgradeSteps } from './upgrade-steps';

describe('buildUpgradeSteps', () => {
  it('keeps the frontend upload step visible during frontend-only upgrades', () => {
    const steps = buildUpgradeSteps(
      {
        canisterId: {} as never,
        progress: { processed: 10, total: 100 },
        type: 'UpgradingFrontend',
      },
      {
        frontendUpdateAvailable: true,
        wasmUpdateAvailable: false,
      },
    );

    expect(steps.map((step) => step.id)).toEqual([
      'permissions',
      'frontend',
      'finalize',
    ]);
    expect(steps.find((step) => step.id === 'frontend')).toMatchObject({
      progress: {
        current: 10,
        total: 100,
      },
      status: 'in-progress',
    });
  });
});
