/**
 * Checks if the @silvia-odwyer/photon library supports the given image MIME type.
 *
 * Photon uses the Rust crate `image`, which supports the following formats:
 * - JPEG (image/jpeg, image/jpg)
 * - PNG (image/png)
 * - GIF (image/gif)
 * - WebP (image/webp)
 * - BMP (image/bmp)
 * - ICO (image/x-icon, image/vnd.microsoft.icon)
 * - TIFF (image/tiff, image/tif)
 *
 * @param mimeType - MIME type to check
 * @returns true if the format is supported by photon, false otherwise
 */
export function isPhotonSupportedMimeType(
  mimeType: string | null | undefined,
): boolean {
  if (!mimeType || !mimeType.startsWith('image/')) {
    return false;
  }

  const supportedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/tiff',
    'image/tif',
  ] as const;

  return supportedTypes.includes(
    mimeType.toLowerCase() as (typeof supportedTypes)[number],
  );
}
