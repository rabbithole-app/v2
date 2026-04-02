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

// ---- Constants ----

/** Public RPC endpoint for Base Sepolia testnet. */
export const BASE_SEPOLIA_RPC = "https://base-sepolia-rpc.publicnode.com";

/** Chain ID for Base Sepolia testnet. */
export const BASE_SEPOLIA_CHAIN_ID = 84532n;

/** Official Circle USDC on Base Sepolia. */
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

/** Placeholder USDT on Base Sepolia (no official Circle contract). */
export const BASE_SEPOLIA_USDT = "0x0000000000000000000000000000000000000000";

/**
 * Deterministic test funder wallet (seed: sha256("rabbithole-treasury-test-funder-v1")).
 * Fund this address on Base Sepolia with ETH + USDC before running EVM tests.
 */
export const TEST_FUNDER_PRIVATE_KEY =
  "0x189aef4312a0e16ba3872119c9895aaf51f83b0b292b4107b09673b03fad974a";
export const TEST_FUNDER_ADDRESS =
  "0x7ba0edcc915019b7ff8d2e27f2f19be960c022af";

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

/**
 * Fund an EVM address with ETH from the test funder wallet on Base Sepolia.
 * Sends a real transaction, waits for it to be mined.
 */
export async function fundWithEth(
  toAddress: string,
  amountWei: bigint,
): Promise<string> {
  const { nonce, gasPrice } = await getEvmTxParams(BASE_SEPOLIA_RPC, TEST_FUNDER_ADDRESS);
  const txHash = await signTransaction({
    rpcUrl: BASE_SEPOLIA_RPC,
    privateKey: TEST_FUNDER_PRIVATE_KEY,
    to: toAddress,
    value: amountWei,
    nonce,
    gasPrice,
    gasLimit: 21_000n,
    chainId: Number(BASE_SEPOLIA_CHAIN_ID),
  });
  await waitForTx(BASE_SEPOLIA_RPC, txHash);
  return txHash;
}

/**
 * Fund an EVM address with ERC-20 tokens (USDC) from the test funder wallet on Base Sepolia.
 * Sends a real transaction, waits for it to be mined.
 */
export async function fundWithUsdc(
  toAddress: string,
  amount: bigint,
): Promise<string> {
  const { nonce, gasPrice } = await getEvmTxParams(BASE_SEPOLIA_RPC, TEST_FUNDER_ADDRESS);
  const txHash = await sendErc20({
    rpcUrl: BASE_SEPOLIA_RPC,
    privateKey: TEST_FUNDER_PRIVATE_KEY,
    contract: BASE_SEPOLIA_USDC,
    to: toAddress,
    amount,
    nonce,
    gasPrice,
    chainId: Number(BASE_SEPOLIA_CHAIN_ID),
  });
  await waitForTx(BASE_SEPOLIA_RPC, txHash);
  return txHash;
}

// ---- Internal helpers ----

/** RLP requires 0 → empty bytes, not [0x00]. */
function bigintToBytes(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array(0);
  return numberToVarBytesBE(value);
}

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
