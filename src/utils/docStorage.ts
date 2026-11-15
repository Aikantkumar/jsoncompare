/**
 * docStorage.ts - Per-editor document persistence in sessionStorage.
 *
 * Editor content survives full-page navigations and reloads within the same
 * tab, and is cleared when the tab closes, matching the "100% local, no
 * uploads" promise. Nothing is ever sent to a server.
 *
 * Each entry is stored under the prefix 'jsoncompare:doc:' as
 * { text, filename, edited } serialized with JSON.stringify.
 *
 * All storage calls are wrapped in try/catch. A total size guard evicts
 * other (largest first) entries before writing, and QuotaExceededError is
 * swallowed so a large upload can never break typing or uploading.
 */

const PREFIX = 'jsoncompare:doc:';

// Session storage is per-origin and typically capped around 5-10 MB. Keep the
// combined footprint of all editor docs comfortably below that.
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

export interface StoredDoc {
  text: string;
  filename: string | null;
  edited: boolean;
}

function storageKey(persistKey: string): string {
  return PREFIX + persistKey;
}

function docKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
  } catch {
    // sessionStorage unavailable or locked
  }
  return keys;
}

function storedSize(key: string): number {
  try {
    const value = sessionStorage.getItem(key);
    return value === null ? 0 : value.length;
  } catch {
    return 0;
  }
}

export function readDoc(persistKey: string): StoredDoc | null {
  try {
    const raw = sessionStorage.getItem(storageKey(persistKey));
    if (raw === null) return null; // nothing stored
    const parsed = JSON.parse(raw) as Partial<StoredDoc>;
    return {
      text: typeof parsed.text === 'string' ? parsed.text : '',
      filename:
        parsed.filename === null || typeof parsed.filename === 'string' ? parsed.filename : null,
      edited: Boolean(parsed.edited),
    };
  } catch {
    return null;
  }
}

export function writeDoc(persistKey: string, doc: StoredDoc): void {
  try {
    const serialized = JSON.stringify(doc);
    const fullKey = storageKey(persistKey);

    let total = docKeys().reduce((sum, key) => sum + storedSize(key), 0);
    total -= storedSize(fullKey); // replace existing entry if any

    if (total + serialized.length > MAX_TOTAL_BYTES) {
      const others = docKeys()
        .filter((key) => key !== fullKey)
        .map((key) => ({ key, size: storedSize(key) }))
        .sort((a, b) => b.size - a.size);
      for (const other of others) {
        if (total + serialized.length <= MAX_TOTAL_BYTES) break;
        try {
          sessionStorage.removeItem(other.key);
        } catch {}
        total -= other.size;
      }
    }

    if (total + serialized.length <= MAX_TOTAL_BYTES) {
      sessionStorage.setItem(fullKey, serialized);
    }
    // Otherwise: skip persisting this doc silently.
  } catch (e) {
    const err = e as Error & { name?: string };
    if (err.name === 'QuotaExceededError') {
      return; // skip persisting this doc silently
    }
    // Any other storage failure: never break typing or uploading.
  }
}

export function removeDoc(persistKey: string): void {
  try {
    sessionStorage.removeItem(storageKey(persistKey));
  } catch {
    // ignore
  }
}
