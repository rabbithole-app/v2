import { APP_ALTERNATIVE_ORIGINS } from '@rabbithole/core/app-runtime';

export const isCustomDomain = () =>
  APP_ALTERNATIVE_ORIGINS.includes(
    location.origin as (typeof APP_ALTERNATIVE_ORIGINS)[number],
  );
