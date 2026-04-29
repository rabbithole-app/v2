import { AuthClient } from '@icp-sdk/auth/client';

export const createAuthClient = async (): Promise<AuthClient> =>
  new AuthClient({
    idleOptions: {
      disableIdle: true,
      disableDefaultIdleCallback: true,
    },
  });
