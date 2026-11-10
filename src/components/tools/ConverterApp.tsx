import { useState, useCallback } from 'preact/hooks';
import { jsonToYaml, yamlToJson, jsonToXml, xmlToJson, jsonToCsv, csvToJson } from '../../utils/formatConverters';
import { safeParseJson } from '../../utils/jsonDiff';
import { useToast } from '../../hooks/useToast';
import { formatBytes, readTextFile } from '../../utils/fileIO';
import { copyText, downloadText, deriveDownloadName } from '../../utils/download';
import { yieldToPaint } from '../../utils/async';
import { useTextDoc } from '../../hooks/useTextDoc';
import { useFileDrop } from '../../hooks/useFileDrop';
import Toast from '../../components/shared/Toast';
import Panel from '../../components/shared/Panel';
import EditorTextarea from '../../components/shared/EditorTextarea';
import {
  acceptForMode,
  downloadExtForMode,
  downloadMimeForMode,
  MODE_LABELS,
  type ConverterMode,
} from '../../utils/converterModes';

interface Props {
  initialMode: ConverterMode;
}

const INITIAL_INPUT: Record<ConverterMode, string> = {
  'json-to-yaml': JSON.stringify({ name: "my-app", version: "1.0.0", env: "production", database: { host: "127.0.0.1", port: 5432 } }, null, 2),
  'yaml-to-json': 'name: my-app\nversion: 1.0.0\nenv: production\ndatabase:\n  host: 127.0.0.1\n  port: 5432',
  'json-to-xml': JSON.stringify({ user: { id: 101, name: "Alice", active: true } }, null, 2),
  'xml-to-json': '<?xml version="1.0"?>\n<user>\n  <id>101</id>\n  <name>Alice</name>\n  <active>true</active>\n</user>',
  'json-to-csv': JSON.stringify([
    { id: 1, name: "Alpha", score: 95 },
    { id: 2, name: "Beta", score: 88 }
  ], null, 2),
  'csv-to-json': 'id,name,score\n1,Alpha,95\n2,Beta,88',
};

