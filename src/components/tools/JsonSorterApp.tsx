import { useState, useCallback, useMemo } from 'preact/hooks';
import { safeParseJson, repairJsonString } from '../../utils/jsonDiff';
import { useToast } from '../../hooks/useToast';
import { formatBytes, readTextFile, isLargeText } from '../../utils/fileIO';
import { copyText, downloadText, deriveDownloadName } from '../../utils/download';
import { yieldToPaint } from '../../utils/async';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useTextDoc } from '../../hooks/useTextDoc';
import { useFileDrop } from '../../hooks/useFileDrop';
import Toast from '../../components/shared/Toast';
import Panel from '../../components/shared/Panel';
import EditorTextarea from '../../components/shared/EditorTextarea';

const ACCEPT_JSON_TXT = ['.json', '.txt'];
const LARGE_BANNER = 'Large file mode: live sorting disabled. Click “Sort” to sort.';

type SortOrder = 'asc' | 'desc' | 'length-asc' | 'length-desc';

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

function sortKeysCustom(
  val: any,
  order: SortOrder,
  deep: boolean,
  sortArrays: boolean
): any {
  if (val === null || typeof val !== 'object') {
    return val;
  }

  if (Array.isArray(val)) {
    let arr = val;
    if (deep) {
      arr = arr.map((item) => sortKeysCustom(item, order, deep, sortArrays));
    }
    if (sortArrays) {
      const decorated = arr.map((item) => ({
        key: typeof item === 'object' ? JSON.stringify(item) : String(item),
        value: item,
      }));
      decorated.sort((a, b) => collator.compare(a.key, b.key));
      arr = decorated.map((d) => d.value);
    }
    return arr;
  }

  const keys = Object.keys(val);
  const decorated = keys.map((k) => {
    let sortKey: string | number;
    switch (order) {
      case 'length-asc':
      case 'length-desc':
        sortKey = k.length;
        break;
      default:
        sortKey = k;
    }
    return { k, sortKey };
  });

  decorated.sort((a, b) => {
    if (typeof a.sortKey === 'number' && typeof b.sortKey === 'number') {
      const cmp = a.sortKey - b.sortKey;
      if (cmp !== 0) return cmp;
    }
    return order === 'desc' ? collator.compare(b.k, a.k) : collator.compare(a.k, b.k);
  });

  const result: Record<string, any> = {};
  for (const { k } of decorated) {
    result[k] = deep ? sortKeysCustom(val[k], order, deep, sortArrays) : val[k];
  }

  return result;
}

const SAMPLE_UNSORTED = {
  zebra: "animal",
  apple: "fruit",
  mango: {
    sweetness: 10,
    origin: "India",
    calories: 150,
    vitamins: ["C", "A", "B6"]
  },
  banana: "fruit",
  details: {
    zoo: "San Diego",
    age: 5,
    location: {
      zip: 92101,
      country: "USA",
      city: "San Diego"
    }
  }
};

