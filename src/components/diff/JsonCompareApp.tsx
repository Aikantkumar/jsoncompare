import { useState, useMemo, useRef, useCallback, useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  computeLineDiff,
  sortKeysDeep,
  safeParseJson,
  generateJsonPatch,
  evaluateSimpleJsonPath,
  repairJsonString,
  type DiffLine,
  type DiffStats,
  type JsonPatchOperation,
} from '../../utils/jsonDiff';
import { useToast } from '../../hooks/useToast';
import { readTextFile } from '../../utils/fileIO';
import Toast from '../../components/shared/Toast';
import Panel from '../../components/shared/Panel';
import FileButton from '../../components/shared/FileButton';
import { useFileDrop } from '../../hooks/useFileDrop';
import { usePanelFullscreen } from '../../components/shared/Panel';

const SAMPLES = {
  apiResponse: {
    left: JSON.stringify(
      {
        status: 200,
        endpoint: "/api/v1/users",
        timestamp: "2026-11-01T10:00:00Z",
        meta: { page: 1, limit: 10, total: 102 },
        users: [
          { id: "usr_1", name: "Sarah Chen", role: "admin", active: true, email: "sarah@acme.dev" },
          { id: "usr_2", name: "David Miller", role: "developer", active: true, email: "david@acme.dev" },
          { id: "usr_3", name: "Elena Rostova", role: "designer", active: false, email: "elena@acme.dev" }
        ],
        flags: { featureX: false, betaAccess: true }
      },
      null,
      2
    ),
    right: JSON.stringify(
      {
        status: 200,
        endpoint: "/api/v1/users",
        timestamp: "2026-11-01T10:05:00Z",
        meta: { page: 1, limit: 25, total: 103 },
        users: [
          { id: "usr_1", name: "Sarah Chen", role: "super_admin", active: true, email: "sarah@acme.dev" },
          { id: "usr_2", name: "David Miller", role: "lead_developer", active: true, email: "david.m@acme.dev" },
          { id: "usr_4", name: "Marcus Vance", role: "devops", active: true, email: "marcus@acme.dev" }
        ],
        flags: { featureX: true, betaAccess: true, darkThemeV2: true }
      },
      null,
      2
    )
  },
  keyOrder: {
    left: JSON.stringify({ database: "postgres", port: 5432, host: "localhost", ssl: true, timeout: 30 }, null, 2),
    right: JSON.stringify({ timeout: 30, ssl: true, host: "localhost", port: 5432, database: "postgres" }, null, 2)
  }
};

const ACCEPT_JSON_TXT = ['.json', '.txt'];
const LARGE_FILE_MODE_BANNER = 'Large file mode: live comparison disabled. Click “Compare” to diff.';
const DIFF_ROW_CAP = 3000;
const FOLD_THRESHOLD = 6;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

function escHtml(str: string): string {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

type AppView = 'split' | 'unified' | 'patch';

interface DiffRowItem {
  kind: 'line' | 'fold' | 'showmore';
  line?: DiffLine;
  foldId?: number;
  foldCount?: number;
  foldLines?: DiffLine[];
  remaining?: number;
}

function buildDiffDisplay(lines: DiffLine[], rowCap: number): { items: DiffRowItem[]; remaining: number } {
  const items: DiffRowItem[] = [];
  let foldId = 0;
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === 'unchanged') {
      let j = i;
      while (j < lines.length && lines[j].type === 'unchanged') j++;
      const run = lines.slice(i, j);
      if (run.length > FOLD_THRESHOLD) {
        items.push({ kind: 'fold', foldId, foldCount: run.length, foldLines: run });
        foldId++;
      } else {
        for (const line of run) items.push({ kind: 'line', line });
      }
      i = j;
    } else {
      items.push({ kind: 'line', line: lines[i] });
      i++;
    }
  }

  let remaining = 0;
  if (items.length > DIFF_ROW_CAP) {
    remaining = items.length - DIFF_ROW_CAP;
    items.length = DIFF_ROW_CAP;
  }
  return { items, remaining };
}

