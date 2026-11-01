import { useState, useMemo } from 'preact/hooks';
import { repairJsonString } from '../../utils/jsonDiff';

export default function JsonValidatorApp() {
  const [input, setInput] = useState<string>(
    `{\n  "service": "payments-api",\n  "status": "active",\n  "version": 2.4,\n  "endpoints": [\n    "/charge",\n    "/refund",\n  ] // note: trailing comma will test validation\n}`
  );
  const [toastMessage, setToastMessage] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const validation = useMemo(() => {
    if (!input.trim()) {
      return { isValid: null, message: 'Enter JSON to validate', line: null, col: null };
    }

    try {
      JSON.parse(input);
      return { isValid: true, message: 'Valid JSON (RFC 8259 compliant)', line: null, col: null };
    } catch (err: any) {
      const msg = err.message || 'Syntax error';
      // Attempt to extract position from error message (e.g., "at position 85" or "line 4 column 5")
      let line: number | null = null;
      let col: number | null = null;

      const posMatch = msg.match(/position (\d+)/i);
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        const sub = input.slice(0, pos);
        const lines = sub.split('\n');
        line = lines.length;
        col = lines[lines.length - 1].length + 1;
      }

      const lineColMatch = msg.match(/line (\d+) column (\d+)/i);
      if (lineColMatch) {
        line = parseInt(lineColMatch[1], 10);
        col = parseInt(lineColMatch[2], 10);
      }

      return {
        isValid: false,
        message: msg,
        line,
        col
      };
    }
  }, [input]);

  const handleSmartRepair = () => {
    const fixed = repairJsonString(input);
    setInput(fixed);
    showToast("Smart repair applied!");
  };

  return (
    <div class="w-full bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden shadow-xs">
      {toastMessage && (
        <div class="fixed bottom-6 right-6 z-50 bg-[#111111] text-white text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-[#1eaa52]"></span>
          {toastMessage}
        </div>
      )}

      {/* Validation Status Banner */}
      <div
        class={`p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e5e5] ${
          validation.isValid === true
            ? 'bg-[#e8f7ee] text-[#007d48]'
            : validation.isValid === false
            ? 'bg-[#fde8e8] text-[#d30005]'
            : 'bg-[#f5f5f5] text-[#707072]'
        }`}
      >
        <div class="flex items-center gap-3">
          <span class="w-3 h-3 rounded-full flex items-center justify-center font-bold text-xs">
            {validation.isValid === true ? '✓' : validation.isValid === false ? '✕' : '•'}
          </span>
          <span class="text-xs font-semibold">
            {validation.message}
            {validation.line && (
              <span class="font-mono ml-2 font-normal">
                [Line {validation.line}, Col {validation.col}]
              </span>
            )}
          </span>
        </div>

        <div class="flex items-center gap-2">
          {validation.isValid === false && (
            <button
              onClick={handleSmartRepair}
              class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white text-[#d30005] border border-[#d30005] hover:bg-[#d30005] hover:text-white transition-colors cursor-pointer"
            >
              ✨ Auto-Fix Errors
            </button>
          )}
          <button
            onClick={() => {
              navigator.clipboard.writeText(input);
              showToast("Copied to clipboard!");
            }}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white border border-[#cacacb] text-[#111111] hover:bg-[#111111] hover:text-white transition-colors cursor-pointer"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Textarea */}
      <div class="p-4">
        <textarea
          value={input}
          onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
          placeholder="Paste JSON payload to validate..."
          rows={18}
          spellCheck={false}
          class="w-full font-mono text-xs leading-relaxed text-[#111111] p-4 rounded-xl border border-[#e5e5e5] bg-white resize-y focus:outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111]"
        />
      </div>
    </div>
  );
}

