/** Blob storage protocol chunk size: 1 MiB */
export const CAFFEINE_CHUNK_SIZE = 1_048_576;

/** AES-GCM overhead per chunk: 12 bytes IV + 16 bytes auth tag */
export const AES_GCM_OVERHEAD = 28;

/** Max plaintext that fits in one blob storage chunk after AES-GCM encryption */
export const CAFFEINE_PLAINTEXT_CHUNK_SIZE =
  CAFFEINE_CHUNK_SIZE - AES_GCM_OVERHEAD;
