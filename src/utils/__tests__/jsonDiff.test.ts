import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeLineDiff, type DiffStats } from '../jsonDiff.ts';

function linesOf(text: string): string[] {
  return text ? text.split('\n') : [];
}

function lcsLength(a: string[], b: string[]): number {
  const n = a.length;
  const m = b.length;
  let prev = new Array<number>(m + 1).fill(0);
  let curr = new Array<number>(m + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      curr[j] = a[i] === b[j] ? 1 + prev[j + 1] : Math.max(prev[j], curr[j + 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[0];
}

describe('computeLineDiff (Myers O(ND)) vs reference LCS', () => {
  it('identical inputs are all unchanged with zero changes', () => {
    const text = JSON.stringify({ a: 1, b: [1, 2] }, null, 2);
    const res = computeLineDiff(text, text);
    assert.strictEqual(res.degraded, false);
    assert.strictEqual(res.stats.unchanged, linesOf(text).length);
    assert.strictEqual(res.stats.totalChanges, 0);
    assert.strictEqual(res.stats.added, 0);
    assert.strictEqual(res.stats.removed, 0);
    assert.strictEqual(res.stats.modified, 0);
    assert.deepStrictEqual(res.stats.added + res.stats.removed + res.stats.modified, res.stats.totalChanges);
  });

  it('empty vs empty', () => {
    const res = computeLineDiff('', '');
    assert.strictEqual(res.degraded, false);
    assert.strictEqual(res.stats.totalChanges, 0);
    assert.deepStrictEqual(res.lines, []);
  });

  it('empty vs non-empty is all added', () => {
    const res = computeLineDiff('', 'a\nb\nc');
    assert.strictEqual(res.degraded, false);
    assert.strictEqual(res.stats.added, 3);
    assert.strictEqual(res.stats.removed, 0);
    assert.strictEqual(res.stats.unchanged, 0);
    assert.strictEqual(res.stats.totalChanges, 3);
  });

  it('non-empty vs empty is all removed', () => {
    const res = computeLineDiff('a\nb\nc', '');
    assert.strictEqual(res.degraded, false);
    assert.strictEqual(res.stats.added, 0);
    assert.strictEqual(res.stats.removed, 3);
    assert.strictEqual(res.stats.totalChanges, 3);
  });

  it('single line replacement is paired as modified', () => {
    const res = computeLineDiff('a', 'b');
    assert.strictEqual(res.degraded, false);
    assert.strictEqual(res.stats.modified, 1);
    assert.strictEqual(res.stats.totalChanges, 1);
    assert.strictEqual(res.lines.length, 1);
    assert.strictEqual(res.lines[0]!.type, 'modified');
    assert.strictEqual(res.lines[0]!.leftText, 'a');
    assert.strictEqual(res.lines[0]!.rightText, 'b');
  });

  it('common prefix/suffix trimmed, core diffed', () => {
    const res = computeLineDiff('keep\nchanged\nkeep', 'keep\nchanged2\nkeep');
    assert.strictEqual(res.degraded, false);
    assert.strictEqual(res.stats.unchanged, 2);
    assert.strictEqual(res.stats.modified, 1);
    assert.strictEqual(res.stats.totalChanges, 1);
  });

  it('insertion in the middle', () => {
    const res = computeLineDiff('a\nb\nc', 'a\nx\nb\nc');
    assert.strictEqual(res.degraded, false);
    assert.strictEqual(res.stats.unchanged, 3);
    assert.strictEqual(res.stats.added, 1);
    assert.strictEqual(res.stats.totalChanges, 1);
  });

  it('deletion in the middle', () => {
    const res = computeLineDiff('a\nx\nb\nc', 'a\nb\nc');
    assert.strictEqual(res.degraded, false);
    assert.strictEqual(res.stats.unchanged, 3);
    assert.strictEqual(res.stats.removed, 1);
    assert.strictEqual(res.stats.totalChanges, 1);
  });

  it('Myers unchanged count matches reference LCS on random small inputs', () => {
    const alphabet = ['x', 'y', 'z', 'w'];
    const seed = 12345;
    let state = seed;
    const rand = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    for (let trial = 0; trial < 200; trial++) {
      const make = () => {
        const len = Math.floor(rand() * 8);
        return Array.from({ length: len }, () => alphabet[Math.floor(rand() * alphabet.length)]);
      };
      const a = make();
      const b = make();
      const leftText = a.join('\n');
      const rightText = b.join('\n');
      const res = computeLineDiff(leftText, rightText);
      assert.strictEqual(res.degraded, false, `degraded on small input trial ${trial}`);
      const expectedUnchanged = lcsLength(a, b);
      assert.strictEqual(
        res.stats.unchanged,
        expectedUnchanged,
        `Myers unchanged mismatch trial ${trial}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
      );
      assert.strictEqual(res.stats.added + res.stats.removed + res.stats.modified, res.stats.totalChanges);
    }
  });

  it('larger input stays within cap and matches LCS', () => {
    const a = Array.from({ length: 400 }, (_, i) => `line ${i % 10}`);
    const b = Array.from({ length: 400 }, (_, i) => `line ${(i + 3) % 10}`);
    const res = computeLineDiff(a.join('\n'), b.join('\n'));
    assert.strictEqual(res.degraded, false);
    assert.strictEqual(res.stats.unchanged, lcsLength(linesOf(a.join('\n')), linesOf(b.join('\n'))));
  });

  it('edit-distance cap triggers degraded mode for very different large inputs', () => {
    const a = Array.from({ length: 5000 }, () => 'unique-left-line');
    const b = Array.from({ length: 5000 }, () => 'unique-right-line');
    const res = computeLineDiff(a.join('\n'), b.join('\n'));
    assert.strictEqual(res.degraded, true);
    assert.strictEqual(res.lines.length, Math.max(a.length, b.length));
  });

  it('stats are internally consistent', () => {
    const res = computeLineDiff('a\nb', 'a\nc\nd');
    assert.strictEqual(res.stats.added + res.stats.removed + res.stats.modified, res.stats.totalChanges);
    assert.strictEqual(res.stats.unchanged + res.stats.totalChanges, res.lines.length);
  });
});
