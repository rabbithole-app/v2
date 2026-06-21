module {
  public let MAX_CHUNK_SIZE : Nat = 2_097_152;
  public let MAX_HASHING_BYTES_PER_CALL : Nat = 62_914_560;
  public let ONCHAIN_UPLOAD_CHUNK_SIZE : Nat = 1_900_000;
  public let ENCRYPTED_CHUNK_OVERHEAD_BYTES : Nat = 28;
  public let ONCHAIN_UPLOAD_MAX_STORED_CHUNK_SIZE : Nat = 1_900_028;
  public let BATCH_EXPIRY_DURATION : Nat = 86_400_000_000_000; // 1 day (ns)

  // Subscription cache
  public let SUBSCRIPTION_CACHE_TTL : Nat = 86_400_000_000_000; // 24 hours (ns)

  // Cycle monitoring
  public let CYCLES_WARNING_DAYS : Nat = 30;
  public let CYCLES_CRITICAL_DAYS : Nat = 7;
  public let CYCLES_WARNING_COOLDOWN : Nat = 86_400_000_000_000; // 24 hours (ns)
  public let CYCLES_CRITICAL_COOLDOWN : Nat = 14_400_000_000_000; // 4 hours (ns)
};
