export function isCustomDomain(): boolean {
  return window.location.hostname !== 'localhost' &&
    !window.location.hostname.endsWith('.ic0.app') &&
    !window.location.hostname.endsWith('.icp0.io');
}


