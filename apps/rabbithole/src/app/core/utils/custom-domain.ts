import { APP_ALTERNATIVE_ORIGIN } from '../constants';

export const isCustomDomain = () => location.origin === APP_ALTERNATIVE_ORIGIN;
