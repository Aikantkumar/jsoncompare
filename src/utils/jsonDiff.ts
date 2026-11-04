/**
 * jsonDiff.ts - High-performance Semantic JSON Diff & Transformation Engine
 * 100% Client-Side. No external network dependencies.
 */

export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  leftLineNumber?: number;
  rightLineNumber?: number;
  leftText?: string;
  rightText?: string;
  leftPath?: string;
  rightPath?: string;
}

export interface DiffStats {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  totalChanges: number;
}

export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy';
  path: string;
  value?: any;
  from?: string;
}

export interface DiffOptions {
  ignoreKeyOrder: boolean;
  ignoreArrayOrder: boolean;
  matchArrayById: boolean;
  arrayIdKey: string;
  trimWhitespace: boolean;
  jsonPathFilter: string;
}

/**
 * 1-Click Smart Repair for malformed JSON
 * Handles: single quotes, trailing commas, unquoted keys, Python True/False/None
 */
export function repairJsonString(input: string): string {
  if (!input || !input.trim()) return '';

  let s = input.trim();

  // Strip single-line & multi-line comments
  s = s.replace(/\/\/.*$/gm, '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');

  // Replace Python True / False / None
  s = s.replace(/\bTrue\b/g, 'true');
  s = s.replace(/\bFalse\b/g, 'false');
  s = s.replace(/\bNone\b/g, 'null');

  // Replace single quotes surrounding keys and values with double quotes
  // Careful not to break apostrophes inside words
  s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');

  // Add double quotes around unquoted keys (e.g. { foo: "bar" } -> { "foo": "bar" })
  s = s.replace(/([{,]\s*)([a-zA-Z0-9_$-]+)\s*:/g, '$1"$2":');

  // Strip trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, '$1');

  return s;
}

/**
 * Safe JSON parse with automatic fallback to smart repair
 */
export function safeParseJson(input: string, tryRepair = true): { data: any; error?: string; wasRepaired?: boolean } {
  if (!input || !input.trim()) {
    return { data: null };
  }

  try {
    const data = JSON.parse(input);
    return { data };
  } catch (err: any) {
    if (!tryRepair) {
      return { data: null, error: err.message || 'Invalid JSON syntax' };
    }

    try {
      const repaired = repairJsonString(input);
      const data = JSON.parse(repaired);
      return { data, wasRepaired: true };
    } catch (err2: any) {
      return { data: null, error: err.message || 'Invalid JSON syntax' };
    }
  }
}

/**
 * Recursively sort keys in objects for semantic order-independent comparison
 */
export function sortKeysDeep(value: any, options: { ignoreArrayOrder?: boolean; matchArrayById?: boolean; idKey?: string } = {}): any {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    let arr = value.map((item) => sortKeysDeep(item, options));
    if (options.ignoreArrayOrder) {
      if (options.matchArrayById && options.idKey) {
        const idKey = options.idKey;
        arr.sort((a, b) => {
          const aId = a && typeof a === 'object' ? a[idKey] ?? JSON.stringify(a) : JSON.stringify(a);
          const bId = b && typeof b === 'object' ? b[idKey] ?? JSON.stringify(b) : JSON.stringify(b);
          return String(aId).localeCompare(String(bId));
        });
      } else {
        arr.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      }
    }
    return arr;
  }

  const sortedObj: Record<string, any> = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    sortedObj[key] = sortKeysDeep(value[key], options);
  }
  return sortedObj;
}

/**
 * Basic JSONPath subset evaluator (e.g. $.users, $.users[*], $.data.items[0])
 */
export function evaluateSimpleJsonPath(data: any, path: string): any {
  if (!path || !path.trim() || path.trim() === '$' || path.trim() === '$.') {
    return data;
  }

  const clean = path.trim().replace(/^\$\.?/, '');
  const tokens = clean.split(/\.|(?=\[)/).filter(Boolean);

  let current = data;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;

    if (token.startsWith('[') && token.endsWith(']')) {
      const inner = token.slice(1, -1);
      if (inner === '*') {
        if (Array.isArray(current)) {
          return current;
        }
      } else {
        const idx = parseInt(inner, 10);
        if (!isNaN(idx) && Array.isArray(current)) {
          current = current[idx];
        }
      }
    } else {
      if (typeof current === 'object') {
        current = current[token];
      } else {
        return undefined;
      }
    }
  }

  return current;
}

