import { describe, expect, it } from 'vitest';

import {
  isValidEvmAddress,
  isValidSolanaAddress,
} from './wallet-address-validation';

describe('wallet address validation', () => {
  describe('EVM addresses', () => {
    it('accepts lowercase and uppercase hex addresses', () => {
      expect(
        isValidEvmAddress('0xde709f2102306220921060314715629080e2fb77'),
      ).toBe(true);
      expect(
        isValidEvmAddress('0XDE709F2102306220921060314715629080E2FB77'),
      ).toBe(false);
      expect(
        isValidEvmAddress('0xDE709F2102306220921060314715629080E2FB77'),
      ).toBe(true);
    });

    it('validates mixed-case EIP-55 checksums', () => {
      expect(
        isValidEvmAddress('0x52908400098527886E0F7030069857D2E4169EE7'),
      ).toBe(true);
      expect(
        isValidEvmAddress('0x52908400098527886e0F7030069857D2E4169EE7'),
      ).toBe(false);
    });

    it('rejects malformed EVM addresses', () => {
      expect(isValidEvmAddress('')).toBe(false);
      expect(isValidEvmAddress('0x1234')).toBe(false);
      expect(
        isValidEvmAddress('0xZZZZ8400098527886E0F7030069857D2E4169EE7'),
      ).toBe(false);
    });
  });

  describe('Solana addresses', () => {
    it('accepts base58-encoded 32-byte public keys', () => {
      expect(isValidSolanaAddress('11111111111111111111111111111111')).toBe(
        true,
      );
      expect(
        isValidSolanaAddress('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      ).toBe(true);
    });

    it('rejects invalid base58 strings and wrong byte lengths', () => {
      expect(isValidSolanaAddress('')).toBe(false);
      expect(isValidSolanaAddress('0')).toBe(false);
      expect(isValidSolanaAddress('111')).toBe(false);
    });
  });
});
