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

/**
 * Standard Myers Diff / LCS for text lines
 */
export function computeLineDiff(leftText: string, rightText: string): { lines: DiffLine[]; stats: DiffStats } {
  const leftLines = leftText ? leftText.split('\n') : [];
  const rightLines = rightText ? rightText.split('\n') : [];

  const lLen = leftLines.length;
  const rLen = rightLines.length;

  // Build simple LCS matrix
  // For small-medium lengths (standard in online diffs)
  const maxLines = 1500;
  if (lLen > maxLines || rLen > maxLines) {
    // Fast fallback line-by-line alignment to avoid 1500x1500 memory explosion
    return fastLineAlign(leftLines, rightLines);
  }

  const matrix: number[][] = Array.from({ length: lLen + 1 }, () => new Array(rLen + 1).fill(0));

  for (let i = 0; i < lLen; i++) {
    for (let j = 0; j < rLen; j++) {
      if (leftLines[i] === rightLines[j]) {
        matrix[i + 1][j + 1] = matrix[i][j] + 1;
      } else {
        matrix[i + 1][j + 1] = Math.max(matrix[i + 1][j], matrix[i][j + 1]);
      }
    }
  }

  let i = lLen;
  let j = rLen;
  const rawDiff: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftLines[i - 1] === rightLines[j - 1]) {
      rawDiff.push({
        type: 'unchanged',
        leftLineNumber: i,
        rightLineNumber: j,
        leftText: leftLines[i - 1],
        rightText: rightLines[j - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      rawDiff.push({
        type: 'added',
        rightLineNumber: j,
        rightText: rightLines[j - 1],
        leftText: '',
      });
      j--;
    } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
      rawDiff.push({
        type: 'removed',
        leftLineNumber: i,
        leftText: leftLines[i - 1],
        rightText: '',
      });
      i--;
    }
  }

  rawDiff.reverse();

  // Combine adjacent removed + added into modified
  const pairedLines: DiffLine[] = [];
  let k = 0;
  let addedCount = 0;
  let removedCount = 0;
  let modifiedCount = 0;
  let unchangedCount = 0;

  while (k < rawDiff.length) {
    const curr = rawDiff[k];
    const next = rawDiff[k + 1];

    if (curr.type === 'removed' && next && next.type === 'added') {
      pairedLines.push({
        type: 'modified',
        leftLineNumber: curr.leftLineNumber,
        rightLineNumber: next.rightLineNumber,
        leftText: curr.leftText,
        rightText: next.rightText,
      });
      modifiedCount++;
      k += 2;
    } else {
      pairedLines.push(curr);
      if (curr.type === 'added') addedCount++;
      else if (curr.type === 'removed') removedCount++;
      else unchangedCount++;
      k++;
    }
  }

  return {
    lines: pairedLines,
    stats: {
      added: addedCount,
      removed: removedCount,
      modified: modifiedCount,
      unchanged: unchangedCount,
      totalChanges: addedCount + removedCount + modifiedCount,
    },
  };
}

function fastLineAlign(leftLines: string[], rightLines: string[]): { lines: DiffLine[]; stats: DiffStats } {
  const max = Math.max(leftLines.length, rightLines.length);
  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let modified = 0;
  let unchanged = 0;

  for (let i = 0; i < max; i++) {
    const l = leftLines[i];
    const r = rightLines[i];

    if (l !== undefined && r !== undefined) {
      if (l === r) {
        lines.push({ type: 'unchanged', leftLineNumber: i + 1, rightLineNumber: i + 1, leftText: l, rightText: r });
        unchanged++;
      } else {
        lines.push({ type: 'modified', leftLineNumber: i + 1, rightLineNumber: i + 1, leftText: l, rightText: r });
        modified++;
      }
    } else if (l !== undefined) {
      lines.push({ type: 'removed', leftLineNumber: i + 1, leftText: l, rightText: '' });
      removed++;
    } else if (r !== undefined) {
      lines.push({ type: 'added', rightLineNumber: i + 1, leftText: '', rightText: r });
      added++;
    }
  }

  return {
    lines,
    stats: {
      added,
      removed,
      modified,
      unchanged,
      totalChanges: added + removed + modified,
    },
  };
}

