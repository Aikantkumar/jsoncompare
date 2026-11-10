import { useState, useCallback } from 'preact/hooks';
import { useToast } from '../../hooks/useToast';
import { formatBytes, readTextFile } from '../../utils/fileIO';
import { copyText, downloadText, deriveDownloadName } from '../../utils/download';
import { useTextDoc } from '../../hooks/useTextDoc';
import { useFileDrop } from '../../hooks/useFileDrop';
import Toast from '../../components/shared/Toast';
import Panel from '../../components/shared/Panel';
import EditorTextarea from '../../components/shared/EditorTextarea';

const ACCEPT_INPUT = ['.json', '.txt', '.log'];

export default function JsonEscapeUnescapeApp() {
  const [doc, actions] = useTextDoc(
    '{"id": 101, "message": "Database connected successfully", "status": "OK"}'
  );
  const [output, setOutput] = useState<string>('');

  const { message: toastMessage, show: showToast } = useToast(3000);

  const handleUnescape = useCallback(() => {
    try {
      let unescaped = inputUnescape(doc.text);
      try {
        const parsed = JSON.parse(unescaped);
        unescaped = JSON.stringify(parsed, null, 2);
      } catch {}
      setOutput(unescaped);
      showToast("Unescaped successfully!");
    } catch (e: any) {
      showToast("Error unescaping string");
    }
  }, [doc.text, showToast]);

  const handleEscape = useCallback(() => {
    try {
      const escaped = JSON.stringify(doc.text);
      setOutput(escaped);
      showToast("Escaped string successfully!");
    } catch {
      showToast("Error escaping string");
    }
  }, [doc.text, showToast]);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(output || doc.text);
    showToast(ok ? "Copied to clipboard!" : "Copy failed");
  }, [output, doc.text, showToast]);

  const handleDownloadOutput = useCallback(() => {
    const name = deriveDownloadName(doc.filename, ".out", "output");
    downloadText(output || doc.text, name, 'application/json');
    showToast(`Downloaded ${name}`);
  }, [output, doc.text, doc.filename, showToast]);

  const applyFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    actions.loadFile(result);
    showToast(`Loaded ${result.name} (${formatBytes(result.size)})`);
  }, [actions, showToast]);

  const handleFileError = useCallback((msg: string) => {
    showToast(msg);
  }, [showToast]);

  const handleDropFiles = useCallback((files: FileList) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    readTextFile(arr[0], { accept: ACCEPT_INPUT }).then(applyFile).catch(handleFileError);
  }, [applyFile, handleFileError]);

  const drop = useFileDrop(handleDropFiles);

  const handleClear = useCallback(() => {
    actions.clear();
    setOutput('');
    showToast("Cleared");
  }, [actions, showToast]);

  return (
    <div class="w-full bg-white dark:bg-[#0c0d0e] rounded-2xl border border-[#e5e5e5] dark:border-[#22242a] overflow-hidden shadow-xs transition-colors">
      <Toast message={toastMessage} />

      {/* Toolbar */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] dark:bg-[#14161b] border-b border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3">
        <span class="text-xs font-semibold text-[#111111] dark:text-[#f0f0f2]">
          Stringify, Unescape & Escape JSON
        </span>

        <div class="flex items-center gap-2">
          <button
            onClick={handleUnescape}
            class="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer"
          >
            Unescape JSON
          </button>
          <button
            onClick={handleEscape}
            class="px-4 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            Escape JSON String
          </button>
          <button
            onClick={handleCopy}
            disabled={!output && !doc.text}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            Copy
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a]">
        <div {...drop.getDropProps()} class="relative p-4 bg-white dark:bg-[#0c0d0e]">
          {drop.isDragging && (
            <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
          )}
          <Panel
            title="Input String / Payload"
            filename={doc.filename}
            lineCount={doc.lineCount}
            edited={doc.edited}
            accept={ACCEPT_INPUT}
            onFile={applyFile}
            onError={handleFileError}
            fileLabel="Choose file"
            fileAriaLabel="Choose file for escape/unescape input"
            onClear={handleClear}
            onCopy={handleCopy}
            fullscreenable
          >
            <EditorTextarea
              value={doc.text}
              onInput={(v) => actions.setText(v)}
              placeholder="Paste string or JSON here..."
              ariaLabel="Escape/unescape input"
            />
          </Panel>
        </div>

        <div class="p-4 bg-[#fafafa] dark:bg-[#111215]">
          <Panel
            title="Result Output"
            lineCount={output ? output.split('\n').length : 0}
            onCopy={handleCopy}
            onDownload={handleDownloadOutput}
            fullscreenable
          >
            <EditorTextarea
              value={output}
              readOnly
              onInput={() => {}}
              placeholder="Result will appear here..."
              ariaLabel="Escape/unescape output"
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

function inputUnescape(input: string): string {
  let unescaped = input.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  if (unescaped.startsWith('"') && unescaped.endsWith('"')) {
    try {
      unescaped = JSON.parse(unescaped);
    } catch {}
  }
  return unescaped;
}
