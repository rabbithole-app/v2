/**
 * Minimal EVM transaction signer for test purposes.
 * Uses @noble/curves (secp256k1) and @noble/hashes (keccak256, utils) — both
 * already in the dependency tree via @dfinity/pic.
 *
 * Supports:
 * - Legacy (type 0) ETH transfers
 * - ERC-20 transfer(address,uint256) calls
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { numberToBytesBE, numberToVarBytesBE } from "@noble/curves/utils";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  hexToBytes as _hexToBytes,
  bytesToHex,
  concatBytes,
} from "@noble/hashes/utils";

// ---- Helpers ----

interface SignTxParams {
  chainId: number;
  data?: Uint8Array;
  gasLimit: bigint;
  gasPrice: bigint;
  nonce: number;
  privateKey: string;
  rpcUrl: string;
  to: string;
  value: bigint;
}

/**
 * Encode ERC-20 transfer(address,uint256) calldata.
 */
export function encodeErc20Transfer(to: string, amount: bigint): Uint8Array {
  const selector = hexToBytes("a9059cbb");
  const addressBytes = padLeft(hexToBytes(to), 32);
  const amountBytes = numberToBytesBE(amount, 32);
  return concatBytes(selector, addressBytes, amountBytes);
}

/**
 * Get nonce and gas price from RPC.
 */
export async function getEvmTxParams(
  rpcUrl: string,
  address: string,
): Promise<{ gasPrice: bigint; nonce: number; }> {
  const [nonceRes, gasPriceRes] = await Promise.all([
    fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionCount",
        params: [address, "latest"],
      }),
    }),
    fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "eth_gasPrice",
        params: [],
      }),
    }),
  ]);

  const nonceData = (await nonceRes.json()) as { result: string };
  const gasPriceData = (await gasPriceRes.json()) as { result: string };

  return {
    nonce: parseInt(nonceData.result, 16),
    gasPrice: BigInt(gasPriceData.result),
  };
}

// ---- RLP encoding ----

/**
 * Send ERC-20 tokens from the test funder wallet.
 */
export async function sendErc20(params: {
  amount: bigint;
  chainId: number;
  contract: string;
  gasPrice: bigint;
  nonce: number;
  privateKey: string;
  rpcUrl: string;
  to: string;
}): Promise<string> {
  const data = encodeErc20Transfer(params.to, params.amount);
  return signTransaction({
    rpcUrl: params.rpcUrl,
    privateKey: params.privateKey,
    to: params.contract,
    value: 0n,
    nonce: params.nonce,
    gasPrice: params.gasPrice,
    gasLimit: 65_000n,
    chainId: params.chainId,
    data,
  });
}

/**
 * Sign and broadcast a legacy (type 0) transaction on an EVM chain.
 * Returns the transaction hash.
 */
export async function signTransaction(params: SignTxParams): Promise<string> {
  const { rpcUrl, privateKey, to, value, nonce, gasPrice, gasLimit, chainId } =
    params;
  const data = params.data ?? new Uint8Array(0);
  const privKeyBytes = hexToBytes(privateKey);

  // EIP-155 signing: RLP([nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0])
  const rawForSigning = rlpEncodeList([
    bigintToBytes(BigInt(nonce)),
    bigintToBytes(gasPrice),
    bigintToBytes(gasLimit),
    hexToBytes(to),
    bigintToBytes(value),
    data,
    bigintToBytes(BigInt(chainId)),
    new Uint8Array(0),
    new Uint8Array(0),
  ]);

  const hash = keccak_256(rawForSigning);
  const sig = secp256k1.sign(hash, privKeyBytes);

  // EIP-155: v = recoveryParam + chainId * 2 + 35
  const v = BigInt(sig.recovery) + BigInt(chainId) * 2n + 35n;

  // Signed transaction: RLP([nonce, gasPrice, gasLimit, to, value, data, v, r, s])
  const signedTx = rlpEncodeList([
    bigintToBytes(BigInt(nonce)),
    bigintToBytes(gasPrice),
    bigintToBytes(gasLimit),
    hexToBytes(to),
    bigintToBytes(value),
    data,
    bigintToBytes(v),
    bigintToBytes(sig.r),
    bigintToBytes(sig.s),
  ]);

  const rawTxHex = "0x" + bytesToHex(signedTx);

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_sendRawTransaction",
      params: [rawTxHex],
    }),
  });

  const json = (await res.json()) as {
    error?: { code: number; message: string };
    result?: string;
  };

  if (json.error) {
    throw new Error(
      `eth_sendRawTransaction failed: ${json.error.message} (code: ${json.error.code})`,
    );
  }

  return json.result!;
}

/**
 * Wait for a transaction to be mined.
 */
export async function waitForTx(
  rpcUrl: string,
  txHash: string,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [txHash],
      }),
    });
    const json = (await res.json()) as { result: unknown };
    if (json.result !== null) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`Transaction ${txHash} not mined within ${timeoutMs}ms`);
}

// ---- ERC-20 ABI encoding ----

/** RLP requires 0 → empty bytes, not [0x00]. */
function bigintToBytes(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array(0);
  return numberToVarBytesBE(value);
}

// ---- Transaction signing ----

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length === 0) return new Uint8Array(0);
  return _hexToBytes(clean.length % 2 ? "0" + clean : clean);
}

function padLeft(data: Uint8Array, length: number): Uint8Array {
  if (data.length >= length) return data;
  const result = new Uint8Array(length);
  result.set(data, length - data.length);
  return result;
}

function rlpEncodeItem(data: Uint8Array): Uint8Array {
  if (data.length === 1 && data[0] < 0x80) {
    return data;
  }
  const prefix = rlpEncodeLength(data.length, 0x80);
  return concatBytes(prefix, data);
}

function rlpEncodeLength(len: number, offset: number): Uint8Array {
  if (len < 56) {
    return new Uint8Array([len + offset]);
  }
  const lenBytes = numberToVarBytesBE(len);
  return new Uint8Array([offset + 55 + lenBytes.length, ...lenBytes]);
}

function rlpEncodeList(items: Uint8Array[]): Uint8Array {
  const payload = concatBytes(...items.map(rlpEncodeItem));
  const prefix = rlpEncodeLength(payload.length, 0xc0);
  return concatBytes(prefix, payload);
}
