// IndexedDB schema + migrations (architecture §3, data-model 07). Local-only.
// Stores: dismissals (per-host hash + TTL), rdap-cache (per-host, 30d), feedback-queue (opt-in).
//
// Skeleton: opens/creates the object stores. Read/write helpers live in the
// per-store modules (dismissals.ts) and rdap/cache.ts.

export const DB_NAME = 'read-twice';
export const DB_VERSION = 1;

export const STORES = {
  dismissals: 'dismissals',
  rdapCache: 'rdap-cache',
  feedbackQueue: 'feedback-queue',
} as const;

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.dismissals)) db.createObjectStore(STORES.dismissals, { keyPath: 'host' });
      if (!db.objectStoreNames.contains(STORES.rdapCache)) db.createObjectStore(STORES.rdapCache, { keyPath: 'host' });
      if (!db.objectStoreNames.contains(STORES.feedbackQueue)) db.createObjectStore(STORES.feedbackQueue, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
