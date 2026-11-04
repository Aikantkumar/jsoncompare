import { useState, useMemo } from 'preact/hooks';
import { safeParseJson } from '../../utils/jsonDiff';

export default function JsonMinifierApp() {
  const [input, setInput] = useState<string>(
    JSON.stringify(
      {
        application: "JSON Minifier Online",
        compression: "lossless",
        details: {
          stripWhitespace: true,
          removeNewlines: true,
          maintainPayloadIntegrity: true
        },
        supportedTypes: ["Object", "Array", "String", "Number", "Boolean", "Null"]
      },
      null,
      2
    )
  );
  const [minified, setMinified] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const stats = useMemo(() => {
    const rawBytes = new Blob([input]).size;
    const miniBytes = new Blob([minified]).size;
    const saved = rawBytes - miniBytes;
    const ratio = rawBytes > 0 ? Math.round((saved / rawBytes) * 100) : 0;
    return { rawBytes, miniBytes, saved: Math.max(0, saved), ratio: Math.max(0, ratio) };
  }, [input, minified]);

  const handleMinify = () => {
    if (!input.trim()) {
      setMinified('');
      setError('');
      return;
    }
    const res = safeParseJson(input);
    if (res.error) {
      setError(res.error);
      return;
    }
    setError('');
    const compressed = JSON.stringify(res.data);
    setMinified(compressed);
    showToast("Minified successfully!");
  };

  return (
    <div class="w-full bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden shadow-xs">
      {toastMessage && (
        <div class="fixed bottom-6 right-6 z-50 bg-[#111111] text-white text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-[#1eaa52]"></span>
          {toastMessage}
        </div>
      )}

      {/* Toolbar & Compression Stats */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] border-b border-[#e5e5e5] flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3 text-xs font-mono">
          <span class="text-[#707072]">Original: <strong class="text-[#111111]">{stats.rawBytes} bytes</strong></span>
          <span class="text-[#cacacb]">|</span>
          <span class="text-[#707072]">Minified: <strong class="text-[#111111]">{stats.miniBytes} bytes</strong></span>
          {stats.saved > 0 && (
            <span class="px-2 py-0.5 rounded-full bg-[#007d48]/10 text-[#007d48] font-semibold">
              -{stats.saved} bytes ({stats.ratio}%)
            </span>
          )}
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={handleMinify}
            class="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] transition-colors cursor-pointer"
          >
            Compress / Minify
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(minified || input);
              showToast("Copied to clipboard!");
            }}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white border border-[#cacacb] hover:bg-[#111111] hover:text-white transition-colors cursor-pointer"
          >
            Copy
          </button>
        </div>
      </div>

      {error && (
        <div class="bg-[#fde8e8] text-[#d30005] px-6 py-2 text-xs font-mono border-b border-[#e5e5e5]">
          Error: {error}
        </div>
      )}

      {/* Side-by-side or stacked view */}
      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5]">
        <div class="p-4">
          <div class="text-[11px] font-semibold text-[#707072] uppercase tracking-wide mb-2">Input JSON</div>
          <textarea
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            placeholder="Paste raw formatted JSON here..."
            rows={14}
            spellcheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] p-3 rounded-xl border border-[#e5e5e5] bg-white resize-y focus:outline-none focus:border-[#111111]"
          />
        </div>

        <div class="p-4 bg-[#fafafa]">
          <div class="text-[11px] font-semibold text-[#707072] uppercase tracking-wide mb-2">Minified Single-Line Output</div>
          <textarea
            value={minified}
            readOnly
            placeholder="Minified output will appear here..."
            rows={14}
            spellcheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] p-3 rounded-xl border border-[#e5e5e5] bg-white resize-y focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

