export function isCustomDomain(): boolean {
  return window.location.hostname !== 'localhost' &&
    !window.location.hostname.endsWith('.icp.net') &&
    !window.location.hostname.endsWith('.icp0.io');
}
