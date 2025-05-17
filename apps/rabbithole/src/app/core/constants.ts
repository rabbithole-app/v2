// How long the delegation identity should remain valid?
// e.g. BigInt(7 * 24 * 60 * 60 * 1000 * 1000 * 1000) = 7 days in nanoseconds
export const AUTH_MAX_TIME_TO_LIVE = BigInt(
  7 * 24 * 60 * 60 * 1000 * 1000 * 1000
);
export const APP_DERIVATION_ORIGIN = `https://${
  import.meta.env.CANISTER_ID_RABBITHOLE_FRONTEND
}.icp0.io`;
export const APP_ALTERNATIVE_ORIGIN = 'https://rabbithole.app';
