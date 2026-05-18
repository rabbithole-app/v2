import { Identity } from '@icp-sdk/core/agent';
import { describe, expect, it, vi } from 'vitest';

import { createAuthClient } from './create-auth-client';
import { loadIdentity } from './worker';

vi.mock('./create-auth-client', () => ({
  createAuthClient: vi.fn(),
}));

describe('loadIdentity', () => {
  it('restores a non-anonymous AuthClient identity without checking localStorage-backed auth state', async () => {
    const identity = {
      getPrincipal: () => ({
        isAnonymous: () => false,
        toText: () => 'owner-principal',
      }),
    } as Identity;
    const isAuthenticated = vi.fn(() => {
      throw new Error('localStorage is not available');
    });

    vi.mocked(createAuthClient).mockResolvedValue({
      getIdentity: vi.fn(async () => identity),
      isAuthenticated,
    } as never);

    await expect(loadIdentity()).resolves.toBe(identity);
    expect(isAuthenticated).not.toHaveBeenCalled();
  });
});
