export function canisterOrigin(canisterId: string, host: string): string {
  const url = new URL(host);

  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
    return `${url.protocol}//${canisterId}.localhost${url.port ? `:${url.port}` : ''}`;
  }

  return `https://${canisterId}.icp0.io`;
}

export function canisterUrl(canisterId: string, host: string, pathname = ''): string {
  const url = new URL(canisterOrigin(canisterId, host));
  url.pathname = pathname;
  return url.toString();
}
