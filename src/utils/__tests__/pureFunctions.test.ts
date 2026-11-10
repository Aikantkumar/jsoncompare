import assert from 'assert';
import { isLargeText, LIVE_COMPUTE_MAX_CHARS, formatBytes } from '../fileIO.ts';
import { deriveDownloadName } from '../download.ts';
import { acceptForMode } from '../converterModes.ts';

// --- isLargeText ---

assert.strictEqual(isLargeText(''), false);
assert.strictEqual(isLargeText('a'.repeat(10)), false);
assert.strictEqual(isLargeText('a'.repeat(LIVE_COMPUTE_MAX_CHARS)), false);
assert.strictEqual(isLargeText('a'.repeat(LIVE_COMPUTE_MAX_CHARS + 1)), true);

// --- formatBytes ---

assert.strictEqual(formatBytes(0), '0 B');
assert.strictEqual(formatBytes(512), '512 B');
assert.strictEqual(formatBytes(1500), '1.46 KB');
assert.strictEqual(formatBytes(1024 * 1024), '1.00 MB');
assert.strictEqual(formatBytes(5 * 1024 * 1024), '5.00 MB');

// --- deriveDownloadName ---

assert.strictEqual(deriveDownloadName('users.json', '.min', 'fallback'), 'users.min.json');
assert.strictEqual(deriveDownloadName('data.txt', '.sorted', 'fallback'), 'data.sorted.txt');
assert.strictEqual(deriveDownloadName('noextension', '.json', 'fallback'), 'noextension.json');
assert.strictEqual(deriveDownloadName(null, '.json', 'fallback.json'), 'fallback.json');
assert.strictEqual(deriveDownloadName('', '.json', 'fallback.json'), 'fallback.json');
assert.strictEqual(deriveDownloadName('archive.tar.gz', '.bak', 'fallback'), 'archive.tar.bak.gz');

// --- acceptForMode ---

const modes = ['yaml-to-json', 'json-to-yaml', 'xml-to-json', 'json-to-xml', 'csv-to-json', 'json-to-csv'] as const;
for (const m of modes) {
  const acc = acceptForMode(m);
  assert.ok(Array.isArray(acc) && acc.length > 0, `${m} should return non-empty accept list`);
  assert.ok(acc.every((a) => a.startsWith('.')), `${m} accept entries should start with '.'`);
}

// Specific known lists
assert.deepStrictEqual(acceptForMode('json-to-yaml'), ['.json', '.txt']);
assert.deepStrictEqual(acceptForMode('yaml-to-json'), ['.yaml', '.yml', '.txt']);
assert.deepStrictEqual(acceptForMode('json-to-xml'), ['.json', '.txt']);
assert.deepStrictEqual(acceptForMode('xml-to-json'), ['.xml', '.txt']);
assert.deepStrictEqual(acceptForMode('csv-to-json'), ['.csv', '.tsv', '.txt']);
assert.deepStrictEqual(acceptForMode('json-to-csv'), ['.json', '.txt']);

// --- decorate-sort-undecorate vs old comparator order ---

function oldSortArrays(val: any): any[] {
  return [...val].sort((a, b) => {
    const sa = typeof a === 'object' ? JSON.stringify(a) : String(a);
    const sb = typeof b === 'object' ? JSON.stringify(b) : String(b);
    return sa.localeCompare(sb);
  });
}

function newSortArrays(val: any): any[] {
  const decorated = val.map((item: any) => ({
    key: typeof item === 'object' ? JSON.stringify(item) : String(item),
    value: item,
  }));
  decorated.sort((a: any, b: any) => a.key.localeCompare(b.key));
  return decorated.map((d: any) => d.value);
}

const randomArrays: any[][] = [
  [3, 1, 2],
  ['b', 'a', 'c'],
  [{ z: 1 }, { a: 2 }, { m: 3 }],
  [{ id: 3, name: 'c' }, { id: 1, name: 'a' }, { id: 2, name: 'b' }],
  [10, 2, 5, 1, 8],
];

for (const arr of randomArrays) {
  const oldResult = oldSortArrays(arr);
  const newResult = newSortArrays(arr);
  assert.deepStrictEqual(
    newResult.map((x: any) => JSON.stringify(x)),
    oldResult.map((x: any) => JSON.stringify(x)),
    `DSU order mismatch for ${JSON.stringify(arr)}`
  );
}

console.log('All pure-function tests passed.');