export default function JsonSorterApp() {
  const [doc, actions] = useTextDoc(JSON.stringify(SAMPLE_UNSORTED, null, 2));
  const [order, setOrder] = useState<SortOrder>('asc');
  const [deep, setDeep] = useState<boolean>(true);
  const [sortArrays, setSortArrays] = useState<boolean>(false);
  const [indent, setIndent] = useState<number>(2);
  const [busy, setBusy] = useState<boolean>(false);
  const [sortedManual, setSortedManual] = useState<string>('');

  const { message: toastMessage, show: showToast } = useToast(3000);

  const debouncedText = useDebouncedValue(doc.text, 250);

  const { sortedOutput, error, keyCount } = useSorterCompute(debouncedText, order, deep, sortArrays, indent);
  const displaySorted = doc.isLarge ? sortedManual : sortedOutput;

  const handleSort = useCallback(async () => {
    if (!doc.text.trim()) {
      setSortedManual('');
      return;
    }
    setBusy(true);
    await yieldToPaint();
    const res = safeParseJson(doc.text, false);
    if (res.error) {
      setSortedManual('');
      setBusy(false);
      return;
    }
    try {
      const sorted = sortKeysCustom(res.data, order, deep, sortArrays);
      const output = JSON.stringify(sorted, null, indent);
      setSortedManual(output);
      showToast("Sorted JSON copied to clipboard!");
    } catch (e: any) {
      setSortedManual('');
    } finally {
      setBusy(false);
    }
  }, [doc.text, order, deep, sortArrays, indent, showToast]);

  const handleSmartRepair = useCallback(() => {
    const fixed = repairJsonString(doc.text);
    actions.setText(fixed);
    showToast("Repaired JSON syntax");
  }, [doc.text, actions, showToast]);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(displaySorted || doc.text);
    showToast(ok ? "Sorted JSON copied to clipboard!" : "Copy failed");
  }, [displaySorted, doc.text, showToast]);

  const handleDownload = useCallback(() => {
    const name = deriveDownloadName(doc.filename, ".sorted", "sorted");
    downloadText(displaySorted || doc.text, name, 'application/json');
    showToast(`Downloaded ${name}`);
  }, [displaySorted, doc.text, doc.filename, showToast]);

  const applyFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    actions.loadFile(result);
    setSortedManual('');
    showToast(`Loaded ${result.name} (${formatBytes(result.size)})`);
  }, [actions, showToast]);

  const handleFileError = useCallback((msg: string) => {
    showToast(msg);
  }, [showToast]);

  const handleDropFiles = useCallback((files: FileList) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    readTextFile(arr[0], { accept: ACCEPT_JSON_TXT }).then(applyFile).catch(handleFileError);
  }, [applyFile, handleFileError]);

  const drop = useFileDrop(handleDropFiles);

  const handleClear = useCallback(() => {
    actions.clear();
    setSortedManual('');
    showToast("Cleared");
  }, [actions, showToast]);

  return (
    <div class="w-full bg-white dark:bg-[#0c0d0e] rounded-2xl border border-[#e5e5e5] dark:border-[#22242a] overflow-hidden shadow-xs transition-colors">
      <Toast message={toastMessage} />

      {/* Toolbar */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] dark:bg-[#14161b] border-b border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-4 text-xs">
          <label class="flex items-center gap-1.5 font-medium text-[#111111] dark:text-[#f0f0f2]">
            <span>Order:</span>
            <select
              value={order}
              onChange={(e) => setOrder((e.target as HTMLSelectElement).value as SortOrder)}
              class="px-2.5 py-1 rounded-full border border-[#cacacb] dark:border-[#2b2d35] bg-white dark:bg-[#18191d] text-xs outline-none cursor-pointer text-[#111111] dark:text-[#f0f0f2]"
            >
              <option value="asc">A to Z (Alphabetical)</option>
              <option value="desc">Z to A (Reverse)</option>
              <option value="length-asc">Key Length (Shortest first)</option>
              <option value="length-desc">Key Length (Longest first)</option>
            </select>
          </label>

          <label class="flex items-center gap-1.5 font-medium text-[#111111] dark:text-[#f0f0f2] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deep}
              onChange={(e) => setDeep((e.target as HTMLInputElement).checked)}
              class="rounded border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2]"
            />
            <span>Deep Recursive</span>
          </label>

          <label class="flex items-center gap-1.5 font-medium text-[#111111] dark:text-[#f0f0f2] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sortArrays}
              onChange={(e) => setSortArrays((e.target as HTMLInputElement).checked)}
              class="rounded border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2]"
            />
            <span>Sort Array Values</span>
          </label>

          <label class="flex items-center gap-1.5 font-medium text-[#111111] dark:text-[#f0f0f2]">
            <span>Indent:</span>
            <select
              value={indent}
              onChange={(e) => setIndent(Number((e.target as HTMLSelectElement).value))}
              class="px-2 py-1 rounded-full border border-[#cacacb] dark:border-[#2b2d35] bg-white dark:bg-[#18191d] text-xs outline-none text-[#111111] dark:text-[#f0f0f2]"
            >
              <option value="2">2 Spaces</option>
              <option value="4">4 Spaces</option>
              <option value="8">8 Spaces</option>
            </select>
          </label>
        </div>

        <div class="flex items-center gap-2">
          {error && (
            <button
              onClick={handleSmartRepair}
              disabled={busy}
              class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white text-[#1151ff] border border-[#1151ff] hover:bg-[#1151ff] hover:text-white transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {busy ? 'Working…' : '✨ Fix Syntax'}
            </button>
          )}
          <button
            onClick={handleSort}
            disabled={busy || !doc.text.trim()}
            class={`px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {busy ? 'Working…' : 'Sort'}
          </button>
          <button
            onClick={handleCopy}
            disabled={busy || !displaySorted}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Copy Sorted
          </button>
          <button
            onClick={handleDownload}
            disabled={busy || !displaySorted}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Download
          </button>
        </div>
      </div>

      {doc.isLarge && (
        <div class="px-4 sm:px-6 py-2 bg-[#fff4e5] dark:bg-[#3d2305]/40 border border-[#e5e5e5] dark:border-[#5c3a0a]">
          <div class="flex items-center gap-2 text-[11px] font-medium text-[#b45309] dark:text-[#fde047]">
            <span class="w-1.5 h-1.5 rounded-full bg-[#b45309] dark:bg-[#fde047]"></span>
            {LARGE_BANNER}
          </div>
          <button
            onClick={handleSort}
            disabled={busy}
            class="ml-auto px-3 py-1 rounded-full text-xs font-semibold border border-[#b45309] dark:border-[#fde047] text-[#b45309] dark:text-[#fde047] hover:bg-[#b45309] dark:hover:bg-[#fde047] hover:text-white dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            {busy ? 'Sorting…' : 'Sort'}
          </button>
        </div>
      )}

      {error && (
        <div class="bg-[#fde8e8] dark:bg-[#451010]/40 text-[#d30005] dark:text-[#fca5a5] px-6 py-2 text-xs font-mono border-b border-[#e5e5e5] dark:border-[#22242a] flex items-center justify-between">
          <span>Syntax Error: {error}</span>
          <button onClick={handleSmartRepair} disabled={busy} class={`underline font-semibold ml-4 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>
            Click to auto-repair
          </button>
        </div>
      )}

      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a]">
        <div {...drop.getDropProps()} class="relative p-4 bg-white dark:bg-[#0c0d0e]">
          {drop.isDragging && (
            <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
          )}
          <Panel
            title="Original JSON (Unsorted)"
            filename={doc.filename}
            lineCount={doc.lineCount}
            edited={doc.edited}
            accept={ACCEPT_JSON_TXT}
            onFile={applyFile}
            onError={handleFileError}
            fileLabel="Choose file"
            fileAriaLabel="Choose file for JSON sorter input"
            onClear={handleClear}
            onCopy={() => copyText(doc.text).then((ok) => showToast(ok ? "Copied input to clipboard!" : "Copy failed"))}
            onDownload={() => {
              const name = deriveDownloadName(doc.filename, ".json", "input");
              downloadText(doc.text, name, 'application/json');
              showToast(`Downloaded ${name}`);
            }}
            fullscreenable
          >
            <EditorTextarea
              value={doc.text}
              onInput={(v) => { actions.setText(v); setSortedManual(''); }}
              placeholder="Paste JSON to sort..."
              ariaLabel="JSON sorter input"
            />
          </Panel>
        </div>

        <div class="p-4 bg-[#fafafa] dark:bg-[#111215]">
          <Panel
            title="Sorted JSON Output"
            lineCount={displaySorted ? displaySorted.split('\n').length : 0}
            onCopy={handleCopy}
            onDownload={handleDownload}
            fullscreenable
          >
            <EditorTextarea
              value={displaySorted}
              readOnly
              onInput={() => { }}
              placeholder="Sorted JSON will appear here..."
              ariaLabel="JSON sorter output"
            />
          </Panel>
          <div class="text-[11px] font-mono text-[#007d48] dark:text-[#34d399] px-4 pt-1">
            {keyCount} keys sorted
          </div>
        </div>
      </div>

      <p class="text-[10px] text-[#707072] dark:text-[#8e8e93] px-4 pt-1 pb-4">
        Files are read locally and never uploaded.
      </p>
    </div>
  );
}

function useSorterCompute(
  text: string,
  order: SortOrder,
  deep: boolean,
  sortArrays: boolean,
  indent: number
) {
  return useMemo(() => {
    if (!text.trim()) {
      return { sortedOutput: '', error: null, keyCount: 0 };
    }
    const parseRes = safeParseJson(text, false);
    if (parseRes.error) {
      return { sortedOutput: '', error: parseRes.error, keyCount: 0 };
    }

            try {
              const sorted = sortKeysCustom(parseRes.data, order, deep, sortArrays);
              const output = JSON.stringify(sorted, null, indent);
              let count = 0;
              function countKeys(obj: any) {
                if (obj && typeof obj === 'object') {
                  if (!Array.isArray(obj)) {
                    count += Object.keys(obj).length;
                  }
                  Object.values(obj).forEach(countKeys);
                }
              }
              countKeys(sorted);
              return { sortedOutput: output, error: null, keyCount: count };
            } catch (e: any) {
              const msg = e.message || 'Error sorting keys';
              return { sortedOutput: '', error: msg, keyCount: 0 };
            }
        }, [text, order, deep, sortArrays, indent]);
}
