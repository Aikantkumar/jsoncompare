import { useState } from 'preact/hooks';
import { safeParseJson, sortKeysDeep, repairJsonString } from '../../utils/jsonDiff';

export default function JsonFormatterApp() {
  const [input, setInput] = useState<string>(
    JSON.stringify({ title: "JSON Formatter", features: ["beautify", "sort keys", "custom indent"], options: { spaces: 2, compact: false } }, null, 2)
  );
  const [indentSize, setIndentSize] = useState<number>(2);
  const [shouldSortKeys, setShouldSortKeys] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const formatJson = () => {
    if (!input.trim()) {
      setError('');
      return;
    }
    try {
      let parsed = JSON.parse(input);
      if (shouldSortKeys) {
        parsed = sortKeysDeep(parsed);
      }
      const formatted = JSON.stringify(parsed, null, indentSize);
      setInput(formatted);
      setError('');
      showToast("Formatted successfully!");
    } catch (err: any) {
      setError(err.message || 'Syntax error in JSON');
    }
  };

  const handleSmartRepair = () => {
    const repaired = repairJsonString(input);
    setInput(repaired);
    try {
      const parsed = JSON.parse(repaired);
      setInput(JSON.stringify(parsed, null, indentSize));
      setError('');
      showToast("Repaired & formatted JSON!");
    } catch (err: any) {
      setError(err.message || 'Syntax error in JSON');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(input);
    showToast("Copied to clipboard!");
  };

  const handleDownload = () => {
    const blob = new Blob([input], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'formatted.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded formatted.json");
  };

  return (
    <div class="w-full bg-white dark:bg-[#0c0d0e] rounded-2xl border border-[#e5e5e5] dark:border-[#22242a] overflow-hidden shadow-xs transition-colors">
      {toastMessage && (
        <div class="fixed bottom-6 right-6 z-50 bg-[#111111] dark:bg-[#f0f0f2] text-white dark:text-[#111111] text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-[#1eaa52]"></span>
          {toastMessage}
        </div>
      )}

      {/* Toolbar */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] dark:bg-[#14161b] border-b border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-4 text-xs">
          <label class="flex items-center gap-1.5 font-medium text-[#111111] dark:text-[#f0f0f2]">
            <span>Indentation:</span>
            <select
              value={indentSize}
              onChange={(e) => setIndentSize(Number((e.target as HTMLSelectElement).value))}
              class="px-2 py-1 rounded-full border border-[#cacacb] dark:border-[#2b2d35] bg-white dark:bg-[#18191d] text-[#111111] dark:text-[#f0f0f2] text-xs outline-none"
            >
              <option value="2">2 Spaces</option>
              <option value="4">4 Spaces</option>
              <option value="8">8 Spaces</option>
            </select>
          </label>

          <label class="flex items-center gap-1.5 font-medium text-[#111111] dark:text-[#f0f0f2] cursor-pointer">
            <input
              type="checkbox"
              checked={shouldSortKeys}
              onChange={(e) => setShouldSortKeys((e.target as HTMLInputElement).checked)}
              class="rounded border-[#cacacb] dark:border-[#2b2d35] text-[#111111]"
            />
            <span>Alphabetical Keys</span>
          </label>
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={handleSmartRepair}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#1151ff] dark:text-[#60a5fa] hover:bg-[#1151ff] hover:text-white transition-colors cursor-pointer"
          >
            ✨ Fix Syntax
          </button>
          <button
            onClick={formatJson}
            class="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer"
          >
            Beautify
          </button>
          <button
            onClick={handleCopy}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            Copy
          </button>
          <button
            onClick={handleDownload}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            Download
          </button>
        </div>
      </div>

      {error && (
        <div class="bg-[#fde8e8] dark:bg-[#451010]/50 text-[#d30005] dark:text-[#fca5a5] px-6 py-2 text-xs font-mono border-b border-[#e5e5e5] dark:border-[#22242a] flex items-center justify-between">
          <span>Error: {error}</span>
          <button onClick={handleSmartRepair} class="underline font-semibold ml-4">Click to auto-repair</button>
        </div>
      )}

      {/* Editor Textarea */}
      <div class="p-4 bg-white dark:bg-[#0c0d0e]">
        <textarea
          value={input}
          onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
          placeholder="Paste JSON here..."
          rows={18}
          spellCheck={false}
          class="w-full font-mono text-xs leading-relaxed text-[#111111] dark:text-[#f0f0f2] p-4 rounded-xl border border-[#e5e5e5] dark:border-[#22242a] bg-white dark:bg-[#121316] resize-y focus:outline-none focus:border-[#111111] dark:focus:border-white focus:ring-1 focus:ring-[#111111] dark:focus:ring-white"
        />
      </div>
    </div>
  );
}

