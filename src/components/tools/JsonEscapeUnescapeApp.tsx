import { useState, useCallback } from 'preact/hooks';
import { useToast } from '../../hooks/useToast';
import { formatBytes, readTextFile } from '../../utils/fileIO';
import { copyText, downloadText, deriveDownloadName } from '../../utils/download';
import { useTextDoc } from '../../hooks/useTextDoc';
import { useFileDrop } from '../../hooks/useFileDrop';
import ToolWorkspace, { useToolWorkspace, FullscreenButton } from '../../components/shared/ToolWorkspace';
import Toast from '../../components/shared/Toast';
import Panel from '../../components/shared/Panel';
import EditorTextarea from '../../components/shared/EditorTextarea';
import { LangProvider, useT } from '../../components/shared/LangContext';

const ACCEPT_INPUT = ['.json', '.txt', '.log'];

export default function JsonEscapeUnescapeApp({ lang = 'en' }: { lang?: string } = {}) {
  return (
    <LangProvider lang={lang}>
      <JsonEscapeUnescapeAppInner />
    </LangProvider>
  );
}

function JsonEscapeUnescapeAppInner() {
  const t = useT();
  const [doc, actions] = useTextDoc(
    '{"id": 101, "message": "Database connected successfully", "status": "OK"}',
    { persistKey: 'escape:doc' }
  );
  const [output, setOutput] = useState<string>('');

  const { message: toastMessage, show: showToast } = useToast(3000);
  const { isFullscreen } = useToolWorkspace();

  const handleUnescape = useCallback(() => {
    try {
      let unescaped = inputUnescape(doc.text);
      try {
        const parsed = JSON.parse(unescaped);
        unescaped = JSON.stringify(parsed, null, 2);
      } catch {}
      setOutput(unescaped);
      showToast(t('escape.toastUnescaped'));
    } catch (e: any) {
      showToast(t('escape.toastUnescapeError'));
    }
  }, [doc.text, showToast]);

  const handleEscape = useCallback(() => {
    try {
      const escaped = JSON.stringify(doc.text);
      setOutput(escaped);
      showToast(t('escape.toastEscaped'));
    } catch {
      showToast(t('escape.toastEscapeError'));
    }
  }, [doc.text, showToast]);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(output || doc.text);
    showToast(ok ? t('escape.toastCopied') : t('common.copyFailed'));
  }, [output, doc.text, showToast]);

  const handleDownloadOutput = useCallback(() => {
    const name = deriveDownloadName(doc.filename, ".out", "output");
    downloadText(output || doc.text, name, 'application/json');
    showToast(t('common.downloadedFile', { name }));
  }, [output, doc.text, doc.filename, showToast]);

  const applyFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    actions.loadFile(result);
    showToast(t('common.loadedFile', { name: result.name, size: formatBytes(result.size) }));
  }, [actions, showToast]);

  const handleFileError = useCallback((err: unknown) => {
    const e = err as Error & { code?: string; params?: Record<string, string> };
    const translated = e.code ? t(`error.file.${e.code}`, e.params) : null;
    showToast(translated ?? (e instanceof Error ? e.message : String(err)));
  }, [t, showToast]);

  const handleDropFiles = useCallback((files: FileList) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    readTextFile(arr[0], { accept: ACCEPT_INPUT }).then(applyFile).catch(handleFileError);
  }, [applyFile, handleFileError]);

  const drop = useFileDrop(handleDropFiles);

  const handleClear = useCallback(() => {
    actions.clear();
    setOutput('');
    showToast(t('escape.toastCleared'));
  }, [actions, showToast]);

  return (
    <ToolWorkspace class="w-full bg-white dark:bg-[#0c0d0e] rounded-2xl border border-[#e5e5e5] dark:border-[#22242a] overflow-hidden shadow-xs transition-colors">
      <Toast message={toastMessage} />

      {/* Toolbar */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] dark:bg-[#14161b] border-b border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <span class="text-xs font-semibold text-[#111111] dark:text-[#f0f0f2]">
          {t('escape.label')}
        </span>

        <div class="flex items-center gap-2">
          <button
            onClick={handleUnescape}
            class="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer"
          >
            {t('escape.btnUnescape')}
          </button>
          <button
            onClick={handleEscape}
            class="px-4 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            {t('escape.btnEscape')}
          </button>
          <button
            onClick={handleCopy}
            disabled={!output && !doc.text}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            {t('common.copy')}
          </button>
          <FullscreenButton />
        </div>
      </div>

      <div class={`grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a] ${isFullscreen ? 'h-full min-h-0' : ''}`}>
        <div {...drop.getDropProps()} class={`relative ${isFullscreen ? 'h-full min-h-0' : 'p-4'} bg-white dark:bg-[#0c0d0e]`}>
          {drop.isDragging && (
            <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
          )}
          <Panel
          title={t('escape.titleInput')}
          filename={doc.filename}
          lineCount={doc.lineCount}
          edited={doc.edited}
          accept={ACCEPT_INPUT}
          onFile={applyFile}
          onError={handleFileError}
          fileAriaLabel={t('escape.ariaChooseFile')}
            onClear={handleClear}
            onCopy={handleCopy}
          >
            <EditorTextarea
              value={doc.text}
              onInput={(v) => actions.setText(v)}
              placeholder={t('escape.placeholderInput')}
              ariaLabel={t('escape.ariaInput')}
              fillHeight={isFullscreen}
            />
          </Panel>
        </div>

        <div class={`p-4 ${isFullscreen ? 'h-full min-h-0' : ''} bg-[#fafafa] dark:bg-[#111215]`}>
          <Panel
              title={t('common.resultOutput')}
            lineCount={output ? output.split('\n').length : 0}
            onCopy={handleCopy}
            onDownload={handleDownloadOutput}
          >
            <EditorTextarea
              value={output}
              readOnly
              onInput={() => {}}
              placeholder={t('escape.placeholderOutput')}
              ariaLabel={t('escape.ariaOutput')}
              fillHeight={isFullscreen}
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

function inputUnescape(input: string): string {
  let unescaped = input.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  if (unescaped.startsWith('"') && unescaped.endsWith('"')) {
    try {
      unescaped = JSON.parse(unescaped);
    } catch {}
  }
  return unescaped;
}