/**
 * Computes RFC 6902 JSON Patch operations between two objects
 */
export function generateJsonPatch(objA: any, objB: any, basePath = ''): JsonPatchOperation[] {
  const patches: JsonPatchOperation[] = [];

  // Primitive or type difference
  if (objA === objB) return patches;

  if (
    typeof objA !== typeof objB ||
    objA === null ||
    objB === null ||
    typeof objA !== 'object' ||
    typeof objB !== 'object' ||
    Array.isArray(objA) !== Array.isArray(objB)
  ) {
    patches.push({
      op: 'replace',
      path: basePath || '/',
      value: objB,
    });
    return patches;
  }

  if (Array.isArray(objA) && Array.isArray(objB)) {
    const minLen = Math.min(objA.length, objB.length);
    for (let i = 0; i < minLen; i++) {
      patches.push(...generateJsonPatch(objA[i], objB[i], `${basePath}/${i}`));
    }
    if (objB.length > objA.length) {
      for (let i = minLen; i < objB.length; i++) {
        patches.push({
          op: 'add',
          path: `${basePath}/${i}`,
          value: objB[i],
        });
      }
    } else if (objA.length > objB.length) {
      for (let i = objA.length - 1; i >= minLen; i--) {
        patches.push({
          op: 'remove',
          path: `${basePath}/${i}`,
        });
      }
    }
    return patches;
  }

  // Object keys comparison
  const keysA = new Set(Object.keys(objA));
  const keysB = new Set(Object.keys(objB));

  for (const key of keysB) {
    const subPath = `${basePath}/${escapeJsonPointer(key)}`;
    if (!keysA.has(key)) {
      patches.push({
        op: 'add',
        path: subPath,
        value: objB[key],
      });
    } else {
      patches.push(...generateJsonPatch(objA[key], objB[key], subPath));
    }
  }

  for (const key of keysA) {
    if (!keysB.has(key)) {
      patches.push({
        op: 'remove',
        path: `${basePath}/${escapeJsonPointer(key)}`,
      });
    }
  }

  return patches;
}

function escapeJsonPointer(str: string): string {
  return str.replace(/~/g, '~0').replace(/\//g, '~1');
}

export interface DiffResult {
  lines: DiffLine[];
  stats: DiffStats;
  degraded: boolean;
}

export const DEFAULT_MAX_EDIT_DISTANCE = 4000;
export const DEFAULT_MEMORY_BUDGET_ENTRIES = 2_000_000; // bounds Myers trace memory

interface DiffOptionsInternal {
  maxEditDistance: number;
  memoryBudgetEntries: number;
}

/**
 * Myers O(ND) diff for text lines, after trimming the common prefix and suffix.
 * Returns an edit script as { type, x1, x2, y1, y2 } ops in core coordinates,
 * or null if the safe edit-distance cap is hit (caller should degrade).
 */
function myersCore(
  a: string[],
  b: string[],
  opts: DiffOptionsInternal
): { ops: Op[]; d: number } | null {
  const n = a.length;
  const m = b.length;

  if (n === 0 && m === 0) return { ops: [], d: 0 };
  if (n === 0) {
    const ops: Op[] = [{ type: 'added', x1: 0, x2: 0, y1: 0, y2: m }];
    return { ops, d: m };
  }
  if (m === 0) {
    const ops: Op[] = [{ type: 'removed', x1: 0, x2: n, y1: 0, y2: 0 }];
    return { ops, d: n };
  }

  const max = n + m;
  const offset = max;
  const V = new Int32Array(2 * max + 1);
  for (let i = 0; i < V.length; i++) V[i] = -1;
  V[1 + offset] = 0;

  const maxD = Math.min(
    opts.maxEditDistance,
    Math.max(1, Math.floor(opts.memoryBudgetEntries / (2 * max + 1)))
  );

  const trace: Int32Array[] = [];
  let foundD = -1;

  outer: for (let d = 0; d <= maxD; d++) {
    trace.push(V.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d) {
        x = V[k + 1 + offset];
      } else if (k === d) {
        x = V[k - 1 + offset] + 1;
      } else if (V[k - 1 + offset] < V[k + 1 + offset]) {
        x = V[k + 1 + offset]; // down: advance y (B added)
      } else {
        x = V[k - 1 + offset] + 1; // right: advance x (A removed)
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      V[k + offset] = x;
      if (x >= n && y >= m) {
        foundD = d;
        break outer;
      }
    }
  }

  if (foundD === -1) return null;

  // Backtrack the edit script (reverse), then reverse to forward order.
  const revOps: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const k = x - y;
    const prev = trace[d];
    const down =
      k === -d ||
      (k !== d && prev[k + 1 + offset] > prev[k - 1 + offset]);

    if (down) {
      // move advanced y: B element added, then snake (equal run) to (x, y)
      const x0 = prev[k + 1 + offset];
      const y0 = x0 - (k + 1);
      if (x0 < x || y0 + 1 < y) {
        revOps.push({ type: 'equal', x1: x0, x2: x, y1: y0 + 1, y2: y });
      }
      revOps.push({ type: 'added', x1: x0, x2: x0, y1: y0, y2: y0 + 1 });
      x = x0;
      y = y0;
    } else {
      // move advanced x: A element removed, then snake (equal run) to (x, y)
      const x0 = prev[k - 1 + offset];
      const y0 = x0 - (k - 1);
      if (x0 + 1 < x || y0 < y) {
        revOps.push({ type: 'equal', x1: x0 + 1, x2: x, y1: y0, y2: y });
      }
      revOps.push({ type: 'removed', x1: x0, x2: x0 + 1, y1: y0, y2: y0 });
      x = x0;
      y = y0;
    }
  }

  const ops: Op[] = [];
  for (let i = revOps.length - 1; i >= 0; i--) ops.push(revOps[i]);
  return { ops, d: foundD };
}

