import { useState, useCallback } from 'preact/hooks';
import { safeParseJson, generateJsonPatch } from '../../utils/jsonDiff';
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
import ResultPre from '../../components/shared/ResultPre';

const ACCEPT_JSON_TXT = ['.json', '.txt'];
const LARGE_BANNER = 'Large file mode: live patch generation disabled. Click “Generate” to create the patch.';

export default function JsonPatchGeneratorApp() {
  const [sourceDoc, sourceActions] = useTextDoc(
    JSON.stringify({ name: "ACME Corp", plan: "starter", seats: 5, active: true }, null, 2)
  );
  const [targetDoc, targetActions] = useTextDoc(
    JSON.stringify({ name: "ACME Corp", plan: "enterprise", seats: 50, active: true, customDomain: "acme.com" }, null, 2)
  );
  const [busy, setBusy] = useState<boolean>(false);

  const { message: toastMessage, show: showToast } = useToast(3000);

  const debouncedSource = useDebouncedValue(sourceDoc.text, 250);
  const debouncedTarget = useDebouncedValue(targetDoc.text, 250);

  const { patches, error } = useMemoCompute(debouncedSource, debouncedTarget);

  const handleGenerate = useCallback(async () => {
    setBusy(true);
    await yieldToPaint();
    const s = safeParseJson(sourceDoc.text);
    const t = safeParseJson(targetDoc.text);
    if (s.error) {
      showToast(`Source JSON error: ${s.error}`);
      setBusy(false);
      return;
    }
    if (t.error) {
      showToast(`Target JSON error: ${t.error}`);
      setBusy(false);
      return;
    }
    if (s.data && t.data) {
      const ps = generateJsonPatch(s.data, t.data);
      showToast(`RFC 6902 Patch generated (${ps.length} operations)!`);
    }
    setBusy(false);
  }, [sourceDoc.text, targetDoc.text, showToast]);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(JSON.stringify(patches, null, 2));
    showToast(ok ? "RFC 6902 Patch copied to clipboard!" : "Copy failed");
  }, [patches, showToast]);

  const handleDownload = useCallback(() => {
    downloadText(JSON.stringify(patches, null, 2), 'patch.json', 'application/json');
    showToast("Downloaded patch.json");
  }, [patches, showToast]);

  const applySourceFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    sourceActions.loadFile(result);
    showToast(`Loaded ${result.name} (${formatBytes(result.size)})`);
  }, [sourceActions, showToast]);

  const applyTargetFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    targetActions.loadFile(result);
    showToast(`Loaded ${result.name} (${formatBytes(result.size)})`);
  }, [targetActions, showToast]);

  const handleFileError = useCallback((msg: string) => {
    showToast(msg);
  }, [showToast]);

  const handleDropFiles = useCallback((files: FileList) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    if (arr.length >= 2) {
      readTextFile(arr[0], { accept: ACCEPT_JSON_TXT }).then(applySourceFile).catch(handleFileError);
      readTextFile(arr[1], { accept: ACCEPT_JSON_TXT }).then(applyTargetFile).catch(handleFileError);
      return;
    }
    readTextFile(arr[0], { accept: ACCEPT_JSON_TXT }).then(applySourceFile).catch(handleFileError);
  }, [applySourceFile, applyTargetFile, handleFileError]);

  const sourceDrop = useFileDrop(handleDropFiles, { multiple: true });
  const targetDrop = useFileDrop((files) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    readTextFile(arr[0], { accept: ACCEPT_JSON_TXT }).then(applyTargetFile).catch(handleFileError);
  });

  const handleClearSource = useCallback(() => {
    sourceActions.clear();
    showToast("Cleared source");
  }, [sourceActions, showToast]);

  const handleClearTarget = useCallback(() => {
    targetActions.clear();
    showToast("Cleared target");
  }, [targetActions, showToast]);

  return (
    <div class="w-full bg-white dark:bg-[#0c0d0e] rounded-2xl border border-[#e5e5e5] dark:border-[#22242a] overflow-hidden shadow-xs transition-colors">
      <Toast message={toastMessage} />

      {/* Toolbar */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] dark:bg-[#14161b] border-b border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-xs">
          <span class="font-semibold text-[#111111] dark:text-[#f0f0f2]">
            RFC 6902 Patch Generator
          </span>
          <span class="px-2 py-0.5 rounded-full bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[11px] font-mono text-[#111111] dark:text-[#f0f0f2]">
            {patches.length} operations
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={busy || !sourceDoc.text.trim() || !targetDoc.text.trim()}
            class={`px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {busy ? 'Working…' : 'Generate Patch'}
          </button>
          <button
            onClick={handleCopy}
            disabled={busy || patches.length === 0}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Copy Patch Operations
          </button>
          <button
            onClick={handleDownload}
            disabled={busy || patches.length === 0}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Download
          </button>
        </div>
      </div>

      {error && (
        <div class="bg-[#fde8e8] dark:bg-[#451010]/40 text-[#d30005] dark:text-[#fca5a5] px-6 py-2 text-xs font-mono border-b border-[#e5e5e5] dark:border-[#22242a]">
          {error}
        </div>
      )}

      {sourceDoc.isLarge || targetDoc.isLarge && (
        <div class="px-4 sm:px-6 py-2 bg-[#fff4e5] dark:bg-[#3d2305]/40 border border-[#e5e5e5] dark:border-[#5c3a0a]">
          <div class="flex items-center gap-2 text-[11px] font-medium text-[#b45309] dark:text-[#fde047]">
            <span class="w-1.5 h-1.5 rounded-full bg-[#b45309] dark:bg-[#fde047]"></span>
            {LARGE_BANNER}
          </div>
          <button
            onClick={handleGenerate}
            disabled={busy}
            class="ml-auto px-3 py-1 rounded-full text-xs font-semibold border border-[#b45309] dark:border-[#fde047] text-[#b45309] dark:text-[#fde047] hover:bg-[#b45309] dark:hover:bg-[#fde047] hover:text-white dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            {busy ? 'Generating…' : 'Generate Patch'}
          </button>
        </div>
      )}

      {/* Two inputs */}
      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a] border-b border-[#e5e5e5] dark:border-[#22242a]">
        <div {...sourceDrop.getDropProps()} class="relative p-4 bg-white dark:bg-[#0c0d0e]">
          {sourceDrop.isDragging && (
            <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
          )}
          <Panel
            title="Base / Source Document"
            filename={sourceDoc.filename}
            lineCount={sourceDoc.lineCount}
            edited={sourceDoc.edited}
            accept={ACCEPT_JSON_TXT}
            onFile={applySourceFile}
            onError={handleFileError}
            fileLabel="Choose file"
            fileAriaLabel="Choose file for source document"
            onClear={handleClearSource}
            onCopy={() => handleCopyText(sourceDoc.text)}
            onDownload={() => handleDownloadText(sourceDoc.text, sourceDoc.filename)}
            fullscreenable
          >
            <EditorTextarea
              value={sourceDoc.text}
              onInput={(v) => sourceActions.setText(v)}
              placeholder="Base / Source JSON..."
              ariaLabel="Patch source editor"
            />
          </Panel>
        </div>

        <div {...targetDrop.getDropProps()} class="relative p-4 bg-white dark:bg-[#0c0d0e]">
          {targetDrop.isDragging && (
            <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
          )}
          <Panel
            title="Target / Desired Document"
            filename={targetDoc.filename}
            lineCount={targetDoc.lineCount}
            edited={targetDoc.edited}
            accept={ACCEPT_JSON_TXT}
            onFile={applyTargetFile}
            onError={handleFileError}
            fileLabel="Choose file"
            fileAriaLabel="Choose file for target document"
            onClear={handleClearTarget}
            onCopy={() => handleCopyText(targetDoc.text)}
            onDownload={() => handleDownloadText(targetDoc.text, targetDoc.filename)}
            fullscreenable
          >
            <EditorTextarea
              value={targetDoc.text}
              onInput={(v) => targetActions.setText(v)}
              placeholder="Target / Desired JSON..."
              ariaLabel="Patch target editor"
            />
          </Panel>
        </div>
      </div>

      {/* Generated Patch Output */}
      <Panel
        title="RFC 6902 Operations Output"
        fullscreenable
      >
        <ResultPre
          value={JSON.stringify(patches, null, 2)}
          title="RFC 6902 Operations Output"
          copyLabel="Copy Patch"
          downloadName="patch.json"
          downloadMime="application/json"
        />
      </Panel>

      <p class="text-[10px] text-[#707072] dark:text-[#8e8e93] px-4 pt-1 pb-4">
        Files are read locally and never uploaded.
      </p>
    </div>
  );
}

function handleCopyText(text: string) {
  void navigator.clipboard.writeText(text);
}

function handleDownloadText(text: string, filename: string | null) {
  const name = filename ?? 'source';
  const dotIdx = name.lastIndexOf('.');
  const outName = dotIdx === -1 ? `${name}.json` : `${name.slice(0, dotIdx)}.json`;
  void downloadText(text, outName, 'application/json');
}

function useMemoCompute(sourceText: string, targetText: string) {
  const s = safeParseJson(sourceText);
  const t = safeParseJson(targetText);

  if (s.error) return { patches: [] as any[], error: `Source JSON error: ${s.error}` };
  if (t.error) return { patches: [] as any[], error: `Target JSON error: ${t.error}` };

  if (s.data && t.data) {
    return { patches: generateJsonPatch(s.data, t.data), error: null };
  }

  return { patches: [] as any[], error: null };
}
