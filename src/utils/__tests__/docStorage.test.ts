import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readDoc, writeDoc, removeDoc } from '../docStorage.ts';

const PREFIX = 'jsoncompare:doc:';

function installShim(overLimit?: (storedBytes: number) => boolean): Map<string, string> {
  const store = new Map<string, string>();
  const sessionStorage = {
    get length(): number {
      return store.size;
    },
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (overLimit && overLimit(store.size + value.length)) {
        const err: any = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(key, String(value));
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    key(index: number): string | null {
      const keys = [...store.keys()];
      return keys[index] ?? null;
    },
    clear(): void {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: sessionStorage,
    writable: true,
    configurable: true,
  });
  return store;
}

describe('docStorage', () => {
  it('readDoc returns null when nothing is stored', () => {
    installShim();
    assert.strictEqual(readDoc('compare:left'), null);
  });

  it('writeDoc then readDoc round-trips text, filename and edited', () => {
    installShim();
    writeDoc('compare:left', { text: '{}', filename: 'file.json', edited: true });
    const stored = readDoc('compare:left');
    assert.strictEqual(stored?.text, '{}');
    assert.strictEqual(stored?.filename, 'file.json');
    assert.strictEqual(stored?.edited, true);
  });

  it('a stored empty doc is not null, so a cleared editor stays empty', () => {
    installShim();
    writeDoc('formatter:doc', { text: '', filename: null, edited: false });
    assert.strictEqual(readDoc('formatter:doc') === null, false);
    assert.strictEqual(readDoc('formatter:doc')?.text, '');
    assert.strictEqual(readDoc('formatter:doc')?.edited, false);
  });

  it('keys are namespaced per persistKey', () => {
    installShim();
    writeDoc('a', { text: '1', filename: null, edited: false });
    writeDoc('b', { text: '2', filename: null, edited: false });
    assert.strictEqual(readDoc('a')?.text, '1');
    assert.strictEqual(readDoc('b')?.text, '2');
    assert.strictEqual(readDoc('c'), null);
  });

  it('storage keys carry the jsoncompare:doc: prefix', () => {
    const store = installShim();
    writeDoc('x', { text: 't', filename: null, edited: false });
    assert.ok([...store.keys()].some((key) => key === PREFIX + 'x'));
  });

  it('removeDoc deletes the entry', () => {
    installShim();
    writeDoc('tmp', { text: 't', filename: null, edited: false });
    removeDoc('tmp');
    assert.strictEqual(readDoc('tmp'), null);
  });

  it('missing sessionStorage does not throw', () => {
    const original = globalThis.sessionStorage;
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    assert.strictEqual(readDoc('any'), null);
    assert.doesNotThrow(() => writeDoc('any', { text: 't', filename: null, edited: false }));
    assert.doesNotThrow(() => removeDoc('any'));
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: original,
      writable: true,
      configurable: true,
    });
  });

  it('QuotaExceededError is swallowed silently and never breaks the doc', () => {
    installShim((bytes) => bytes > 1000);
    assert.doesNotThrow(() => writeDoc('big', { text: 'x'.repeat(2000), filename: null, edited: false }));
    assert.strictEqual(readDoc('big'), null);
  });

  it('total size guard evicts other docs instead of throwing', () => {
    installShim();
    const big = 'x'.repeat(1_200_000);
    writeDoc('d1', { text: big, filename: null, edited: false });
    writeDoc('d2', { text: big, filename: null, edited: false });
    writeDoc('d3', { text: big, filename: null, edited: false });
    assert.doesNotThrow(() => writeDoc('d4', { text: big, filename: null, edited: false }));
    assert.strictEqual(readDoc('d4')?.text, big);
  });
});
