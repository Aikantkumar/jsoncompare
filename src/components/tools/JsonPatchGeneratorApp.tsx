import { useState, useCallback, useMemo, useRef, useEffect } from 'preact/hooks';
import { safeParseJson, generateJsonPatch } from '../../utils/jsonDiff';
import { useToast } from '../../hooks/useToast';
import { formatBytes, readTextFile, isLargeText } from '../../utils/fileIO';
import { copyText, downloadText, deriveDownloadName } from '../../utils/download';
import { yieldToPaint } from '../../utils/async';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useTextDoc } from '../../hooks/useTextDoc';
import { useFileDrop } from '../../hooks/useFileDrop';
import ToolWorkspace, { useToolWorkspace, FullscreenButton } from '../../components/shared/ToolWorkspace';
import ResizeHandle from '../../components/shared/ResizeHandle';
import Toast from '../../components/shared/Toast';
import Panel from '../../components/shared/Panel';
import EditorTextarea from '../../components/shared/EditorTextarea';
import ResultPre from '../../components/shared/ResultPre';
import { LangProvider, useT, useFormatNumber } from '../../components/shared/LangContext';

const ACCEPT_JSON_TXT = ['.json', '.txt'];

export default function JsonPatchGeneratorApp({ lang = 'en' }: { lang?: string } = {}) {
  return (
    <LangProvider lang={lang}>
      <JsonPatchGeneratorAppInner />
    </LangProvider>
  );
}

