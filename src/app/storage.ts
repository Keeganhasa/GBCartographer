/** Per-browser settings (localStorage) and the kept session of open pictures (IndexedDB). */

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Per-browser convenience only.
  }
}

/** The open pictures are kept in IndexedDB between launches (typed arrays and file handles store as they are). */
/**
 * The open pictures are kept in IndexedDB between launches. The database has its own name: the archived editor used
 * "gb-cartographer" (with an "autosave" store) on the same desktop address, and opening that one failed silently, so
 * the desktop app never kept its session (2026-10-09). Any failure is reported once in the console and resolves null.
 */
export const SESSION_DB = "gb-cartographer-session";
let sessionWarned = false;
export function sessionStore<T>(mode: IDBTransactionMode, run: (objects: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const fail = (resolve: (value: null) => void, error: unknown) => {
    if (!sessionWarned) { sessionWarned = true; console.error("GB Cartographer could not keep its session:", error); }
    resolve(null);
  };
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(SESSION_DB, 1);
      open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains("session")) open.result.createObjectStore("session"); };
      open.onerror = () => fail(resolve, open.error);
      open.onsuccess = () => {
        try {
          const db = open.result;
          const transaction = db.transaction("session", mode);
          const request = run(transaction.objectStore("session"));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => fail(resolve, request.error);
          transaction.oncomplete = () => db.close();
        } catch (error) {
          fail(resolve, error);
        }
      };
    } catch (error) {
      fail(resolve, error);
    }
  });
}
