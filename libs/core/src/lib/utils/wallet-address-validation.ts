import { keccak_256 } from '@noble/hashes/sha3.js';
import { base58 } from '@scure/base';

const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX = Array.from({ length: 256 }, (_, value) =>
  value.toString(16).padStart(2, '0'),
);

export function isValidEvmAddress(value: string): boolean {
  const address = value.trim();
  if (!EVM_ADDRESS_PATTERN.test(address)) return false;

  const hexAddress = address.slice(2);
  if (
    hexAddress === hexAddress.toLowerCase() ||
    hexAddress === hexAddress.toUpperCase()
  ) {
    return true;
  }

  return hasValidEip55Checksum(hexAddress);
}

export function isValidSolanaAddress(value: string): boolean {
  const address = value.trim();
  if (!address) return false;

  try {
    return base58.decode(address).length === 32;
  } catch {
    return false;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => HEX[byte]).join('');
}

function hasValidEip55Checksum(hexAddress: string): boolean {
  const lowerAddress = hexAddress.toLowerCase();
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(lowerAddress)));

  for (let index = 0; index < hexAddress.length; index++) {
    const character = hexAddress[index];
    if (character >= '0' && character <= '9') continue;

    const shouldBeUppercase = Number.parseInt(hash[index], 16) >= 8;
    const isUppercase = character.toUpperCase() === character;

    if (shouldBeUppercase !== isUppercase) {
      return false;
    }
  }

  return true;
}
