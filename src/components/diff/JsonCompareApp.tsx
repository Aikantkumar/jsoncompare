import { useState, useMemo, useRef } from 'preact/hooks';
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

// Sample datasets for quick testing
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

export default function JsonCompareApp() {
  const [leftInput, setLeftInput] = useState<string>(SAMPLES.apiResponse.left);
  const [rightInput, setRightInput] = useState<string>(SAMPLES.apiResponse.right);
  const [activeView, setActiveView] = useState<'split' | 'unified' | 'patch'>('split');
  
  // Toggles
  const [ignoreKeyOrder, setIgnoreKeyOrder] = useState<boolean>(true);
  const [ignoreArrayOrder, setIgnoreArrayOrder] = useState<boolean>(false);
  const [matchArrayById, setMatchArrayById] = useState<boolean>(true);
  const [arrayIdKey, setArrayIdKey] = useState<string>('id');
  const [jsonPathFilter, setJsonPathFilter] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');

  const leftEditorRef = useRef<HTMLTextAreaElement>(null);
  const rightEditorRef = useRef<HTMLTextAreaElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Diff computation
  const { diffResult, patchResult, leftParsed, rightParsed, leftError, rightError } = useMemo(() => {
    const leftRes = safeParseJson(leftInput, false);
    const rightRes = safeParseJson(rightInput, false);

    let leftData = leftRes.data;
    let rightData = rightRes.data;

    // Apply JSONPath filter if requested
    if (jsonPathFilter.trim()) {
      if (leftData) leftData = evaluateSimpleJsonPath(leftData, jsonPathFilter);
      if (rightData) rightData = evaluateSimpleJsonPath(rightData, jsonPathFilter);
    }

    // Apply Semantic sorting if requested
    if (ignoreKeyOrder && leftData && rightData) {
      leftData = sortKeysDeep(leftData, { ignoreArrayOrder, matchArrayById, idKey: arrayIdKey });
      rightData = sortKeysDeep(rightData, { ignoreArrayOrder, matchArrayById, idKey: arrayIdKey });
    }

    // Format normalized text for diff
    const leftText = leftData !== undefined && leftData !== null ? JSON.stringify(leftData, null, 2) : leftInput;
    const rightText = rightData !== undefined && rightData !== null ? JSON.stringify(rightData, null, 2) : rightInput;

    const diff = computeLineDiff(leftText, rightText);
    const patch = leftData && rightData ? generateJsonPatch(leftData, rightData) : [];

    return {
      diffResult: diff,
      patchResult: patch,
      leftParsed: leftData,
      rightParsed: rightData,
      leftError: leftRes.error,
      rightError: rightRes.error,
    };
  }, [leftInput, rightInput, ignoreKeyOrder, ignoreArrayOrder, matchArrayById, arrayIdKey, jsonPathFilter]);

  // Actions
  const handleSwap = () => {
    const tmp = leftInput;
    setLeftInput(rightInput);
    setRightInput(tmp);
    showToast("Swapped left and right JSON");
  };

  const handleClear = () => {
    setLeftInput('');
    setRightInput('');
    showToast("Cleared both sides");
  };

  const handleFormatBoth = () => {
    try {
      if (leftInput.trim()) {
        const lp = JSON.parse(leftInput);
        setLeftInput(JSON.stringify(lp, null, 2));
      }
      if (rightInput.trim()) {
        const rp = JSON.parse(rightInput);
        setRightInput(JSON.stringify(rp, null, 2));
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
    showToast("Smart repair applied to both inputs");
  };

  const handleCopyDiffReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      stats: diffResult.stats,
      rfc6902Patches: patchResult,
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    showToast("Copied diff summary & patch to clipboard!");
  };

  return (
    <div class="w-full bg-white dark:bg-[#0c0d0e] transition-colors">
      {/* Toast Notification */}
      {toastMessage && (
        <div class="fixed bottom-6 right-6 z-50 bg-[#111111] dark:bg-[#f0f0f2] text-white dark:text-[#111111] text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 animate-bounce">
          <span class="w-2 h-2 rounded-full bg-[#1eaa52]"></span>
          {toastMessage}
        </div>
      )}

      {/* Main Control Toolbar */}
      <div class="border-b border-[#e5e5e5] dark:border-[#22242a] bg-[#f5f5f5]/80 dark:bg-[#14161b] px-4 sm:px-6 py-3 transition-colors">
        <div class="flex flex-wrap items-center justify-between gap-3">
          {/* Left: View Mode Pills */}
          <div class="flex items-center gap-1 bg-white dark:bg-[#18191d] p-1 rounded-full border border-[#cacacb]/60 dark:border-[#2b2d35] shadow-xs">
            <button
              onClick={() => setActiveView('split')}
              class={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                activeView === 'split'
                  ? 'bg-[#111111] text-white dark:bg-[#f0f0f2] dark:text-[#111111] shadow-xs'
                  : 'text-[#707072] dark:text-[#8e8e93] hover:text-[#111111] dark:hover:text-[#f0f0f2]'
              }`}
            >
              Split View
            </button>
            <button
              onClick={() => setActiveView('unified')}
              class={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                activeView === 'unified'
                  ? 'bg-[#111111] text-white dark:bg-[#f0f0f2] dark:text-[#111111] shadow-xs'
                  : 'text-[#707072] dark:text-[#8e8e93] hover:text-[#111111] dark:hover:text-[#f0f0f2]'
              }`}
            >
              Unified Diff
            </button>
            <button
              onClick={() => setActiveView('patch')}
              class={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                activeView === 'patch'
                  ? 'bg-[#111111] text-white dark:bg-[#f0f0f2] dark:text-[#111111] shadow-xs'
                  : 'text-[#707072] dark:text-[#8e8e93] hover:text-[#111111] dark:hover:text-[#f0f0f2]'
              }`}
            >
              RFC 6902 Patch ({patchResult.length})
            </button>
          </div>

          {/* Center: Diff Stats Badges */}
          <div class="flex items-center gap-2 text-xs font-mono">
            <span class="px-2.5 py-0.5 rounded-full bg-white dark:bg-[#18191d] border border-[#e5e5e5] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] font-semibold">
              {diffResult.stats.totalChanges === 0 ? "Identical" : `${diffResult.stats.totalChanges} changes`}
            </span>
            <span class="px-2 py-0.5 rounded-full bg-[#007d48]/10 text-[#007d48] dark:bg-[#1eaa52]/20 dark:text-[#34d399] font-medium">
              +{diffResult.stats.added}
            </span>
            <span class="px-2 py-0.5 rounded-full bg-[#d30005]/10 text-[#d30005] dark:bg-[#f87171]/20 dark:text-[#f87171] font-medium">
              -{diffResult.stats.removed}
            </span>
            <span class="px-2 py-0.5 rounded-full bg-[#1151ff]/10 text-[#1151ff] dark:bg-[#60a5fa]/20 dark:text-[#60a5fa] font-medium">
              ~{diffResult.stats.modified}
            </span>
          </div>

          {/* Right: Quick Action Buttons */}
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
        </div>

        {/* Secondary Bar: Semantic Settings & JSONPath Filter */}
        <div class="mt-2.5 pt-2 border-t border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3 text-xs text-[#39393b] dark:text-[#b5b5b8]">
          {/* Options Toggles */}
          <div class="flex flex-wrap items-center gap-4">
            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ignoreKeyOrder}
                onChange={(e) => setIgnoreKeyOrder((e.target as HTMLInputElement).checked)}
                class="rounded border-[#cacacb] dark:border-[#2b2d35] text-[#111111] focus:ring-0"
              />
              <span class="font-medium">Ignore Key Order</span>
            </label>

            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ignoreArrayOrder}
                onChange={(e) => setIgnoreArrayOrder((e.target as HTMLInputElement).checked)}
                class="rounded border-[#cacacb] dark:border-[#2b2d35] text-[#111111] focus:ring-0"
              />
              <span class="font-medium">Ignore Array Order</span>
            </label>

            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={matchArrayById}
                onChange={(e) => setMatchArrayById((e.target as HTMLInputElement).checked)}
                class="rounded border-[#cacacb] dark:border-[#2b2d35] text-[#111111] focus:ring-0"
              />
              <span class="font-medium">Align Array by Key:</span>
              <input
                type="text"
                value={arrayIdKey}
                onChange={(e) => setArrayIdKey((e.target as HTMLInputElement).value)}
                class="w-12 px-1.5 py-0.5 rounded-full border border-[#cacacb] dark:border-[#2b2d35] bg-white dark:bg-[#18191d] text-[11px] font-mono text-center text-[#111111] dark:text-[#f0f0f2]"
              />
            </label>
          </div>

          {/* JSONPath Filter & Samples */}
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-1.5 bg-white dark:bg-[#18191d] px-2.5 py-1 rounded-full border border-[#cacacb]/80 dark:border-[#2b2d35]">
              <span class="font-mono text-[11px] text-[#707072] dark:text-[#8e8e93]">Filter:</span>
              <input
                type="text"
                value={jsonPathFilter}
                onChange={(e) => setJsonPathFilter((e.target as HTMLInputElement).value)}
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
                  showToast("Loaded Key Order Sample");
                }}
                class="hover:underline text-[#111111] dark:text-[#f0f0f2] cursor-pointer"
              >
                Key Order
              </button>
              <span class="text-[#cacacb] dark:text-[#383d47]">|</span>
              <button
                onClick={handleClear}
                class="hover:underline text-[#d30005] dark:text-[#f87171] cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Editor & Diff Stage */}
      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a] border-b border-[#e5e5e5] dark:border-[#22242a]">
        {/* Left Column: Original / Before */}
        <div class="flex flex-col bg-white dark:bg-[#0c0d0e]">
          <div class="flex items-center justify-between px-4 py-2 border-b border-[#e5e5e5] dark:border-[#22242a] bg-[#fafafa] dark:bg-[#14161b]">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-[#cacacb] dark:bg-[#383d47]"></span>
              <span class="text-xs font-semibold text-[#111111] dark:text-[#f0f0f2] uppercase tracking-wide">
                Original JSON (Left / Base)
              </span>
            </div>
            {leftError ? (
              <span class="text-[11px] font-mono text-[#d30005] dark:text-[#f87171] bg-[#d30005]/10 dark:bg-[#f87171]/20 px-2 py-0.5 rounded-full">
                Syntax Error
              </span>
            ) : (
              <span class="text-[11px] font-mono text-[#707072] dark:text-[#8e8e93]">
                {leftInput.split('\n').length} lines
              </span>
            )}
          </div>
          <div class="p-2">
            <textarea
              ref={leftEditorRef}
              value={leftInput}
              onInput={(e) => setLeftInput((e.target as HTMLTextAreaElement).value)}
              placeholder="Paste original JSON here..."
              rows={12}
              spellCheck={false}
              class="w-full font-mono text-xs leading-relaxed text-[#111111] dark:text-[#f0f0f2] p-3 rounded-lg border border-[#e5e5e5] dark:border-[#22242a] bg-white dark:bg-[#121316] resize-y focus:outline-none focus:border-[#111111] dark:focus:border-white focus:ring-1 focus:ring-[#111111] dark:focus:ring-white"
            />
          </div>
        </div>

        {/* Right Column: Modified / After */}
        <div class="flex flex-col bg-white dark:bg-[#0c0d0e]">
          <div class="flex items-center justify-between px-4 py-2 border-b border-[#e5e5e5] dark:border-[#22242a] bg-[#fafafa] dark:bg-[#14161b]">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-[#111111] dark:bg-[#f0f0f2]"></span>
              <span class="text-xs font-semibold text-[#111111] dark:text-[#f0f0f2] uppercase tracking-wide">
                Modified JSON (Right / Target)
              </span>
            </div>
            {rightError ? (
              <span class="text-[11px] font-mono text-[#d30005] dark:text-[#f87171] bg-[#d30005]/10 dark:bg-[#f87171]/20 px-2 py-0.5 rounded-full">
                Syntax Error
              </span>
            ) : (
              <span class="text-[11px] font-mono text-[#707072] dark:text-[#8e8e93]">
                {rightInput.split('\n').length} lines
              </span>
            )}
          </div>
          <div class="p-2">
            <textarea
              ref={rightEditorRef}
              value={rightInput}
              onInput={(e) => setRightInput((e.target as HTMLTextAreaElement).value)}
              placeholder="Paste modified JSON here..."
              rows={12}
              spellCheck={false}
              class="w-full font-mono text-xs leading-relaxed text-[#111111] dark:text-[#f0f0f2] p-3 rounded-lg border border-[#e5e5e5] dark:border-[#22242a] bg-white dark:bg-[#121316] resize-y focus:outline-none focus:border-[#111111] dark:focus:border-white focus:ring-1 focus:ring-[#111111] dark:focus:ring-white"
            />
          </div>
        </div>
      </div>

      {/* Visual Diff Output Viewport */}
      <div class="bg-white dark:bg-[#0c0d0e] transition-colors">
        <div class="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b border-[#e5e5e5] dark:border-[#22242a] bg-[#f5f5f5] dark:bg-[#14161b]">
          <span class="text-xs font-semibold uppercase tracking-wider text-[#111111] dark:text-[#f0f0f2]">
            Difference Inspector &nbsp;
            <span class="font-normal font-mono text-[#707072] dark:text-[#8e8e93]">
              ({activeView === 'split' ? 'Side-by-Side Comparison' : activeView === 'unified' ? 'Unified Stream' : 'RFC 6902 Patch Output'})
            </span>
          </span>

          <span class="text-[11px] font-mono text-[#707072] dark:text-[#8e8e93]">
            {diffResult.lines.length} lines rendered
          </span>
        </div>

        {/* View 1: Split View */}
        {activeView === 'split' && (
          <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table class="w-full border-collapse font-mono text-xs text-left">
              <thead>
                <tr class="bg-[#fafafa] dark:bg-[#16181d] border-b border-[#e5e5e5] dark:border-[#22242a] text-[11px] text-[#707072] dark:text-[#8e8e93]">
                  <th class="w-12 px-2 py-1.5 text-right font-normal">#</th>
                  <th class="w-1/2 px-3 py-1.5 font-normal border-r border-[#e5e5e5] dark:border-[#22242a]">Original Value</th>
                  <th class="w-12 px-2 py-1.5 text-right font-normal">#</th>
                  <th class="w-1/2 px-3 py-1.5 font-normal">Modified Value</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#f0f0f0] dark:divide-[#1c1f26]">
                {diffResult.lines.map((line, idx) => {
                  let leftBg = '';
                  let rightBg = '';

                  if (line.type === 'removed') {
                    leftBg = 'bg-[#fde8e8] dark:bg-[#451010]/50 text-[#d30005] dark:text-[#fca5a5]';
                  } else if (line.type === 'added') {
                    rightBg = 'bg-[#e8f7ee] dark:bg-[#06331e]/50 text-[#007d48] dark:text-[#6ee7b7]';
                  } else if (line.type === 'modified') {
                    leftBg = 'bg-[#fff4e5] dark:bg-[#3d2305]/50 text-[#b45309] dark:text-[#fde047]';
                    rightBg = 'bg-[#eff6ff] dark:bg-[#11264e]/50 text-[#1d4ed8] dark:text-[#93c5fd]';
                  }

                  return (
                    <tr key={idx} class="hover:bg-[#fcfcfc] dark:hover:bg-[#16181d] transition-colors leading-5">
                      {/* Left Side */}
                      <td class={`w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none ${leftBg ? leftBg.split(' ')[0] : ''}`}>
                        {line.leftLineNumber ?? ''}
                      </td>
                      <td class={`w-1/2 px-3 py-0.5 border-r border-[#e5e5e5] dark:border-[#22242a] whitespace-pre font-mono break-all ${leftBg}`}>
                        {line.leftText !== undefined ? line.leftText : ''}
                      </td>

                      {/* Right Side */}
                      <td class={`w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none ${rightBg ? rightBg.split(' ')[0] : ''}`}>
                        {line.rightLineNumber ?? ''}
                      </td>
                      <td class={`w-1/2 px-3 py-0.5 whitespace-pre font-mono break-all ${rightBg}`}>
                        {line.rightText !== undefined ? line.rightText : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* View 2: Unified Diff */}
        {activeView === 'unified' && (
          <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table class="w-full border-collapse font-mono text-xs text-left">
              <thead>
                <tr class="bg-[#fafafa] dark:bg-[#16181d] border-b border-[#e5e5e5] dark:border-[#22242a] text-[11px] text-[#707072] dark:text-[#8e8e93]">
                  <th class="w-12 px-2 py-1.5 text-right font-normal">L</th>
                  <th class="w-12 px-2 py-1.5 text-right font-normal">R</th>
                  <th class="w-8 px-2 py-1.5 text-center font-normal">Op</th>
                  <th class="px-3 py-1.5 font-normal">Content</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#f0f0f0] dark:divide-[#1c1f26]">
                {diffResult.lines.map((line, idx) => {
                  if (line.type === 'modified') {
                    return (
                      <div key={idx} style={{ display: 'contents' }}>
                        <tr class="bg-[#fde8e8] dark:bg-[#451010]/50 text-[#d30005] dark:text-[#fca5a5]">
                          <td class="w-12 px-2 py-0.5 text-right text-[11px] select-none">{line.leftLineNumber}</td>
                          <td class="w-12 px-2 py-0.5 text-right text-[11px] select-none"></td>
                          <td class="w-8 px-2 py-0.5 text-center select-none font-bold">-</td>
                          <td class="px-3 py-0.5 whitespace-pre font-mono break-all">{line.leftText}</td>
                        </tr>
                        <tr class="bg-[#e8f7ee] dark:bg-[#06331e]/50 text-[#007d48] dark:text-[#6ee7b7]">
                          <td class="w-12 px-2 py-0.5 text-right text-[11px] select-none"></td>
                          <td class="w-12 px-2 py-0.5 text-right text-[11px] select-none">{line.rightLineNumber}</td>
                          <td class="w-8 px-2 py-0.5 text-center select-none font-bold">+</td>
                          <td class="px-3 py-0.5 whitespace-pre font-mono break-all">{line.rightText}</td>
                        </tr>
                      </div>
                    );
                  }

                  let rowBg = '';
                  let sign = ' ';
                  if (line.type === 'added') {
                    rowBg = 'bg-[#e8f7ee] dark:bg-[#06331e]/50 text-[#007d48] dark:text-[#6ee7b7]';
                    sign = '+';
                  } else if (line.type === 'removed') {
                    rowBg = 'bg-[#fde8e8] dark:bg-[#451010]/50 text-[#d30005] dark:text-[#fca5a5]';
                    sign = '-';
                  }

                  return (
                    <tr key={idx} class={`${rowBg} hover:opacity-95 transition-opacity`}>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none">
                        {line.leftLineNumber ?? ''}
                      </td>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none">
                        {line.rightLineNumber ?? ''}
                      </td>
                      <td class="w-8 px-2 py-0.5 text-center select-none font-bold">
                        {sign}
                      </td>
                      <td class="px-3 py-0.5 whitespace-pre font-mono break-all">
                        {line.type === 'added' ? line.rightText : line.leftText}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* View 3: RFC 6902 Patch Output */}
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
      </div>
    </div>
  );
}

