import { DOCUMENT, Location } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Principal } from '@icp-sdk/core/principal';

const DEV_CANISTER_ID_QUERY_PARAM = 'canisterId';
const DEV_CANISTER_ID_STORAGE_KEY = 'rabbithole.storage.devCanisterId';

@Injectable({ providedIn: 'root' })
export class DevStorageCanisterIdService {
  #document = inject(DOCUMENT);
  #location = inject(Location);
  #router = inject(Router);

  resolve(): Principal | null {
    const fromQuery = this.#queryCanisterId();
    if (fromQuery) {
      const principal = parsePrincipal(fromQuery);
      if (!principal) {
        throw new Error(`Invalid "${DEV_CANISTER_ID_QUERY_PARAM}" query parameter: ${fromQuery}`);
      }

      this.#document.defaultView?.localStorage.setItem(
        DEV_CANISTER_ID_STORAGE_KEY,
        fromQuery,
      );
      return principal;
    }

    const fromHostname = parseCanisterIdFromHostname(
      this.#document.location.hostname,
    );
    if (fromHostname) return fromHostname;

    const fromStorage = this.#document.defaultView?.localStorage.getItem(
      DEV_CANISTER_ID_STORAGE_KEY,
    );
    if (!fromStorage) return null;

    const principal = parsePrincipal(fromStorage);
    if (principal) return principal;

    this.#document.defaultView?.localStorage.removeItem(
      DEV_CANISTER_ID_STORAGE_KEY,
    );
    return null;
  }

  #queryCanisterId(): string | null {
    const tree = this.#router.parseUrl(this.#location.path(true));
    const value = tree.queryParams[DEV_CANISTER_ID_QUERY_PARAM];

    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}

function parseCanisterIdFromHostname(hostname: string): Principal | null {
  if (hostname === 'localhost') return null;
  if (!hostname.endsWith('.localhost')) return null;

  return parsePrincipal(hostname.slice(0, -'.localhost'.length));
}

function parsePrincipal(value: string): Principal | null {
  try {
    return Principal.fromText(value);
  } catch {
    return null;
  }
}
