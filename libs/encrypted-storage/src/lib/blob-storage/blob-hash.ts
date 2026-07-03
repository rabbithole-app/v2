/** Blob root-hash wire conventions.
 *
 * The canister stores two shapes for a BlobStorage rootHash:
 * - Caffeine-managed blobs use the `sha256:`-prefixed form.
 * - External S3 replicas use bare lowercase hex.
 *
 * These helpers are the single source of truth for converting between the two,
 * so no call site re-implements the slice/regex. */

const SHA256_PREFIX = 'sha256:';
const BARE_HEX = /^[0-9a-f]{64}$/i;

/** True when a stored rootHash belongs to a Caffeine-managed blob (prefixed
 * form). Bare hex identifies an external S3 replica. */
export function isCaffeineManagedHash(rootHash: string): boolean {
  return rootHash.startsWith(SHA256_PREFIX);
}

/** Returns bare lowercase hex (used for the external S3 commit API and object
 * keys). Strips a leading `sha256:` when present. */
export function toBareHex(rootHash: string): string {
  return rootHash.startsWith(SHA256_PREFIX)
    ? rootHash.slice(SHA256_PREFIX.length).toLowerCase()
    : rootHash.toLowerCase();
}

/** Returns the `sha256:`-prefixed form (used for merkle verification and the
 * Caffeine commit API). Bare hex is upgraded; already-prefixed input is kept. */
export function toWirePrefixed(rootHash: string): string {
  return BARE_HEX.test(rootHash)
    ? `${SHA256_PREFIX}${rootHash.toLowerCase()}`
    : rootHash;
}