export default function ConverterApp({ initialMode }: Props) {
  const [mode, setMode] = useState<ConverterMode>(initialMode);
  const [doc, actions] = useTextDoc(INITIAL_INPUT[initialMode]);
  const [output, setOutput] = useState<string>('');
  const [outputName, setOutputName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  const { message: toastMessage, show: showToast } = useToast(3000);

  const handleConvert = useCallback(async () => {
    setError('');
    setBusy(true);
    await yieldToPaint();
    try {
      let result: string;
      if (mode === 'json-to-yaml') {
        const parsed = JSON.parse(doc.text);
        result = jsonToYaml(parsed);
      } else if (mode === 'yaml-to-json') {
        const res = yamlToJson(doc.text);
        result = JSON.stringify(res, null, 2);
      } else if (mode === 'json-to-xml') {
        const parsed = JSON.parse(doc.text);
        result = jsonToXml(parsed);
      } else if (mode === 'xml-to-json') {
        const res = xmlToJson(doc.text);
        result = JSON.stringify(res, null, 2);
      } else if (mode === 'json-to-csv') {
        const parsed = JSON.parse(doc.text);
        result = jsonToCsv(parsed);
      } else if (mode === 'csv-to-json') {
        const res = csvToJson(doc.text);
        result = JSON.stringify(res, null, 2);
      } else {
        result = '';
      }
      setOutput(result);
      setOutputName(`converted${downloadExtForMode(mode)}`);
      showToast("Converted successfully!");
    } catch (err: any) {
      setError(err.message || 'Error converting data');
      setOutput('');
      setOutputName('');
    } finally {
      setBusy(false);
    }
  }, [doc.text, mode, showToast]);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(output);
    showToast(ok ? "Copied to clipboard!" : "Copy failed");
  }, [output, showToast]);

  const handleDownload = useCallback(() => {
    if (!output) return;
    const name = deriveDownloadName(doc.filename, downloadExtForMode(mode), outputName || 'converted');
    downloadText(output, name, downloadMimeForMode(mode));
    showToast(`Downloaded ${name}`);
  }, [output, doc.filename, mode, outputName, showToast]);

  const handleDownloadOutput = useCallback(() => {
    if (!output) return;
    const name = deriveDownloadName(doc.filename, downloadExtForMode(mode), outputName || 'converted');
    downloadText(output, name, downloadMimeForMode(mode));
    showToast(`Downloaded ${name}`);
  }, [output, doc.filename, mode, outputName, showToast]);

  const handleModeChange = useCallback((next: ConverterMode) => {
    setMode(next);
    setOutput('');
    setOutputName('');
    setError('');
    setOutputName(`converted${downloadExtForMode(next)}`);
  }, []);

  const applyFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    actions.loadFile(result);
    setOutput('');
    setOutputName('');
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
    readTextFile(arr[0], { accept: acceptForMode(mode) }).then(applyFile).catch(handleFileError);
  }, [applyFile, handleFileError, mode]);

  const drop = useFileDrop(handleDropFiles);

  const handleClear = useCallback(() => {
    actions.clear();
    setOutput('');
    setOutputName('');
    setError('');
    showToast("Cleared");
  }, [actions, showToast]);

  return (
    <div class="w-full bg-white dark:bg-[#0c0d0e] rounded-2xl border border-[#e5e5e5] dark:border-[#22242a] overflow-hidden shadow-xs transition-colors">
      <Toast message={toastMessage} />

      {/* Toolbar */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] dark:bg-[#14161b] border-b border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <select
            value={mode}
            onChange={(e) => handleModeChange((e.target as HTMLSelectElement).value as ConverterMode)}
            class="px-3 py-1.5 rounded-full border border-[#cacacb] dark:border-[#2b2d35] bg-white dark:bg-[#18191d] text-xs font-semibold text-[#111111] dark:text-[#f0f0f2] outline-none"
          >
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value as ConverterMode}>{label}</option>
            ))}
          </select>
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={handleConvert}
            disabled={busy || !doc.text.trim()}
            class={`px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {busy ? 'Working…' : 'Convert Now'}
          </button>
          <button
            onClick={handleCopy}
            disabled={busy || !output}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Copy Result
          </button>
          <button
            onClick={handleDownload}
            disabled={busy || !output}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Download
          </button>
        </div>
      </div>

      {error && (
        <div class="bg-[#fde8e8] dark:bg-[#451010]/50 text-[#d30005] dark:text-[#fca5a5] px-6 py-2 text-xs font-mono border-b border-[#e5e5e5] dark:border-[#22242a]">
          Conversion Error: {error}
        </div>
      )}

      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a]">
        <div {...drop.getDropProps()} class="relative p-4 bg-white dark:bg-[#0c0d0e]">
          {drop.isDragging && (
            <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
          )}
          <Panel
            title="Input Source Data"
            filename={doc.filename}
            lineCount={doc.lineCount}
            edited={doc.edited}
            accept={acceptForMode(mode)}
            onFile={applyFile}
            onError={handleFileError}
            fileLabel="Choose file"
            fileAriaLabel={`Choose file for ${MODE_LABELS[mode]}`}
            onClear={handleClear}
            onCopy={() => handleCopyText(doc.text)}
            onDownload={() => handleDownloadText(doc.text, doc.filename)}
            fullscreenable
          >
            <EditorTextarea
              value={doc.text}
              onInput={(v) => { actions.setText(v); setOutput(''); setError(''); }}
              placeholder="Paste source data here..."
              ariaLabel="Converter input"
            />
          </Panel>
        </div>

        <div class="p-4 bg-[#fafafa] dark:bg-[#111215]">
          <Panel
            title="Converted Target Data"
            lineCount={output ? output.split('\n').length : 0}
            onCopy={handleCopy}
            onDownload={handleDownloadOutput}
            fullscreenable
          >
            <EditorTextarea
              value={output}
              readOnly
              onInput={() => {}}
              placeholder="Converted output will appear here..."
              ariaLabel="Converter output"
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

function handleCopyText(text: string) {
  void navigator.clipboard.writeText(text);
}

function handleDownloadText(text: string, filename: string | null) {
  const name = filename ?? 'converted';
  const dotIdx = name.lastIndexOf('.');
  const outName = dotIdx === -1 ? `${name}.txt` : `${name.slice(0, dotIdx)}.txt`;
  void downloadText(text, outName, 'text/plain');
}