interface Op {
  type: 'equal' | 'added' | 'removed';
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

function buildRawLines(
  leftLines: string[],
  rightLines: string[],
  pre: number,
  ops: Op[]
): DiffLine[] {
  const raw: DiffLine[] = [];
  for (const op of ops) {
    if (op.type === 'equal') {
      for (let i = 0; i < op.x2 - op.x1; i++) {
        const x = op.x1 + i;
        const y = op.y1 + i;
        raw.push({
          type: 'unchanged',
          leftLineNumber: pre + x + 1,
          rightLineNumber: pre + y + 1,
          leftText: leftLines[pre + x],
          rightText: rightLines[pre + y],
        });
      }
    } else if (op.type === 'removed') {
      for (let x = op.x1; x < op.x2; x++) {
        raw.push({
          type: 'removed',
          leftLineNumber: pre + x + 1,
          leftText: leftLines[pre + x],
          rightText: '',
        });
      }
    } else if (op.type === 'added') {
      for (let y = op.y1; y < op.y2; y++) {
        raw.push({
          type: 'added',
          rightLineNumber: pre + y + 1,
          leftText: '',
          rightText: rightLines[pre + y],
        });
      }
    }
  }
  return raw;
}

function pairAdjacent(raw: DiffLine[]): { lines: DiffLine[]; stats: DiffStats } {
  const paired: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let modified = 0;
  let unchanged = 0;
  let k = 0;

  while (k < raw.length) {
    const curr = raw[k];
    const next = raw[k + 1];

    const isRemovedThenAdded =
      curr.type === 'removed' && next && next.type === 'added';
    const isAddedThenRemoved =
      curr.type === 'added' && next && next.type === 'removed';

    if (isRemovedThenAdded || isAddedThenRemoved) {
      const rem = isRemovedThenAdded ? curr : next!;
      const add = isRemovedThenAdded ? next! : curr;
      paired.push({
        type: 'modified',
        leftLineNumber: rem.leftLineNumber,
        rightLineNumber: add.rightLineNumber,
        leftText: rem.leftText,
        rightText: add.rightText,
      });
      modified++;
      k += 2;
    } else {
      paired.push(curr);
      if (curr.type === 'added') added++;
      else if (curr.type === 'removed') removed++;
      else if (curr.type === 'modified') modified++;
      else unchanged++;
      k++;
    }
  }

  return {
    lines: paired,
    stats: {
      added,
      removed,
      modified,
      unchanged,
      totalChanges: added + removed + modified,
    },
  };
}

/**
 * Myers O(ND) line diff with common-prefix/suffix trimming and a safe
 * edit-distance cap. Keeps the exported DiffLine/DiffStats shapes and the
 * "adjacent removed+added = modified" pairing so existing UI keeps working.
 *
 * When the cap is hit, `degraded` is true and the caller should surface a
 * visible notice instead of silently falling back to positional alignment.
 */
export function computeLineDiff(
  leftText: string,
  rightText: string,
  options?: { maxEditDistance?: number; memoryBudgetEntries?: number }
): DiffResult {
  const leftLines = leftText ? leftText.split('\n') : [];
  const rightLines = rightText ? rightText.split('\n') : [];

  const lLen = leftLines.length;
  const rLen = rightLines.length;

  const opts: DiffOptionsInternal = {
    maxEditDistance: options?.maxEditDistance ?? DEFAULT_MAX_EDIT_DISTANCE,
    memoryBudgetEntries: options?.memoryBudgetEntries ?? DEFAULT_MEMORY_BUDGET_ENTRIES,
  };

  // Trim common prefix.
  let pre = 0;
  while (pre < lLen && pre < rLen && leftLines[pre] === rightLines[pre]) pre++;

  // Trim common suffix (without overlapping the prefix).
  let post = 0;
  while (
    post < lLen - pre &&
    post < rLen - pre &&
    leftLines[lLen - 1 - post] === rightLines[rLen - 1 - post]
  )
    post++;

  const coreA = leftLines.slice(pre, lLen - post);
  const coreB = rightLines.slice(pre, rLen - post);

  const myers = myersCore(coreA, coreB, opts);

  let degraded = false;
  let lines: DiffLine[];

  if (myers) {
    // Myers covers the core; reattach the trimmed prefix/suffix as unchanged.
    const raw = buildRawLines(leftLines, rightLines, pre, myers.ops);
    lines = [];
    for (let i = 0; i < pre; i++) {
      lines.push({
        type: 'unchanged',
        leftLineNumber: i + 1,
        rightLineNumber: i + 1,
        leftText: leftLines[i],
        rightText: rightLines[i],
      });
    }
    lines.push(...raw);
    // All core lines on both sides are consumed by the Myers path, so the
    // suffix right-side index is shifted by (rLen - lLen).
    const suffixOffset = rLen - lLen;
    const sufStart = lLen - post;
    for (let i = sufStart; i < lLen; i++) {
      lines.push({
        type: 'unchanged',
        leftLineNumber: i + 1,
        rightLineNumber: i + 1 + suffixOffset,
        leftText: leftLines[i],
        rightText: rightLines[i + suffixOffset],
      });
    }
  } else {
    // Cap hit: degrade gracefully with a visible notice (positional fallback,
    // flagged as degraded so it is never silent).
    degraded = true;
    lines = fastLineAlign(leftLines, rightLines);
  }

  const { lines: pairedLines, stats } = pairAdjacent(lines);
  return { lines: pairedLines, stats, degraded };
}

/**
 * Positional line-by-line fallback. Used only as a safe degradation when the
 * Myers edit-distance cap is hit (flagged as degraded, never silent).
 */
function fastLineAlign(leftLines: string[], rightLines: string[]): DiffLine[] {
  const max = Math.max(leftLines.length, rightLines.length);
  const lines: DiffLine[] = [];

  for (let i = 0; i < max; i++) {
    const l = leftLines[i];
    const r = rightLines[i];

    if (l !== undefined && r !== undefined) {
      if (l === r) {
        lines.push({ type: 'unchanged', leftLineNumber: i + 1, rightLineNumber: i + 1, leftText: l, rightText: r });
      } else {
        lines.push({ type: 'modified', leftLineNumber: i + 1, rightLineNumber: i + 1, leftText: l, rightText: r });
      }
    } else if (l !== undefined) {
      lines.push({ type: 'removed', leftLineNumber: i + 1, leftText: l, rightText: '' });
    } else if (r !== undefined) {
      lines.push({ type: 'added', rightLineNumber: i + 1, leftText: '', rightText: r });
    }
  }

  return lines;
}

