import { useState, useMemo } from 'preact/hooks';
import { safeParseJson, generateJsonPatch } from '../../utils/jsonDiff';

export default function JsonPatchGeneratorApp() {
  const [sourceJson, setSourceJson] = useState<string>(
    JSON.stringify({ name: "ACME Corp", plan: "starter", seats: 5, active: true }, null, 2)
  );
  const [targetJson, setTargetJson] = useState<string>(
    JSON.stringify({ name: "ACME Corp", plan: "enterprise", seats: 50, active: true, customDomain: "acme.com" }, null, 2)
  );
  const [toastMessage, setToastMessage] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const { patches, error } = useMemo(() => {
    const s = safeParseJson(sourceJson);
    const t = safeParseJson(targetJson);

    if (s.error) return { patches: [], error: `Source JSON error: ${s.error}` };
    if (t.error) return { patches: [], error: `Target JSON error: ${t.error}` };

    if (s.data && t.data) {
      return { patches: generateJsonPatch(s.data, t.data), error: null };
    }

    return { patches: [], error: null };
  }, [sourceJson, targetJson]);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(patches, null, 2));
    showToast("RFC 6902 Patch copied to clipboard!");
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
        <div class="flex items-center gap-2 text-xs">
          <span class="font-semibold text-[#111111]">
            RFC 6902 Patch Generator
          </span>
          <span class="px-2 py-0.5 rounded-full bg-white border border-[#cacacb] text-[11px] font-mono">
            {patches.length} operations
          </span>
        </div>

        <button
          onClick={handleCopy}
          class="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] transition-colors cursor-pointer"
        >
          Copy Patch Operations
        </button>
      </div>

      {error && (
        <div class="bg-[#fde8e8] text-[#d30005] px-6 py-2 text-xs font-mono border-b border-[#e5e5e5]">
          {error}
        </div>
      )}

      {/* Two inputs */}
      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] border-b border-[#e5e5e5]">
        <div class="p-4">
          <div class="text-[11px] font-semibold text-[#707072] uppercase tracking-wide mb-2">Base / Source Document</div>
          <textarea
            value={sourceJson}
            onInput={(e) => setSourceJson((e.target as HTMLTextAreaElement).value)}
            rows={10}
            spellcheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] p-3 rounded-xl border border-[#e5e5e5] bg-white resize-y focus:outline-none focus:border-[#111111]"
          />
        </div>

        <div class="p-4">
          <div class="text-[11px] font-semibold text-[#707072] uppercase tracking-wide mb-2">Target / Desired Document</div>
          <textarea
            value={targetJson}
            onInput={(e) => setTargetJson((e.target as HTMLTextAreaElement).value)}
            rows={10}
            spellcheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] p-3 rounded-xl border border-[#e5e5e5] bg-white resize-y focus:outline-none focus:border-[#111111]"
          />
        </div>
      </div>

      {/* Generated Patch Output */}
      <div class="p-4 bg-[#fafafa]">
        <div class="text-[11px] font-semibold text-[#707072] uppercase tracking-wide mb-2">RFC 6902 Operations Output</div>
        <pre class="w-full font-mono text-xs leading-relaxed text-[#111111] p-4 rounded-xl border border-[#e5e5e5] bg-white max-h-[300px] overflow-auto">
          {JSON.stringify(patches, null, 2)}
        </pre>
      </div>
    </div>
  );
}

