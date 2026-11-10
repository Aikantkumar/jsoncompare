import { useState, useCallback, useMemo } from 'preact/hooks';
import { safeParseJson, repairJsonString } from '../../utils/jsonDiff';
import { useToast } from '../../hooks/useToast';
import { formatBytes, readTextFile } from '../../utils/fileIO';
import { copyText, downloadText, deriveDownloadName } from '../../utils/download';
import { yieldToPaint } from '../../utils/async';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useTextDoc } from '../../hooks/useTextDoc';
import { useFileDrop } from '../../hooks/useFileDrop';
import Toast from '../../components/shared/Toast';
import Panel from '../../components/shared/Panel';
import EditorTextarea from '../../components/shared/EditorTextarea';

const ACCEPT_JSON_TXT = ['.json', '.txt'];
const LARGE_BANNER = 'Large file mode: live minification disabled. Click “Compress / Minify” to minify.';

const SAMPLE_INPUT = JSON.stringify(
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
);

export default function JsonMinifierApp() {
  const [doc, actions] = useTextDoc(SAMPLE_INPUT);
  const [busy, setBusy] = useState<boolean>(false);
  const [manualMinified, setManualMinified] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { message: toastMessage, show: showToast } = useToast(3000);

  const debouncedText = useDebouncedValue(doc.text, 250);

  // Compute live minification for non-large files
  const { liveMinified, liveError } = useMemo(() => {
    if (doc.isLarge || !debouncedText.trim()) {
      return { liveMinified: '', liveError: null };
    }
    const res = safeParseJson(debouncedText, false);
    if (res.error) {
      return { liveMinified: '', liveError: res.error };
    }
    try {
      return { liveMinified: JSON.stringify(res.data), liveError: null };
    } catch (e: any) {
      return { liveMinified: '', liveError: e.message || 'Error minifying JSON' };
    }
  }, [debouncedText, doc.isLarge]);

  const displayMinified = doc.isLarge ? manualMinified : (manualMinified || liveMinified);
  const currentError = error || (doc.isLarge ? null : liveError);

  // Derive size metrics safely without infinite render triggers
  const rawBytes = useMemo(() => new Blob([doc.text]).size, [doc.text]);
  const miniBytes = useMemo(() => new Blob([displayMinified]).size, [displayMinified]);
  const saved = displayMinified ? Math.max(0, rawBytes - miniBytes) : 0;
  const ratio = rawBytes > 0 && displayMinified ? Math.round((saved / rawBytes) * 100) : 0;

  const handleMinify = useCallback(async () => {
    if (!doc.text.trim()) {
      setManualMinified('');
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    await yieldToPaint();
    const res = safeParseJson(doc.text, false);
    if (res.error) {
      setError(res.error);
      setManualMinified('');
      showToast(`Syntax error: ${res.error}`);
      setBusy(false);
      return;
    }
    try {
      const min = JSON.stringify(res.data);
      setManualMinified(min);
      setError(null);
      showToast("Minified successfully!");
    } catch (err: any) {
      const msg = err.message || 'Error minifying JSON';
      setError(msg);
      showToast(msg);
    } finally {
      setBusy(false);
    }
  }, [doc.text, showToast]);

  const handleSmartRepair = useCallback(() => {
    if (!doc.text.trim()) return;
    const fixed = repairJsonString(doc.text);
    actions.setText(fixed);
    setManualMinified('');
    setError(null);
    showToast("Smart repair applied!");
  }, [doc.text, actions, showToast]);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(displayMinified || doc.text);
    showToast(ok ? "Copied minified JSON to clipboard!" : "Copy failed");
  }, [displayMinified, doc.text, showToast]);

  const handleDownload = useCallback(() => {
    const name = deriveDownloadName(doc.filename, ".min", "minified");
    downloadText(displayMinified || doc.text, name, 'application/json');
    showToast(`Downloaded ${name}`);
  }, [displayMinified, doc.text, doc.filename, showToast]);

  const applyFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    actions.loadFile(result);
    setManualMinified('');
    setError(null);
    showToast(`Loaded ${result.name} (${formatBytes(result.size)})`);
  }, [actions, showToast]);

  const handleFileError = useCallback((msg: string) => {
    setError(msg);
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
    setManualMinified('');
    setError(null);
    showToast("Cleared");
  }, [actions, showToast]);

  return (
    <div class="w-full bg-white dark:bg-[#0c0d0e] rounded-2xl border border-[#e5e5e5] dark:border-[#22242a] overflow-hidden shadow-xs transition-colors">
      <Toast message={toastMessage} />

      {/* Toolbar & Compression Stats */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] dark:bg-[#14161b] border-b border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3 text-xs font-mono">
          <span class="text-[#707072] dark:text-[#8e8e93]">Original: </span>
          <strong class="text-[#111111] dark:text-[#f0f0f2]">{rawBytes} bytes</strong>
          <span class="text-[#cacacb] dark:text-[#383d47]">|</span>
          <span class="text-[#707072] dark:text-[#8e8e93]">Minified: </span>
            <strong class="text-[#111111] dark:text-[#f0f0f2]">
              {displayMinified ? `${miniBytes} bytes` : '—'}
            </strong>
          {saved > 0 && displayMinified && (
            <span class="px-2 py-0.5 rounded-full bg-[#007d48]/10 dark:bg-[#1eaa52]/20 text-[#007d48] dark:text-[#34d399] font-semibold">
              -{saved} bytes ({ratio}%)
            </span>
          )}
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={handleSmartRepair}
            disabled={busy || !doc.text.trim()}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#1151ff] dark:text-[#60a5fa] hover:bg-[#1151ff] hover:text-white transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {busy ? 'Working…' : '✨ Fix Syntax'}
          </button>
          <button
            onClick={handleMinify}
            disabled={busy || !doc.text.trim()}
            class={`px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {busy ? 'Working…' : 'Compress / Minify'}
          </button>
          <button
            onClick={handleCopy}
            disabled={busy || !displayMinified}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Copy
          </button>
          <button
            onClick={handleDownload}
            disabled={busy || !displayMinified}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Download
          </button>
        </div>
      </div>

      {doc.isLarge && (
          <div class="px-4 sm:px-6 py-2 bg-[#fff4e5] dark:bg-[#3d2305]/40 border-b border-[#e5e5e5] dark:border-[#5c3a0a] flex items-center justify-between">
            <div class="flex items-center gap-2 text-[11px] font-medium text-[#b45309] dark:text-[#fde047]">
              <span class="w-1.5 h-1.5 rounded-full bg-[#b45309] dark:bg-[#fde047]"></span>
              {LARGE_BANNER}
            </div>
            <button
              onClick={handleMinify}
              disabled={busy}
              class="px-3 py-1 rounded-full text-xs font-semibold border border-[#b45309] dark:border-[#fde047] text-[#b45309] dark:text-[#fde047] hover:bg-[#b45309] dark:hover:bg-[#fde047] hover:text-white dark:hover:text-[#111111] transition-colors cursor-pointer"
            >
              {busy ? 'Minifying…' : 'Compress / Minify'}
            </button>
          </div>
      )}

          {currentError && (
            <div class="bg-[#fde8e8] dark:bg-[#451010]/40 text-[#d30005] dark:text-[#fca5a5] px-6 py-2 text-xs font-mono border-b border-[#e5e5e5] dark:border-[#22242a] flex items-center justify-between">
              <span>Syntax Error: {currentError}</span>
              <button
                onClick={handleSmartRepair}
                disabled={busy}
                class={`underline font-semibold ml-4 cursor-pointer hover:opacity-80 transition-opacity ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
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
                title="Input JSON"
                filename={doc.filename}
                lineCount={doc.lineCount}
                edited={doc.edited}
                accept={ACCEPT_JSON_TXT}
                onFile={applyFile}
                onError={handleFileError}
                fileLabel="Choose file"
                fileAriaLabel="Choose file for JSON minifier input"
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
                  onInput={(v) => {
                    actions.setText(v);
                    setManualMinified('');
                    setError(null);
                  }}
                  placeholder="Paste raw formatted JSON here..."
                  ariaLabel="JSON minifier input"
                />
              </Panel>
            </div>

            <div class="p-4 bg-[#fafafa] dark:bg-[#111215]">
              <Panel
                title="Minified Output"
                lineCount={displayMinified ? displayMinified.split('\n').length : 0}
                onCopy={handleCopy}
                onDownload={handleDownload}
                fullscreenable
              >
                <EditorTextarea
                  value={displayMinified}
                  readOnly
                  onInput={() => { }}
                  placeholder="Minified output will appear here..."
                  ariaLabel="JSON minifier output"
                />
              </Panel>
            </div>
          </div>

          <p class="text-[10px] text-[#707072] dark:text-[#8e8e93] px-4 pt-1 pb-4">
            Files are read locally and never uploaded.
          </p>
        </div>
      );
}