// DiffTable is a top-level component so its fold/cap state (and the textarea-less
// DOM) survives across parent re-renders.
function DiffTable(props: {
  lines: DiffLine[];
  view: AppView;
}) {
  const { lines, view } = props;
  const { isFullscreen } = usePanelFullscreen();
  const [expandedFolds, setExpandedFolds] = useState<Set<number>>(new Set());
  const [rowCap, setRowCap] = useState<number>(DIFF_ROW_CAP);

  const { items, remaining } = useMemo(() => buildDiffDisplay(lines, rowCap), [lines, rowCap]);

  const toggleFold = (id: number) => {
    setExpandedFolds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleShowMore = () => {
    setRowCap((prev) => prev + DIFF_ROW_CAP);
  };

  const rowClasses = (type: string) => {
    if (type === 'removed') return 'bg-[#fde8e8] dark:bg-[#451010]/50 text-[#d30005] dark:text-[#fca5a5]';
    if (type === 'added') return 'bg-[#e8f7ee] dark:bg-[#06331e]/50 text-[#007d48] dark:text-[#6ee7b7]';
    if (type === 'modified') return 'bg-[#fff4e5] dark:bg-[#3d2305]/50';
    return '';
  };

  return (
    <>
      <div class={isFullscreen ? 'h-full overflow-auto' : 'overflow-x-auto max-h-[600px] overflow-y-auto'}>
        <table class="w-full border-collapse font-mono text-xs text-left">
          <thead class={isFullscreen ? 'sticky top-0 z-10 bg-[#fafafa] dark:bg-[#16181d]' : ''}>
            <tr class="bg-[#fafafa] dark:bg-[#16181d] border-b border-[#e5e5e5] dark:border-[#22242a] text-[11px] text-[#707072] dark:text-[#8e8e93]">
              {view === 'split' && (
                <>
                  <th class="w-12 px-2 py-1.5 text-right font-normal">#</th>
                  <th class="w-1/2 px-3 py-1.5 font-normal border-r border-[#e5e5e5] dark:border-[#22242a]">Original Value</th>
                  <th class="w-12 px-2 py-1.5 text-right font-normal">#</th>
                  <th class="w-1/2 px-3 py-1.5 font-normal">Modified Value</th>
                </>
              )}
              {view === 'unified' && (
                <>
                  <th class="w-12 px-2 py-1.5 text-right font-normal">L</th>
                  <th class="w-12 px-2 py-1.5 text-right font-normal">R</th>
                  <th class="w-8 px-2 py-1.5 text-center font-normal">Op</th>
                  <th class="px-3 py-1.5 font-normal">Content</th>
                </>
              )}
            </tr>
          </thead>
          <tbody class="divide-y divide-[#f0f0f0] dark:divide-[#1c1f26]">
            {items.map((item, idx) => {
              if (item.kind === 'fold') {
                return (
                  <tr
                    key={`fold-${item.foldId}`}
                    class="cursor-pointer hover:bg-[#fcfcfc] dark:hover:bg-[#16181d] transition-colors"
                    onClick={() => toggleFold(item.foldId!)}
                  >
                    <td colSpan={4} class="px-3 py-1.5 text-[11px] text-[#707072] dark:text-[#8e8e93] border-l border-[#e5e5e5] dark:border-[#22242a]">
                      {item.foldCount} unchanged lines{' '}
                      <span class="ml-2 text-[#1151ff] dark:text-[#60a5fa] hover:underline cursor-pointer">
                        {expandedFolds.has(item.foldId!) ? 'show less' : 'show'}
                      </span>
                    </td>
                  </tr>
                );
              }
              if (item.kind === 'showmore') {
                return (
                  <tr key="showmore">
                    <td colSpan={4} class="px-3 py-1.5 text-center text-[11px] text-[#1151ff] dark:text-[#60a5fa] cursor-pointer hover:underline" onClick={handleShowMore}>
                      Show more (+{item.remaining} rows)
                    </td>
                  </tr>
                );
              }
              const line = item.line!;
              const isModified = line.type === 'modified';

              if (view === 'unified' && isModified) {
                return (
                  <>
                    <tr key={`u-remove-${idx}`} class={`${rowClasses('removed')} hover:bg-[#fcfcfc] dark:hover:bg-[#16181d] transition-colors`}>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none">{line.leftLineNumber ?? ''}</td>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none"></td>
                      <td class="w-8 px-2 py-0.5 text-center select-none font-bold">-</td>
                      <td class="px-3 py-0.5 whitespace-pre font-mono break-all">{line.leftText}</td>
                    </tr>
                    <tr key={`u-add-${idx}`} class={`${rowClasses('added')} hover:bg-[#fcfcfc] dark:hover:bg-[#16181d] transition-colors`}>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none"></td>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none">{line.rightLineNumber ?? ''}</td>
                      <td class="w-8 px-2 py-0.5 text-center select-none font-bold">+</td>
                      <td class="px-3 py-0.5 whitespace-pre font-mono break-all">{line.rightText}</td>
                    </tr>
                  </>
                );
              }

              const isRemoved = line.type === 'removed';
              const isAdded = line.type === 'added';

              return (
                <tr key={`line-${idx}`} class={`hover:bg-[#fcfcfc] dark:hover:bg-[#16181d] transition-colors leading-5 ${rowClasses(line.type)}`}>
                  {view === 'split' && (
                    <>
                      <td class={`w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none ${(isRemoved || isModified) ? rowClasses(line.type).split(' ')[0] : ''}`}>
                        {line.leftLineNumber ?? ''}
                      </td>
                      <td class={`w-1/2 px-3 py-0.5 border-r border-[#e5e5e5] dark:border-[#22242a] whitespace-pre font-mono break-all ${rowClasses(line.type)}`}>
                        {line.leftText !== undefined ? line.leftText : ''}
                      </td>
                      <td class={`w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none ${(isAdded || isModified) ? rowClasses(line.type).split(' ')[0] : ''}`}>
                        {line.rightLineNumber ?? ''}
                      </td>
                      <td class={`w-1/2 px-3 py-0.5 whitespace-pre font-mono break-all ${rowClasses(line.type)}`}>
                        {line.rightText !== undefined ? line.rightText : ''}
                      </td>
                    </>
                  )}
                  {view === 'unified' && !isModified && (
                    <>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none">
                        {line.leftLineNumber ?? ''}
                      </td>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none">
                        {line.rightLineNumber ?? ''}
                      </td>
                      <td class="w-8 px-2 py-0.5 text-center select-none font-bold">
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      </td>
                      <td class="px-3 py-0.5 whitespace-pre font-mono break-all">
                        {line.type === 'added' ? line.rightText : line.leftText}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
        {remaining > 0 && (
          <button type="button" onClick={handleShowMore} class="px-3 py-1.5 text-[11px] text-[#1151ff] dark:text-[#60a5fa] hover:underline cursor-pointer mt-2">
            Show more (+{remaining} rows)
          </button>
        )}
      </>
    );
  }

export default function JsonCompareApp() {
  const [leftInput, setLeftInput] = useState<string>(SAMPLES.apiResponse.left);
  const [rightInput, setRightInput] = useState<string>(SAMPLES.apiResponse.right);
  const [activeView, setActiveView] = useState<AppView>('split');

  const [ignoreKeyOrder, setIgnoreKeyOrder] = useState<boolean>(true);
  const [ignoreArrayOrder, setIgnoreArrayOrder] = useState<boolean>(false);
  const [matchArrayById, setMatchArrayById] = useState<boolean>(true);
  const [arrayIdKey, setArrayIdKey] = useState<string>('id');
  const [jsonPathFilter, setJsonPathFilter] = useState<string>('');

  const [leftFilename, setLeftFilename] = useState<string | null>(null);
  const [rightFilename, setRightFilename] = useState<string | null>(null);
  const [leftEdited, setLeftEdited] = useState<boolean>(false);
  const [rightEdited, setRightEdited] = useState<boolean>(false);
  const [leftLarge, setLeftLarge] = useState<boolean>(false);
  const [rightLarge, setRightLarge] = useState<boolean>(false);

  const [diffResult, setDiffResult] = useState<{ lines: DiffLine[]; stats: DiffStats; degraded: boolean } | null>(null);
  const [patchResult, setPatchResult] = useState<JsonPatchOperation[]>([]);
  const [largeComparePending, setLargeComparePending] = useState<boolean>(false);

  const { message: toastMessage, show: showToast } = useToast(3000);

  const leftEditorRef = useRef<HTMLTextAreaElement>(null);
  const rightEditorRef = useRef<HTMLTextAreaElement>(null);

  const leftLineCount = useMemo(() => (leftInput ? leftInput.split('\n').length : 0), [leftInput]);
  const rightLineCount = useMemo(() => (rightInput ? rightInput.split('\n').length : 0), [rightInput]);

  const isLargeMode = leftLarge || rightLarge;

  // ---- File handling ----
  const applyLeftFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    setLeftInput(result.text);
    setLeftFilename(result.name);
    setLeftEdited(false);
    setLeftLarge(result.large);
    showToast(`Loaded ${escHtml(result.name)} (${formatBytes(result.size)})`);
  }, [showToast]);

  const applyRightFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    setRightInput(result.text);
    setRightFilename(result.name);
    setRightEdited(false);
    setRightLarge(result.large);
    showToast(`Loaded ${escHtml(result.name)} (${formatBytes(result.size)})`);
  }, [showToast]);

  const handleFileError = useCallback((msg: string) => {
    showToast(msg);
  }, [showToast]);

  const handleDropFiles = useCallback((files: FileList, preferredSide: 'left' | 'right') => {
    const arr = Array.from(files);
    if (arr.length >= 2) {
      readTextFile(arr[0], { accept: ACCEPT_JSON_TXT }).then(applyLeftFile).catch(handleFileError);
      readTextFile(arr[1], { accept: ACCEPT_JSON_TXT }).then(applyRightFile).catch(handleFileError);
      return;
    }
    const file = arr[0];
    if (!file) return;
    if (preferredSide === 'left') {
      readTextFile(file, { accept: ACCEPT_JSON_TXT }).then(applyLeftFile).catch(handleFileError);
    } else {
      readTextFile(file, { accept: ACCEPT_JSON_TXT }).then(applyRightFile).catch(handleFileError);
    }
  }, [applyLeftFile, applyRightFile, handleFileError]);

  const leftDrop = useFileDrop((files) => handleDropFiles(files, 'left'), { multiple: true });
  const rightDrop = useFileDrop((files) => handleDropFiles(files, 'right'), { multiple: true });

  // ---- Diff computation (debounced) ----
  const diffTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recomputeDiff = useCallback(() => {
    const leftRes = safeParseJson(leftInput, false);
    const rightRes = safeParseJson(rightInput, false);

    let leftData = leftRes.data;
    let rightData = rightRes.data;

    if (jsonPathFilter.trim()) {
      if (leftData) leftData = evaluateSimpleJsonPath(leftData, jsonPathFilter);
      if (rightData) rightData = evaluateSimpleJsonPath(rightData, jsonPathFilter);
    }

    if (ignoreKeyOrder && leftData && rightData) {
      leftData = sortKeysDeep(leftData, { ignoreArrayOrder, matchArrayById, idKey: arrayIdKey });
      rightData = sortKeysDeep(rightData, { ignoreArrayOrder, matchArrayById, idKey: arrayIdKey });
    }

    const leftText = leftData !== undefined && leftData !== null ? JSON.stringify(leftData, null, 2) : leftInput;
    const rightText = rightData !== undefined && rightData !== null ? JSON.stringify(rightData, null, 2) : rightInput;

    const diff = computeLineDiff(leftText, rightText, {
      maxEditDistance: 4000,
      memoryBudgetEntries: 2_000_000,
    });
    const patch = leftData && rightData ? generateJsonPatch(leftData, rightData) : [];

    setDiffResult({ lines: diff.lines, stats: diff.stats, degraded: diff.degraded });
    setPatchResult(patch);
    setLargeComparePending(false);
  }, [leftInput, rightInput, ignoreKeyOrder, ignoreArrayOrder, matchArrayById, arrayIdKey, jsonPathFilter]);

  useEffect(() => {
    if (isLargeMode) return;
    if (diffTimeoutRef.current) clearTimeout(diffTimeoutRef.current);
    diffTimeoutRef.current = setTimeout(() => {
      recomputeDiff();
    }, 250);
    return () => {
      if (diffTimeoutRef.current) clearTimeout(diffTimeoutRef.current);
    };
  }, [leftInput, rightInput, ignoreKeyOrder, ignoreArrayOrder, matchArrayById, arrayIdKey, jsonPathFilter, isLargeMode, recomputeDiff]);

  const handleCompare = () => {
    setLargeComparePending(true);
    recomputeDiff();
  };

  // ---- Actions ----
  const handleSwap = () => {
    const tmp = leftInput;
    setLeftInput(rightInput);
    setRightInput(tmp);
    setLeftFilename(rightFilename);
    setRightFilename(leftFilename);
    setLeftEdited(rightEdited);
    setRightEdited(leftEdited);
    showToast("Swapped left and right JSON");
  };

  const handleClearLeft = () => {
    setLeftInput('');
    setLeftFilename(null);
    setLeftEdited(false);
    setLeftLarge(false);
    showToast("Cleared left side");
  };
  const handleClearRight = () => {
    setRightInput('');
    setRightFilename(null);
    setRightEdited(false);
    setRightLarge(false);
    showToast("Cleared right side");
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label}!`);
  };

  const handleDownload = (text: string, name: string) => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${name}`);
  };

  const handleFormatBoth = () => {
    try {
      if (leftInput.trim()) {
        const lp = JSON.parse(leftInput);
        setLeftInput(JSON.stringify(lp, null, 2));
        setLeftEdited(true);
      }
      if (rightInput.trim()) {
        const rp = JSON.parse(rightInput);
        setRightInput(JSON.stringify(rp, null, 2));
        setRightEdited(true);
      }
      showToast("Formatted both JSONs");
    } catch {
      showToast("Could not format: check for syntax errors");
    }
  };

  const handleSmartRepairBoth = () => {
    const repairedLeft = repairJsonString(leftInput);
    const repairedRight = repairJsonString(rightInput);
    setLeftInput(repairedLeft);
    setRightInput(repairedRight);
    setLeftEdited(true);
    setRightEdited(true);
    showToast("Smart repair applied to both inputs");
  };

  const handleCopyDiffReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      stats: diffResult?.stats,
      patches: patchResult,
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    showToast("Copied diff summary & patch to clipboard!");
  };

  const stats = diffResult ? diffResult.stats : { added: 0, removed: 0, modified: 0, unchanged: 0, totalChanges: 0 };
  const lines = diffResult ? diffResult.lines : [];

  const viewPills = (active: AppView) => (
    <div class="flex items-center gap-1 bg-white dark:bg-[#18191d] p-1 rounded-full border border-[#cacacb]/60 dark:border-[#2b2d35] shadow-xs">
      <button
        onClick={() => setActiveView('split')}
        class={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
          active === 'split'
            ? 'bg-[#111111] text-white dark:bg-[#f0f0f2] dark:text-[#111111] shadow-xs'
            : 'text-[#707072] dark:text-[#8e8e93] hover:text-[#111111] dark:hover:text-[#f0f0f2]'
        }`}
      >
        Split View
      </button>
      <button
        onClick={() => setActiveView('unified')}
        class={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
          active === 'unified'
            ? 'bg-[#111111] text-white dark:bg-[#f0f0f2] dark:text-[#111111] shadow-xs'
            : 'text-[#707072] dark:text-[#8e8e93] hover:text-[#111111] dark:hover:text-[#f0f0f2]'
        }`}
      >
        Unified Diff
      </button>
      <button
        onClick={() => setActiveView('patch')}
        class={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
          active === 'patch'
            ? 'bg-[#111111] text-white dark:bg-[#f0f0f2] dark:text-[#111111] shadow-xs'
            : 'text-[#707072] dark:text-[#8e8e93] hover:text-[#111111] dark:hover:text-[#f0f0f2]'
        }`}
      >
        RFC 6902 Patch ({patchResult.length})
      </button>
    </div>
  );

  return (
    <div class="w-full bg-white dark:bg-[#0c0d0e] transition-colors">
      <Toast message={toastMessage} />

      {/* Main Control Toolbar */}
      <div class="border-b border-[#e5e5e5] dark:border-[#22242a] bg-[#f5f5f5]/80 dark:bg-[#14161b] px-4 sm:px-6 py-3 transition-colors">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-1.5">
            <button
              onClick={handleSwap}
              title="Swap Left and Right"
              class="px-3 py-1 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
            >
              ↔ Swap
            </button>
            <button
              onClick={handleFormatBoth}
              title="Format and beautify both inputs"
              class="px-3 py-1 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
            >
              Prettify
            </button>
            <button
              onClick={handleSmartRepairBoth}
              title="Fix syntax errors, trailing commas, single quotes"
              class="px-3 py-1 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#1151ff] dark:text-[#60a5fa] hover:bg-[#1151ff] hover:text-white dark:hover:bg-[#1151ff] dark:hover:text-white transition-colors cursor-pointer"
            >
              ✨ Smart Fix
            </button>
            <button
              onClick={handleCopyDiffReport}
              class="px-3 py-1 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer"
            >
              Copy Report
            </button>
          </div>

          <div class="flex items-center gap-2 text-xs font-mono">
            <span class="px-2.5 py-0.5 rounded-full bg-white dark:bg-[#18191d] border border-[#e5e5e5] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] font-semibold">
              {stats.totalChanges === 0 ? "Identical" : `${stats.totalChanges} changes`}
            </span>
            <span class="px-2 py-0.5 rounded-full bg-[#007d48]/10 text-[#007d48] dark:bg-[#1eaa52]/20 dark:text-[#34d399] font-medium">
              +{stats.added}
            </span>
            <span class="px-2 py-0.5 rounded-full bg-[#d30005]/10 text-[#d30005] dark:bg-[#f87171]/20 dark:text-[#f87171] font-medium">
              -{stats.removed}
            </span>
            <span class="px-2 py-0.5 rounded-full bg-[#1151ff]/10 text-[#1151ff] dark:bg-[#60a5fa]/20 dark:text-[#60a5fa] font-medium">
              ~{stats.modified}
            </span>
          </div>

          {viewPills(activeView)}
        </div>

        <div class="mt-2.5 pt-2 border-t border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3 text-xs text-[#39393b] dark:text-[#b5b5b8]">
          <div class="flex flex-wrap items-center gap-4">
            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ignoreKeyOrder}
                onChange={(e: any) => setIgnoreKeyOrder((e.target as HTMLInputElement).checked)}
                class="rounded border-[#cacacb] dark:border-[#2b2d35] text-[#111111] focus:ring-0"
              />
              <span class="font-medium">Ignore Key Order</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ignoreArrayOrder}
                onChange={(e: any) => setIgnoreArrayOrder((e.target as HTMLInputElement).checked)}
                class="rounded border-[#cacacb] dark:border-[#2b2d35] text-[#111111] focus:ring-0"
              />
              <span class="font-medium">Ignore Array Order</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={matchArrayById}
                onChange={(e: any) => setMatchArrayById((e.target as HTMLInputElement).checked)}
                class="rounded border-[#cacacb] dark:border-[#2b2d35] text-[#111111] focus:ring-0"
              />
              <span class="font-medium">Align Array by Key:</span>
              <input
                type="text"
                value={arrayIdKey}
                onInput={(e: any) => setArrayIdKey((e.target as HTMLInputElement).value)}
                class="w-12 px-1.5 py-0.5 rounded-full border border-[#cacacb] dark:border-[#2b2d35] bg-white dark:bg-[#18191d] text-[11px] font-mono text-center text-[#111111] dark:text-[#f0f0f2]"
              />
            </label>
          </div>

          <div class="flex items-center gap-3">
            <div class="flex items-center gap-1.5 bg-white dark:bg-[#18191d] px-2.5 py-1 rounded-full border border-[#cacacb]/80 dark:border-[#2b2d35]">
              <span class="font-mono text-[11px] text-[#707072] dark:text-[#8e8e93]">Filter:</span>
              <input
                type="text"
                value={jsonPathFilter}
                onInput={(e: any) => setJsonPathFilter((e.target as HTMLInputElement).value)}
                placeholder="$.users[*] (Optional)"
                class="font-mono text-xs text-[#111111] dark:text-[#f0f0f2] outline-none w-36 bg-transparent"
              />
              {jsonPathFilter && (
                <button
                  onClick={() => setJsonPathFilter('')}
                  class="text-[10px] text-[#707072] dark:text-[#8e8e93] hover:text-[#111111] dark:hover:text-[#f0f0f2] cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div class="flex items-center gap-1 text-[11px]">
              <span class="text-[#707072] dark:text-[#8e8e93]">Samples:</span>
              <button
                onClick={() => {
                  setLeftInput(SAMPLES.apiResponse.left);
                  setRightInput(SAMPLES.apiResponse.right);
                  setLeftFilename(null);
                  setRightFilename(null);
                  setLeftEdited(false);
                  setRightEdited(false);
                  setLeftLarge(false);
                  setRightLarge(false);
                  showToast("Loaded Sample API Response");
                }}
                class="hover:underline text-[#111111] dark:text-[#f0f0f2] cursor-pointer"
              >
                API
              </button>
              <span class="text-[#cacacb] dark:text-[#383d47]">|</span>
              <button
                onClick={() => {
                  setLeftInput(SAMPLES.keyOrder.left);
                  setRightInput(SAMPLES.keyOrder.right);
                  setLeftFilename(null);
                  setRightFilename(null);
                  setLeftEdited(false);
                  setRightEdited(false);
                  setLeftLarge(false);
                  setRightLarge(false);
                  showToast("Loaded Key Order Sample");
                }}
                class="hover:underline text-[#111111] dark:text-[#f0f0f2] cursor-pointer"
              >
                Key Order
              </button>
              <span class="text-[#cacacb] dark:text-[#383d47]">|</span>
              <button
                onClick={() => {
                  setLeftInput('');
                  setRightInput('');
                  setLeftFilename(null);
                  setRightFilename(null);
                  setLeftEdited(false);
                  setRightEdited(false);
                  setLeftLarge(false);
                  setRightLarge(false);
                  showToast("Cleared both sides");
                }}
                class="hover:underline text-[#d30005] dark:text-[#f87171] cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {isLargeMode && (
          <div class="px-4 sm:px-6 py-2 bg-[#fff4e5] dark:bg-[#3d2305]/40 border border-[#e5e5e5] dark:border-[#5c3a0a]">
            <div class="flex items-center gap-2 text-[11px] font-medium text-[#b45309] dark:text-[#fde047]">
              <span class="w-1.5 h-1.5 rounded-full bg-[#b45309] dark:bg-[#fde047]"></span>
              {LARGE_FILE_MODE_BANNER}
            </div>
            <button
              onClick={handleCompare}
              disabled={largeComparePending}
              class="ml-auto px-3 py-1 rounded-full text-xs font-semibold border border-[#b45309] dark:border-[#fde047] text-[#b45309] dark:text-[#fde047] hover:bg-[#b45309] dark:hover:bg-[#fde047] hover:text-white dark:hover:text-[#111111] transition-colors cursor-pointer"
            >
              {largeComparePending ? 'Comparing…' : 'Compare'}
            </button>
          </div>
        )}

        {diffResult?.degraded && (
          <div class="px-4 sm:px-6 py-2 bg-[#fde8e8] dark:bg-[#451010]/40 border border-[#e5e5e5] dark:border-[#7a1f1f]">
            <div class="flex items-center gap-2 text-[11px] font-medium text-[#d30005] dark:text-[#fca5a5]">
              <span class="w-1.5 h-1.5 rounded-full bg-[#d30005] dark:bg-[#fca5a5]"></span>
              Diff simplified: files are very large or very different. Showing approximate alignment.
            </div>
          </div>
        )}
      </div>

      {/* Editor & Diff Stage */}
      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a] border-b border-[#e5e5e5] dark:border-[#22242a]">
        <div {...leftDrop.getDropProps()} class="relative flex flex-col bg-white dark:bg-[#0c0d0e]">
          {leftDrop.isDragging && (
            <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
          )}
          <Panel
            title="Original JSON (Left / Base)"
            filename={leftFilename}
            lineCount={leftLineCount}
            edited={leftEdited}
            accept={ACCEPT_JSON_TXT}
            onFile={applyLeftFile}
            onError={handleFileError}
            fileLabel="Choose file"
            onClear={handleClearLeft}
            onCopy={() => handleCopy(leftInput, 'left JSON')}
            onDownload={() => handleDownload(leftInput, (leftFilename ?? 'left') + '.json')}
            fullscreenable
          >
            <textarea
              ref={leftEditorRef}
              value={leftInput}
              onInput={(e: any) => {
                setLeftInput((e.target as HTMLTextAreaElement).value);
                setLeftEdited(true);
              }}
              placeholder="Paste original JSON here..."
              rows={12}
              spellcheck={false}
              class="w-full font-mono text-xs leading-relaxed text-[#111111] dark:text-[#f0f0f2] p-3 rounded-lg border border-[#e5e5e5] dark:border-[#22242a] bg-white dark:bg-[#121316] resize-y focus:outline-none focus:border-[#111111] dark:focus:border-white focus:ring-1 focus:ring-[#111111] dark:focus:ring-white"
            />
          </Panel>
        </div>

        <div {...rightDrop.getDropProps()} class="relative flex flex-col bg-white dark:bg-[#0c0d0e]">
          {rightDrop.isDragging && (
            <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
          )}
          <Panel
            title="Modified JSON (Right / Target)"
            filename={rightFilename}
            lineCount={rightLineCount}
            edited={rightEdited}
            accept={ACCEPT_JSON_TXT}
            onFile={applyRightFile}
            onError={handleFileError}
            fileLabel="Choose file"
            onClear={handleClearRight}
            onCopy={() => handleCopy(rightInput, 'right JSON')}
            onDownload={() => handleDownload(rightInput, (rightFilename ?? 'right') + '.json')}
            fullscreenable
          >
            <textarea
              ref={rightEditorRef}
              value={rightInput}
              onInput={(e: any) => {
                setRightInput((e.target as HTMLTextAreaElement).value);
                setRightEdited(true);
              }}
              placeholder="Paste modified JSON here..."
              rows={12}
              spellcheck={false}
              class="w-full font-mono text-xs leading-relaxed text-[#111111] dark:text-[#f0f0f2] p-3 rounded-lg border border-[#e5e5e5] dark:border-[#22242a] bg-white dark:bg-[#121316] resize-y focus:outline-none focus:border-[#111111] dark:focus:border-white focus:ring-1 focus:ring-[#111111] dark:focus:ring-white"
            />
          </Panel>
        </div>
      </div>

      {/* Visual Diff Output Viewport */}
      <Panel
        title="Difference Inspector"
        lineCount={lines.length}
        actions={viewPills(activeView)}
        onCopy={handleCopyDiffReport}
        onDownload={() => {
          const report = { timestamp: new Date().toISOString(), stats, patches: patchResult };
          handleDownload(JSON.stringify(report, null, 2), 'diff-report.json');
        }}
        fullscreenable
      >
        <>
          {activeView !== 'patch' && <DiffTable lines={lines} view={activeView} />}
          {activeView === 'patch' && (
            <div class="p-4 sm:p-6 bg-[#fafafa] dark:bg-[#111215] transition-colors">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-semibold text-[#111111] dark:text-[#f0f0f2]">
                  RFC 6902 Compliant JSON Patch Document ({patchResult.length} operations)
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(patchResult, null, 2));
                    showToast("Patch operations copied!");
                  }}
                  class="px-3 py-1 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer"
                >
                  Copy Patch JSON
                </button>
              </div>
              <pre class="p-4 rounded-xl bg-white dark:bg-[#121316] border border-[#e5e5e5] dark:border-[#22242a] font-mono text-xs overflow-x-auto text-[#111111] dark:text-[#f0f0f2] max-h-[500px]">
                {patchResult.length > 0
                  ? JSON.stringify(patchResult, null, 2)
                  : '// Both JSON documents are semantically identical. No patch required.'}
              </pre>
            </div>
          )}
        </>
      </Panel>
    </div>
  );
}
