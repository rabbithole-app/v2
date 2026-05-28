export function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const sliced = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  if (sliced instanceof ArrayBuffer) return sliced;

  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
