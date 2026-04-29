import { APP_ALTERNATIVE_ORIGINS } from '@rabbithole/core';

export const isCustomDomain = () =>
  APP_ALTERNATIVE_ORIGINS.includes(
    location.origin as (typeof APP_ALTERNATIVE_ORIGINS)[number],
  );