function JsonPatchGeneratorAppInner() {
  const t = useT();
  const formatNumber = useFormatNumber();
  const [sourceDoc, sourceActions] = useTextDoc(

const STORAGE_KEY = 'jsoncompare:json-patch-generator:topRatio';
const DEFAULT_TOP_RATIO = 0.4;
const MIN_TOP_RATIO = 0.15;
const MAX_TOP_RATIO = 0.85;

function getStoredTopRatio(): number {
  if (typeof window === 'undefined') return DEFAULT_TOP_RATIO;
  try {
    const item = localStorage.getItem(STORAGE_KEY);
    if (item !== null) {
      const val = parseFloat(item);
      if (!Number.isNaN(val) && val >= MIN_TOP_RATIO && val <= MAX_TOP_RATIO) {
        return val;
      }
    }
  } catch {
    // localStorage not available
  }
  return DEFAULT_TOP_RATIO;
}

function setStoredTopRatio(ratio: number) {
  try {
    localStorage.setItem(STORAGE_KEY, ratio.toString());
  } catch {
    // ignore
  }
}

export default function JsonPatchGeneratorApp() {
  const [sourceDoc, sourceActions] = useTextDoc(
    JSON.stringify({ name: "ACME Corp", plan: "starter", seats: 5, active: true }, null, 2)
  );
  const [targetDoc, targetActions] = useTextDoc(
    JSON.stringify({ name: "ACME Corp", plan: "enterprise", seats: 50, active: true, customDomain: "acme.com" }, null, 2)
  );
  const [busy, setBusy] = useState<boolean>(false);
  const [topRatio, setTopRatio] = useState<number>(getStoredTopRatio);

  const { message: toastMessage, show: showToast } = useToast(3000);
  const { isFullscreen } = useToolWorkspace();

  const debouncedSource = useDebouncedValue(sourceDoc.text, 250);
  const debouncedTarget = useDebouncedValue(targetDoc.text, 250);

  const { patches, error } = useMemoCompute(debouncedSource, debouncedTarget);

  const mainRef = useRef<HTMLDivElement>(null);
  const [normalHeightPx, setNormalHeightPx] = useState<number | null>(null);

  const handleGenerate = useCallback(async () => {
    setBusy(true);
    await yieldToPaint();
    const srcRes = safeParseJson(sourceDoc.text);
    const tgtRes = safeParseJson(targetDoc.text);
    if (srcRes.error) {
      showToast(t('patch.toastSourceError', { detail: srcRes.error }));
      setBusy(false);
      return;
    }
    if (tgtRes.error) {
      showToast(t('patch.toastTargetError', { detail: tgtRes.error }));
      setBusy(false);
      return;
    }
    if (srcRes.data && tgtRes.data) {
      const ps = generateJsonPatch(srcRes.data, tgtRes.data);
      showToast(t('patch.toastGenerated', { n: formatNumber(ps.length) }));
    }
    setBusy(false);
  }, [sourceDoc.text, targetDoc.text, showToast]);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(JSON.stringify(patches, null, 2));
    showToast(ok ? t('patch.toastCopiedPatch') : t('common.copyFailed'));
  }, [patches, showToast]);

  const handleDownload = useCallback(() => {
    downloadText(JSON.stringify(patches, null, 2), 'patch.json', 'application/json');
    showToast(t('patch.toastDownloadedPatch'));
  }, [patches, showToast]);

  const applySourceFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    sourceActions.loadFile(result);
    showToast(t('common.loadedFile', { name: result.name, size: formatBytes(result.size) }));
  }, [sourceActions, showToast]);

  const applyTargetFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    targetActions.loadFile(result);
    showToast(t('common.loadedFile', { name: result.name, size: formatBytes(result.size) }));
  }, [targetActions, showToast]);

  const handleFileError = useCallback((err: unknown) => {
    const e = err as Error & { code?: string; params?: Record<string, string> };
    const translated = e.code ? t(`error.file.${e.code}`, e.params) : null;
    showToast(translated ?? (e instanceof Error ? e.message : String(err)));
  }, [t, showToast]);

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
    showToast(t('patch.toastClearedSource'));
  }, [sourceActions, showToast]);

  const handleClearTarget = useCallback(() => {
    targetActions.clear();
    showToast(t('patch.toastClearedTarget'));
  }, [targetActions, showToast]);

  const handleResizeDrag = useCallback((clientY: number) => {
    const container = mainRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const handleHalfHeight = 4;
    const relativeY = clientY - rect.top - handleHalfHeight;
    const rawRatio = relativeY / rect.height;
    const clampedRatio = Math.min(MAX_TOP_RATIO, Math.max(MIN_TOP_RATIO, rawRatio));
    setTopRatio(clampedRatio);
    setStoredTopRatio(clampedRatio);
  }, []);

  const handleResizeReset = useCallback(() => {
    setTopRatio(DEFAULT_TOP_RATIO);
    setStoredTopRatio(DEFAULT_TOP_RATIO);
  }, []);

  const handleResizeKeyAdjust = useCallback((step: number) => {
    setTopRatio((prev) => {
      const next = Math.min(MAX_TOP_RATIO, Math.max(MIN_TOP_RATIO, prev + step));
      setStoredTopRatio(next);
      return next;
    });
  }, []);

  return (
    <ToolWorkspace class="w-full bg-white dark:bg-[#0c0d0e] rounded-2xl border border-[#e5e5e5] dark:border-[#22242a] overflow-hidden shadow-xs transition-colors">
      <Toast message={toastMessage} />

      {/* Toolbar */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] dark:bg-[#14161b] border-b border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div class="flex items-center gap-2 text-xs">
          <span class="font-semibold text-[#111111] dark:text-[#f0f0f2]">
            {t('patch.label')}
          </span>
          <span class="px-2 py-0.5 rounded-full bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[11px] font-mono text-[#111111] dark:text-[#f0f0f2]">
            {patches.length === 1 ? t('patch.operationsOne', { n: formatNumber(patches.length) }) : t('patch.operationsOther', { n: formatNumber(patches.length) })}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={busy || !sourceDoc.text.trim() || !targetDoc.text.trim()}
            class={`px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {busy ? t('common.working') : t('patch.btnGenerate')}
          </button>
          <button
            onClick={handleCopy}
            disabled={busy || patches.length === 0}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {t('patch.btnCopyPatch')}
          </button>
          <button
            onClick={handleDownload}
            disabled={busy || patches.length === 0}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {t('common.download')}
          </button>
          <FullscreenButton />
        </div>
      </div>

      {error && (
        <div class="bg-[#fde8e8] dark:bg-[#451010]/40 text-[#d30005] dark:text-[#fca5a5] px-6 py-2 text-xs font-mono border-b border-[#e5e5e5] dark:border-[#22242a] shrink-0">
          {t('common.errorLabel')} {error}
        </div>
      )}

      {sourceDoc.isLarge || targetDoc.isLarge && (
        <div class="px-4 sm:px-6 py-2 bg-[#fff4e5] dark:bg-[#3d2305]/40 border border-[#e5e5e5] dark:border-[#5c3a0a] shrink-0">
          <div class="flex items-center gap-2 text-[11px] font-medium text-[#b45309] dark:text-[#fde047]">
            <span class="w-1.5 h-1.5 rounded-full bg-[#b45309] dark:bg-[#fde047]"></span>
            {t('patch.largeBanner')}
          </div>
          <button
            onClick={handleGenerate}
            disabled={busy}
            class="ml-auto px-3 py-1 rounded-full text-xs font-semibold border border-[#b45309] dark:border-[#fde047] text-[#b45309] dark:text-[#fde047] hover:bg-[#b45309] dark:hover:bg-[#fde047] hover:text-white dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            {busy ? t('patch.btnGenerating') : t('patch.btnGenerate')}
          </button>
        </div>
      )}

      {/* Main area: inputs on top, divider, result below */}
      <div
        ref={mainRef}
        class={`flex flex-col ${isFullscreen ? 'h-full min-h-0 overflow-hidden' : ''}`}
      >
        {/* Two inputs */}
        <div class="flex-1 min-h-0 overflow-hidden">
          <div class={`grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a] border-b border-[#e5e5e5] dark:border-[#22242a] h-full`}>
            <div {...sourceDrop.getDropProps()} class={`relative ${isFullscreen ? 'h-full min-h-0' : 'p-4'} bg-white dark:bg-[#0c0d0e]`}>
              {sourceDrop.isDragging && (
                <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
              )}
              <Panel
                title={t('patch.titleSource')}
                filename={sourceDoc.filename}
                lineCount={sourceDoc.lineCount}
                edited={sourceDoc.edited}
                accept={ACCEPT_JSON_TXT}
                onFile={applySourceFile}
                onError={handleFileError}
                fileAriaLabel={t('patch.ariaChooseFileSource')}
                onClear={handleClearSource}
                onCopy={() => handleCopyText(sourceDoc.text)}
                onDownload={() => handleDownloadText(sourceDoc.text, sourceDoc.filename)}
              >
                <EditorTextarea
                  value={sourceDoc.text}
                  onInput={(v) => sourceActions.setText(v)}
                  placeholder={t('patch.placeholderSource')}
                  ariaLabel={t('patch.ariaSource')}
                  fillHeight={isFullscreen}
                />
              </Panel>
            </div>

            <div {...targetDrop.getDropProps()} class={`relative ${isFullscreen ? 'h-full min-h-0' : 'p-4'} bg-white dark:bg-[#0c0d0e]`}>
              {targetDrop.isDragging && (
                <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
              )}
              <Panel
                title={t('patch.titleTarget')}
                filename={targetDoc.filename}
                lineCount={targetDoc.lineCount}
                edited={targetDoc.edited}
                accept={ACCEPT_JSON_TXT}
                onFile={applyTargetFile}
                onError={handleFileError}
                fileAriaLabel={t('patch.ariaChooseFileTarget')}
                onClear={handleClearTarget}
                onCopy={() => handleCopyText(targetDoc.text)}
                onDownload={() => handleDownloadText(targetDoc.text, targetDoc.filename)}
              >
                <EditorTextarea
                  value={targetDoc.text}
                  onInput={(v) => targetActions.setText(v)}
                  placeholder={t('patch.placeholderTarget')}
                  ariaLabel={t('patch.ariaTarget')}
                  fillHeight={isFullscreen}
                />
              </Panel>
            </div>
          </div>
        </div>

        {/* Draggable divider */}
        <ResizeHandle
          onDrag={handleResizeDrag}
          onReset={handleResizeReset}
          onKeyAdjust={handleResizeKeyAdjust}
          valueNow={Math.round(topRatio * 100)}
          valueMin={Math.round(MIN_TOP_RATIO * 100)}
          valueMax={Math.round(MAX_TOP_RATIO * 100)}

        />

        {/* Generated Patch Output */}
        <div class="flex-1 min-h-0 overflow-hidden">
          <Panel
            title="RFC 6902 Operations Output"
          >
            <ResultPre
              value={JSON.stringify(patches, null, 2)}
              title={t('patch.titleOutput')}
              copyLabel={t('patch.btnCopyPatch')}
              downloadName="patch.json"
              downloadMime="application/json"
            />
          </Panel>
        </div>
      </div>

      {!isFullscreen && (
        <p class="text-[10px] text-[#707072] dark:text-[#8e8e93] px-4 pt-1 pb-4">
          {t('common.privacyFootnote')}
        </p>
      )}
    </ToolWorkspace>
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
