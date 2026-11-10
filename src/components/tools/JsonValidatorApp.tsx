import { useState, useCallback } from 'preact/hooks';
import { repairJsonString } from '../../utils/jsonDiff';
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
const LARGE_BANNER = 'Large file mode: live validation disabled. Click “Validate” to check.';

interface Validation {
  isValid: boolean | null;
  message: string;
  line: number | null;
  col: number | null;
}

function findLineCol(input: string, pos: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  for (let i = 0; i < pos && i < input.length; i++) {
    if (input[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

export default function JsonValidatorApp() {
  const [doc, actions] = useTextDoc(
    `{\n  "service": "payments-api",\n  "status": "active",\n  "version": 2.4,\n  "endpoints": [\n    "/charge",\n    "/refund",\n  ] // note: trailing comma will test validation\n}`
  );
  const [busy, setBusy] = useState<boolean>(false);

  const { message: toastMessage, show: showToast } = useToast(3000);

  const debouncedText = useDebouncedValue(doc.text, 250);

  const validation = useCallback((): Validation => {
    if (!debouncedText.trim()) {
      return { isValid: null, message: 'Enter JSON to validate', line: null, col: null };
    }
    try {
      JSON.parse(debouncedText);
      return { isValid: true, message: 'Valid JSON (RFC 8259 compliant)', line: null, col: null };
    } catch (err: any) {
      const msg = err.message || 'Syntax error';
      let line: number | null = null;
      let col: number | null = null;

      const posMatch = msg.match(/position (\d+)/i);
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        const found = findLineCol(debouncedText, pos);
        line = found.line;
        col = found.col;
      }

      const lineColMatch = msg.match(/line (\d+) column (\d+)/i);
      if (lineColMatch) {
        line = parseInt(lineColMatch[1], 10);
        col = parseInt(lineColMatch[2], 10);
      }

      return { isValid: false, message: msg, line, col };
    }
  }, [debouncedText]);

  const validationResult = validation();

  const [error, setError] = useState<string>('');

  const handleValidate = useCallback(async () => {
    setBusy(true);
    await yieldToPaint();
    setBusy(false);
  }, []);

  const handleSmartRepair = useCallback(async () => {
    const fixed = repairJsonString(doc.text);
    actions.setText(fixed);
    showToast("Smart repair applied!");
  }, [doc.text, actions, showToast]);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(doc.text);
    showToast(ok ? "Copied to clipboard!" : "Copy failed");
  }, [doc.text, showToast]);

  const handleDownload = useCallback(() => {
    const name = deriveDownloadName(doc.filename, ".validated", "validated");
    downloadText(doc.text, name, 'application/json');
    showToast(`Downloaded ${name}`);
  }, [doc.text, doc.filename, showToast]);

  const applyFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    actions.loadFile(result);
    setError('');
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
    setError('');
    showToast("Cleared");
  }, [actions, showToast]);

  return (
    <div class="w-full bg-white dark:bg-[#0c0d0e] rounded-2xl border border-[#e5e5e5] dark:border-[#22242a] overflow-hidden shadow-xs transition-colors">
      <Toast message={toastMessage} />

      {/* Validation Status Banner */}
      <div
        class={`p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e5e5] dark:border-[#22242a] ${
          validationResult.isValid === true
            ? 'bg-[#e8f7ee] dark:bg-[#06331e]/40 text-[#007d48] dark:text-[#34d399]'
            : validationResult.isValid === false
            ? 'bg-[#fde8e8] dark:bg-[#451010]/40 text-[#d30005] dark:text-[#fca5a5]'
            : 'bg-[#f5f5f5] dark:bg-[#14161b] text-[#707072] dark:text-[#b5b5b8]'
        }`}
      >
        <div class="flex items-center gap-3">
          <span class="w-3 h-3 rounded-full flex items-center justify-center font-bold text-xs border border-current">
            {validationResult.isValid === true ? '✓' : validationResult.isValid === false ? '✕' : '•'}
          </span>
          <span class="text-xs font-semibold">
            {validationResult.message}
            {validationResult.line && (
              <span class="font-mono ml-2 font-normal">
                [Line {validationResult.line}, Col {validationResult.col}]
              </span>
            )}
          </span>
        </div>

        <div class="flex items-center gap-2">
          {validationResult.isValid === false && (
            <button
              onClick={handleSmartRepair}
              disabled={busy}
              class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white text-[#d30005] border border-[#d30005] hover:bg-[#d30005] hover:text-white transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {busy ? 'Working…' : '✨ Auto-Fix Errors'}
            </button>
          )}
          <button
            onClick={handleCopy}
            disabled={busy || !doc.text.trim()}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Copy
          </button>
          <button
            onClick={handleDownload}
            disabled={busy || !doc.text.trim()}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
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
            onClick={handleValidate}
            disabled={busy}
            class="ml-auto px-3 py-1 rounded-full text-xs font-semibold border border-[#b45309] dark:border-[#fde047] text-[#b45309] dark:text-[#fde047] hover:bg-[#b45309] dark:hover:bg-[#fde047] hover:text-white dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            {busy ? 'Validating…' : 'Validate'}
          </button>
        </div>
      )}

      {/* Editor */}
      <div {...drop.getDropProps()} class="relative p-4 bg-white dark:bg-[#0c0d0e]">
        {drop.isDragging && (
          <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
        )}
        <Panel
          title="JSON to Validate"
          filename={doc.filename}
          lineCount={doc.lineCount}
          edited={doc.edited}
          accept={ACCEPT_JSON_TXT}
          onFile={applyFile}
          onError={handleFileError}
          fileLabel="Choose file"
          fileAriaLabel="Choose file for JSON validation"
          onClear={handleClear}
          onCopy={handleCopy}
          onDownload={handleDownload}
          fullscreenable
        >
          <EditorTextarea
            value={doc.text}
            onInput={(v) => { actions.setText(v); setError(''); }}
            placeholder="Paste JSON payload to validate..."
            ariaLabel="JSON validator input"
          />
        </Panel>
        <p class="text-[10px] text-[#707072] dark:text-[#8e8e93] px-4 pt-1">
          Files are read locally and never uploaded.
        </p>
      </div>
    </div>
  );
}
