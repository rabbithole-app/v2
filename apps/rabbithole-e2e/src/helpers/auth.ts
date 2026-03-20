import {
  DelegationChain,
  Ed25519KeyIdentity,
} from '@icp-sdk/core/identity';
import { Page } from '@playwright/test';

const DB_NAME = 'auth-client-db';
const STORE_NAME = 'ic-keyval';
const DB_VERSION = 1;

/**
 * Seeds IndexedDB with a valid Ed25519 identity and delegation chain
 * so that AuthClient.isAuthenticated() returns true on page load.
 *
 * Must be called BEFORE navigating to the actual test page.
 * We first navigate to the app origin to gain access to IndexedDB,
 * then seed the data, then the test navigates to the desired URL.
 */
export async function seedAuthentication(page: Page): Promise<void> {
  // Generate auth data on the Node.js side (has access to @icp-sdk)
  const { identityJson, delegationJson } = await generateAuthData();

  // Navigate to origin first to get IndexedDB access
  await page.goto('/');

  // Inject into IndexedDB
  await page.evaluate(
    async ({ identityJson, delegationJson, DB_NAME, STORE_NAME, DB_VERSION }) => {
      function openDb(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }

      function putValue(
        db: IDBDatabase,
        key: string,
        value: unknown,
      ): Promise<void> {
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.put(value, key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }

      const db = await openDb();

      // AuthClient reads 'identity' as string (Ed25519KeyIdentity.fromJSON)
      await putValue(db, 'identity', identityJson);

      // AuthClient reads 'delegation' as string (DelegationChain.fromJSON)
      await putValue(db, 'delegation', delegationJson);

      // DelegationAuthService reads 'delegationChain' (same format)
      await putValue(db, 'delegationChain', delegationJson);

      db.close();
    },
    { identityJson, delegationJson, DB_NAME, STORE_NAME, DB_VERSION },
  );
}

/**
 * Generates a valid Ed25519 identity + self-signed delegation chain
 * and serializes them for injection into IndexedDB.
 */
async function generateAuthData() {
  // "II" key that signs the delegation (simulates Internet Identity)
  const iiKey = Ed25519KeyIdentity.generate();

  // Session key (the one stored in the browser)
  const sessionKey = Ed25519KeyIdentity.generate();

  // Create delegation: II delegates to session key, valid for 1 hour
  const chain = await DelegationChain.create(
    iiKey,
    sessionKey.getPublicKey(),
    new Date(Date.now() + 3_600_000),
  );

  // Serialize in the format AuthClient expects
  const identityJson = JSON.stringify(sessionKey.toJSON());
  const delegationJson = JSON.stringify(chain.toJSON());

  return { identityJson, delegationJson };
}
