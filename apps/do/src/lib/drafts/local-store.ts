/**
 * IndexedDB-backed local draft store.
 *
 * Final Supplement §1.3 / CLAUDE.md cross-cutting requirement #3:
 *   "Drafts never lost. Every error path saves the user's reply text
 *    to Zustand + service worker cache + deskof_replies."
 *
 * The server-side `deskof_replies` row is the canonical store, but it
 * requires a network round-trip and can be a step or two behind. The
 * IndexedDB layer here guarantees that:
 *
 *   - A reload mid-keystroke recovers exactly what the user typed
 *   - An offline edit is preserved until the next successful save
 *   - A server-side save failure leaves the local copy intact
 *
 * Stored under deskof_drafts → keyed by opportunity_id. The schema
 * is intentionally trivial; this is rescue state, not history.
 */

const DB_NAME = "deskof";
const DB_VERSION = 1;
const STORE = "drafts";

interface LocalDraft {
  opportunity_id: string;
  content: string;
  revision: number;
  updated_at: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "opportunity_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

export async function saveLocalDraft(draft: LocalDraft): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(draft);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("draft save failed"));
    });
    db.close();
  } catch {
    // IndexedDB unavailable (private mode, quota, etc.) — fall through
    // silently. The server-side draft is the next layer of defense.
  }
}

export async function loadLocalDraft(
  opportunityId: string
): Promise<LocalDraft | null> {
  try {
    const db = await openDb();
    const value = await new Promise<LocalDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(opportunityId);
      req.onsuccess = () => resolve((req.result as LocalDraft) ?? null);
      req.onerror = () => reject(req.error ?? new Error("draft read failed"));
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

export async function deleteLocalDraft(opportunityId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(opportunityId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("draft delete failed"));
    });
    db.close();
  } catch {
    // ignore
  }
}
