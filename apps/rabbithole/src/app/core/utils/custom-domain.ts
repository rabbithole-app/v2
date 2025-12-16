import { APP_ALTERNATIVE_ORIGIN } from '@rabbithole/core';

export const isCustomDomain = () => location.origin === APP_ALTERNATIVE_ORIGIN;
