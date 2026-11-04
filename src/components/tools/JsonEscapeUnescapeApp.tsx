import { useState } from 'preact/hooks';

export default function JsonEscapeUnescapeApp() {
  const [input, setInput] = useState<string>(
    '{\\"id\\": 101, \\"message\\": \\"Database connected successfully\\", \\"status\\": \\"OK\\"}'
  );
  const [output, setOutput] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const handleUnescape = () => {
    try {
      // First try standard unescape
      let unescaped = input.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      if (unescaped.startsWith('"') && unescaped.endsWith('"')) {
        try {
          unescaped = JSON.parse(unescaped);
        } catch {}
      }
      // If it is valid JSON, format it nicely
      try {
        const parsed = JSON.parse(unescaped);
        unescaped = JSON.stringify(parsed, null, 2);
      } catch {}
      setOutput(unescaped);
      showToast("Unescaped successfully!");
    } catch (e: any) {
      showToast("Error unescaping string");
    }
  };

  const handleEscape = () => {
    try {
      const escaped = JSON.stringify(input);
      setOutput(escaped);
      showToast("Escaped string successfully!");
    } catch {
      showToast("Error escaping string");
    }
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
        <span class="text-xs font-semibold text-[#111111]">
          Stringify, Unescape & Escape JSON
        </span>

        <div class="flex items-center gap-2">
          <button
            onClick={handleUnescape}
            class="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] transition-colors cursor-pointer"
          >
            Unescape JSON
          </button>
          <button
            onClick={handleEscape}
            class="px-4 py-1.5 rounded-full text-xs font-semibold bg-white border border-[#cacacb] text-[#111111] hover:bg-[#111111] hover:text-white transition-colors cursor-pointer"
          >
            Escape JSON String
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(output || input);
              showToast("Copied to clipboard!");
            }}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white border border-[#cacacb] hover:bg-[#111111] hover:text-white transition-colors cursor-pointer"
          >
            Copy
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5]">
        <div class="p-4">
          <div class="text-[11px] font-semibold text-[#707072] uppercase tracking-wide mb-2">Input String / Payload</div>
          <textarea
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            rows={14}
            spellcheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] p-3 rounded-xl border border-[#e5e5e5] bg-white resize-y focus:outline-none focus:border-[#111111]"
          />
        </div>

        <div class="p-4 bg-[#fafafa]">
          <div class="text-[11px] font-semibold text-[#707072] uppercase tracking-wide mb-2">Result Output</div>
          <textarea
            value={output}
            readOnly
            placeholder="Result will appear here..."
            rows={14}
            spellcheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] p-3 rounded-xl border border-[#e5e5e5] bg-white resize-y focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

