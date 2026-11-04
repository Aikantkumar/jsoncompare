import { useState, useMemo } from 'preact/hooks';
import { safeParseJson, repairJsonString } from '../../utils/jsonDiff';

type SortOrder = 'asc' | 'desc' | 'length-asc' | 'length-desc';

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
      arr = [...arr].sort((a, b) => {
        const sa = typeof a === 'object' ? JSON.stringify(a) : String(a);
        const sb = typeof b === 'object' ? JSON.stringify(b) : String(b);
        return sa.localeCompare(sb);
      });
    }
    return arr;
  }

  let keys = Object.keys(val);

  switch (order) {
    case 'asc':
      keys.sort((a, b) => a.localeCompare(b));
      break;
    case 'desc':
      keys.sort((a, b) => b.localeCompare(a));
      break;
    case 'length-asc':
      keys.sort((a, b) => a.length - b.length || a.localeCompare(b));
      break;
    case 'length-desc':
      keys.sort((a, b) => b.length - a.length || a.localeCompare(b));
      break;
  }

  const result: Record<string, any> = {};
  for (const k of keys) {
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
  const [input, setInput] = useState<string>(JSON.stringify(SAMPLE_UNSORTED, null, 2));
  const [order, setOrder] = useState<SortOrder>('asc');
  const [deep, setDeep] = useState<boolean>(true);
  const [sortArrays, setSortArrays] = useState<boolean>(false);
  const [indent, setIndent] = useState<number>(2);
  const [toastMessage, setToastMessage] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const { sortedOutput, error, keyCount } = useMemo(() => {
    if (!input.trim()) return { sortedOutput: '', error: null, keyCount: 0 };

    const parseRes = safeParseJson(input, false);
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
      return { sortedOutput: '', error: e.message || 'Error sorting keys', keyCount: 0 };
    }
  }, [input, order, deep, sortArrays, indent]);

  const handleSmartRepair = () => {
    const fixed = repairJsonString(input);
    setInput(fixed);
    showToast("Repaired JSON syntax");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(sortedOutput);
    showToast("Sorted JSON copied to clipboard!");
  };

  const handleDownload = () => {
    const blob = new Blob([sortedOutput], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sorted.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded sorted.json");
  };

  return (
    <div class="w-full bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden shadow-xs">
      {toastMessage && (
        <div class="fixed bottom-6 right-6 z-50 bg-[#111111] text-white text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-[#1eaa52]"></span>
          {toastMessage}
        </div>
      )}

      {/* Toolbar */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] border-b border-[#e5e5e5] flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-4 text-xs">
          <label class="flex items-center gap-1.5 font-medium text-[#111111]">
            <span>Order:</span>
            <select
              value={order}
              onChange={(e) => setOrder((e.target as HTMLSelectElement).value as SortOrder)}
              class="px-2.5 py-1 rounded-full border border-[#cacacb] bg-white text-xs outline-none cursor-pointer"
            >
              <option value="asc">A to Z (Alphabetical)</option>
              <option value="desc">Z to A (Reverse)</option>
              <option value="length-asc">Key Length (Shortest first)</option>
              <option value="length-desc">Key Length (Longest first)</option>
            </select>
          </label>

          <label class="flex items-center gap-1.5 font-medium text-[#111111] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deep}
              onChange={(e) => setDeep((e.target as HTMLInputElement).checked)}
              class="rounded border-[#cacacb] text-[#111111]"
            />
            <span>Deep Recursive</span>
          </label>

          <label class="flex items-center gap-1.5 font-medium text-[#111111] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sortArrays}
              onChange={(e) => setSortArrays((e.target as HTMLInputElement).checked)}
              class="rounded border-[#cacacb] text-[#111111]"
            />
            <span>Sort Array Values</span>
          </label>

          <label class="flex items-center gap-1.5 font-medium text-[#111111]">
            <span>Indent:</span>
            <select
              value={indent}
              onChange={(e) => setIndent(Number((e.target as HTMLSelectElement).value))}
              class="px-2 py-1 rounded-full border border-[#cacacb] bg-white text-xs outline-none"
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
              class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white text-[#1151ff] border border-[#1151ff] hover:bg-[#1151ff] hover:text-white transition-colors cursor-pointer"
            >
              ✨ Fix Syntax
            </button>
          )}
          <button
            onClick={handleCopy}
            disabled={!!error || !sortedOutput}
            class="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] disabled:opacity-40 transition-colors cursor-pointer"
          >
            Copy Sorted
          </button>
          <button
            onClick={handleDownload}
            disabled={!!error || !sortedOutput}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white border border-[#cacacb] hover:bg-[#111111] hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
          >
            Download
          </button>
        </div>
      </div>

      {error && (
        <div class="bg-[#fde8e8] text-[#d30005] px-6 py-2 text-xs font-mono border-b border-[#e5e5e5] flex items-center justify-between">
          <span>Syntax Error: {error}</span>
          <button onClick={handleSmartRepair} class="underline font-semibold ml-4">
            Click to auto-repair
          </button>
        </div>
      )}

      {/* Side-by-side: Input vs Output */}
      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5]">
        <div class="p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] font-semibold text-[#707072] uppercase tracking-wide">
              Original JSON (Unsorted)
            </span>
            <span class="text-[11px] font-mono text-[#707072]">
              {input.split('\n').length} lines
            </span>
          </div>
          <textarea
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            rows={18}
            spellcheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] p-3 rounded-xl border border-[#e5e5e5] bg-white resize-y focus:outline-none focus:border-[#111111]"
          />
        </div>

        <div class="p-4 bg-[#fafafa]">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] font-semibold text-[#707072] uppercase tracking-wide">
              Sorted JSON Output
            </span>
            <span class="text-[11px] font-mono text-[#007d48]">
              {keyCount} keys sorted
            </span>
          </div>
          <textarea
            value={sortedOutput}
            readOnly
            placeholder="Sorted JSON will appear here..."
            rows={18}
            spellcheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] p-3 rounded-xl border border-[#e5e5e5] bg-white resize-y focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

