/**
 * IC HTTP response certificate verification (v1 certification).
 *
 * Verifies that an HTTP response from a canister is authentic by checking
 * the IC-Certificate header against the subnet's BLS signature and the
 * canister's certified data Merkle tree.
 *
 * Extracted from the pattern in asset.ts:isCertified() for reuse.
 */

import {
  Cbor as cbor,
  Certificate,
  type HashTree,
  type HttpAgent,
  lookup_path,
  LookupPathStatus,
  lookupResultToBuffer,
  reconstruct,
} from '@icp-sdk/core/agent';
import { compare, lebDecode, PipeArrayBuffer } from '@icp-sdk/core/candid';
import type { Principal } from '@icp-sdk/core/principal';
import { sha256 } from '@noble/hashes/sha2';

import { base64Decode } from './base64';

const MAX_CERT_TIME_OFFSET_MS = 300_000; // 5 min

export interface CertifiedHttpResponse {
  status_code: number;
  headers: [string, string][];
  body: Uint8Array | number[];
}

/**
 * Verify an IC HTTP response certificate (v1 certification).
 *
 * Steps:
 * 1. Parse IC-Certificate header -> certificate + tree
 * 2. Verify BLS signature via Certificate.create()
 * 3. Verify certificate freshness (+-5 min)
 * 4. Verify certified_data matches reconstructed tree root
 * 5. Lookup body hash at ['http_assets', path] in the tree
 * 6. Compare with SHA-256 of response body
 *
 * @returns The verified response body as Uint8Array
 * @throws If any verification step fails
 */
export async function verifyIcCertificate(
  response: CertifiedHttpResponse,
  path: string,
  agent: HttpAgent,
  canisterId: Principal,
): Promise<Uint8Array> {
  if (!agent.rootKey) throw new Error('Agent missing root key');

  // 1. Parse IC-Certificate header
  const certHeader = response.headers.find(
    ([key]) => key.trim().toLowerCase() === 'ic-certificate',
  );
  if (!certHeader) throw new Error('Missing IC-Certificate header');

  let certificate: Uint8Array | undefined;
  let tree: Uint8Array | undefined;
  for (const field of certHeader[1].split(/,/)) {
    const match = field.match(/^\s*(.+?)\s*=\s*:\s*(.+?)\s*:\s*$/);
    if (!match) continue;
    const [, name, b64Value] = match;
    const value = base64Decode(b64Value);
    if (name === 'certificate') certificate = value;
    else if (name === 'tree') tree = value;
  }
  if (!certificate || !tree) throw new Error('Invalid IC-Certificate header');

  // 2. Verify BLS signature
  const cert = await Certificate.create({
    certificate,
    rootKey: agent.rootKey,
    principal: { canisterId },
  });

  // 3. Verify freshness
  const timeLookup = cert.lookup_path(['time']);
  if (
    timeLookup.status !== LookupPathStatus.Found ||
    !(timeLookup.value instanceof Uint8Array)
  ) {
    throw new Error('No time in certificate');
  }
  const certTime = Number(
    lebDecode(new PipeArrayBuffer(timeLookup.value)) / 1_000_000n,
  );
  if (Math.abs(Date.now() - certTime) > MAX_CERT_TIME_OFFSET_MS) {
    throw new Error('Certificate time out of range');
  }

  // 4. Verify certified_data matches tree root
  const hashTree = cbor.decode<HashTree>(tree);
  const reconstructed = await reconstruct(hashTree);
  const witness = cert.lookup_path([
    'canister',
    canisterId.toUint8Array(),
    'certified_data',
  ]);
  if (
    witness.status !== LookupPathStatus.Found ||
    !(witness.value instanceof Uint8Array)
  ) {
    throw new Error('No certified_data in certificate');
  }
  if (compare(witness.value, reconstructed) !== 0) {
    throw new Error('certified_data does not match tree root');
  }

  // 5. Lookup body hash in v1 cert tree
  const treeSha = lookupResultToBuffer(
    lookup_path(['http_assets', path], hashTree),
  );
  if (!treeSha) throw new Error('Path not found in certificate tree');

  // 6. Verify response body hash
  const body =
    response.body instanceof Uint8Array
      ? response.body
      : new Uint8Array(response.body);
  const bodyHash = sha256(body);
  if (compare(treeSha, bodyHash) !== 0) {
    throw new Error('Response body hash does not match certified hash');
  }

  return body;
}
