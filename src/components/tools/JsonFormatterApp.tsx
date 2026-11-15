import { useState, useCallback } from 'preact/hooks';
import { safeParseJson, sortKeysDeep, repairJsonString } from '../../utils/jsonDiff';
import { useToast } from '../../hooks/useToast';
import { formatBytes, isLargeText, readTextFile } from '../../utils/fileIO';
import { copyText, downloadText, deriveDownloadName } from '../../utils/download';
import { yieldToPaint } from '../../utils/async';
import { useTextDoc } from '../../hooks/useTextDoc';
import { useFileDrop } from '../../hooks/useFileDrop';
import ToolWorkspace, { useToolWorkspace, FullscreenButton } from '../../components/shared/ToolWorkspace';
import Toast from '../../components/shared/Toast';
import Panel from '../../components/shared/Panel';
import EditorTextarea from '../../components/shared/EditorTextarea';
import { LangProvider, useT, useFormatNumber } from '../../components/shared/LangContext';

const ACCEPT_JSON_TXT = ['.json', '.txt'];

export default function JsonFormatterApp({ lang = 'en' }: { lang?: string } = {}) {
  return (
    <LangProvider lang={lang}>
      <JsonFormatterAppInner />
    </LangProvider>
  );
}

function JsonFormatterAppInner() {
  const t = useT();
  const formatNumber = useFormatNumber();
  const [doc, actions] = useTextDoc(
    JSON.stringify({ title: "JSON Formatter", features: ["beautify", "sort keys", "custom indent"], options: { spaces: 2, compact: false } }, null, 2)
  );
  const [indentSize, setIndentSize] = useState<number>(2);
  const [shouldSortKeys, setShouldSortKeys] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  const { message: toastMessage, show: showToast } = useToast(3000);
  const { isFullscreen } = useToolWorkspace();

  const handleFormat = useCallback(async () => {
    if (!doc.text.trim()) {
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    await yieldToPaint();
    try {
      let parsed = JSON.parse(doc.text);
      if (shouldSortKeys) {
        parsed = sortKeysDeep(parsed);
      }
      const formatted = JSON.stringify(parsed, null, indentSize);
      actions.setText(formatted);
      showToast(t('formatter.toastFormatted'));
    } catch (err: any) {
      setError(err.message || 'Syntax error in JSON');
    } finally {
      setBusy(false);
    }
  }, [doc.text, shouldSortKeys, indentSize, actions, showToast]);

  const handleSmartRepair = useCallback(async () => {
    if (!doc.text.trim()) {
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    await yieldToPaint();
    try {
      const repaired = repairJsonString(doc.text);
      const parsed = JSON.parse(repaired);
      const formatted = JSON.stringify(parsed, null, indentSize);
      actions.setText(formatted);
      showToast(t('formatter.toastRepaired'));
    } catch (err: any) {
      setError(err.message || 'Syntax error in JSON');
    } finally {
      setBusy(false);
    }
  }, [doc.text, indentSize, actions, showToast]);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(doc.text);
    showToast(ok ? t('formatter.toastCopied') : t('common.copyFailed'));
  }, [doc.text, showToast]);

  const handleDownload = useCallback(() => {
    const name = deriveDownloadName(doc.filename, ".formatted", "formatted");
    downloadText(doc.text, name, 'application/json');
    showToast(t('common.downloadedFile', { name }));
  }, [doc.text, doc.filename, showToast]);

  const applyFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    actions.loadFile(result);
    setError('');
    showToast(t('common.loadedFile', { name: result.name, size: formatBytes(result.size) }));
  }, [actions, showToast]);

  const handleFileError = useCallback((err: unknown) => {
    const e = err as Error & { code?: string; params?: Record<string, string> };
    const translated = e.code ? t(`error.file.${e.code}`, e.params) : null;
    const msg = translated ?? (e instanceof Error ? e.message : String(err));
    setError(msg);
    showToast(msg);
  }, [t, showToast]);

  const handleDropFiles = useCallback((files: FileList) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    readTextFile(arr[0], { accept: ACCEPT_JSON_TXT }).then(applyFile).catch(handleFileError);
  }, [applyFile, handleFileError]);

  const drop = useFileDrop(handleDropFiles);

  const handleClear = useCallback(() => {
    actions.clear();
    setError('');
    showToast(t('formatter.toastCleared'));
  }, [actions, showToast]);

  return (
    <ToolWorkspace class="w-full bg-white dark:bg-[#0c0d0e] rounded-2xl border border-[#e5e5e5] dark:border-[#22242a] overflow-hidden shadow-xs transition-colors">
      <Toast message={toastMessage} />

      {/* Toolbar */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] dark:bg-[#14161b] border-b border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div class="flex items-center gap-4 text-xs">
          <label class="flex items-center gap-1.5 font-medium text-[#111111] dark:text-[#f0f0f2]">
            <span>{t('formatter.labelIndentation')}</span>
            <select
              value={indentSize}
              onChange={(e) => setIndentSize(Number((e.target as HTMLSelectElement).value))}
              class="px-2 py-1 rounded-full border border-[#cacacb] dark:border-[#2b2d35] bg-white dark:bg-[#18191d] text-[#111111] dark:text-[#f0f0f2] text-xs outline-none"
            >
              <option value="2">{t('formatter.opt2')}</option>
              <option value="4">{t('formatter.opt4')}</option>
              <option value="8">{t('formatter.opt8')}</option>
            </select>
          </label>

          <label class="flex items-center gap-1.5 font-medium text-[#111111] dark:text-[#f0f0f2] cursor-pointer">
            <input
              type="checkbox"
              checked={shouldSortKeys}
              onChange={(e) => setShouldSortKeys((e.target as HTMLInputElement).checked)}
              class="rounded border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2]"
            />
            <span>{t('formatter.labelAlphabeticalKeys')}</span>
          </label>
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={handleSmartRepair}
            disabled={busy}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#1151ff] dark:text-[#60a5fa] hover:bg-[#1151ff] hover:text-white transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {busy ? t('common.working') : t('formatter.btnFixSyntax')}
          </button>
          <button
            onClick={handleFormat}
            disabled={busy}
            class={`px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {busy ? t('common.working') : t('formatter.btnBeautify')}
          </button>
          <button
            onClick={handleCopy}
            disabled={busy || !doc.text.trim()}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {t('common.copy')}
          </button>
          <button
            onClick={handleDownload}
            disabled={busy || !doc.text.trim()}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {t('common.download')}
          </button>
          <FullscreenButton />
        </div>
      </div>

      {doc.isLarge && (
        <div class="px-4 sm:px-6 py-2 bg-[#fff4e5] dark:bg-[#3d2305]/40 border border-[#e5e5e5] dark:border-[#5c3a0a] shrink-0">
          <div class="flex items-center gap-2 text-[11px] font-medium text-[#b45309] dark:text-[#fde047]">
            <span class="w-1.5 h-1.5 rounded-full bg-[#b45309] dark:bg-[#fde047]"></span>
            {t('formatter.largeBanner')}
          </div>
        </div>
      )}

      {error && (
        <div class="bg-[#fde8e8] dark:bg-[#451010]/50 text-[#d30005] dark:text-[#fca5a5] px-6 py-2 text-xs font-mono border-b border-[#e5e5e5] dark:border-[#22242a] flex items-center justify-between shrink-0">
          <span>{t('common.errorLabel')} {error}</span>
          <button onClick={handleSmartRepair} disabled={busy} class={`underline font-semibold ml-4 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>
            {t('formatter.btnAutoRepair')}
          </button>
        </div>
      )}

      {/* Editor */}
      <div {...drop.getDropProps()} class={`relative ${isFullscreen ? 'h-full min-h-0' : 'p-4'} bg-white dark:bg-[#0c0d0e]`}>
        {drop.isDragging && (
          <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
        )}
        <Panel
          title={t('formatter.titleInput')}
          filename={doc.filename}
          lineCount={doc.lineCount}
          edited={doc.edited}
          accept={ACCEPT_JSON_TXT}
          onFile={applyFile}
          onError={handleFileError}
          fileAriaLabel={t('formatter.ariaChooseFile')}
          onClear={handleClear}
          onCopy={handleCopy}
          onDownload={handleDownload}
        >
          <EditorTextarea
            value={doc.text}
            onInput={(v) => { actions.setText(v); setError(''); }}
            placeholder={t('formatter.placeholder')}
            ariaLabel={t('formatter.ariaInput')}
            fillHeight={isFullscreen}
          />
        </Panel>
        {!isFullscreen && (
          <p class="text-[10px] text-[#707072] dark:text-[#8e8e93] px-4 pt-1">
            {t('common.privacyFootnote')}
          </p>
        )}
      </div>
    </ToolWorkspace>
  );
}

