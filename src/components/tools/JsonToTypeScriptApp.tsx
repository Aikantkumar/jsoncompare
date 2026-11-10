import { useState, useCallback } from 'preact/hooks';
import { safeParseJson } from '../../utils/jsonDiff';
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

function jsonToTypeScript(json: any, rootName = 'Root'): string {
  const interfaces: Map<string, string> = new Map();

  function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function getType(value: any, keyName: string): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    const type = typeof value;
    if (type === 'string') return 'string';
    if (type === 'number') return 'number';
    if (type === 'boolean') return 'boolean';
    if (Array.isArray(value)) {
      if (value.length === 0) return 'any[]';
      const itemTypes = Array.from(new Set(value.map((v) => getType(v, `${keyName}Item`))));
      if (itemTypes.length === 1) return `${itemTypes[0]}[]`;
      return `(${itemTypes.join(' | ')})[]`;
    }
    if (type === 'object') {
      const interfaceName = capitalize(keyName);
      buildInterface(value, interfaceName);
      return interfaceName;
    }
    return 'any';
  }

  function buildInterface(obj: Record<string, any>, name: string) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    let lines: string[] = [];
    lines.push(`export interface ${name} {`);
    for (const [key, value] of Object.entries(obj)) {
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
      const propType = getType(value, key);
      lines.push(`  ${safeKey}: ${propType};`);
    }
    lines.push('}');
    interfaces.set(name, lines.join('\n'));
  }

  if (Array.isArray(json)) {
    if (json.length > 0 && typeof json[0] === 'object' && json[0] !== null) {
      buildInterface(json[0], `${rootName}Item`);
      interfaces.set(rootName, `export type ${rootName} = ${rootName}Item[];`);
    } else {
      interfaces.set(rootName, `export type ${rootName} = any[];`);
    }
  } else if (typeof json === 'object' && json !== null) {
    buildInterface(json, rootName);
  } else {
    return `export type ${rootName} = ${typeof json};`;
  }

  return Array.from(interfaces.values()).reverse().join('\n\n');
}

const ACCEPT_JSON = ['.json'];

export default function JsonToTypeScriptApp() {
  const [doc, actions] = useTextDoc(
    JSON.stringify(
      {
        id: "usr_109",
        username: "alex99",
        profile: {
          firstName: "Alex",
          lastName: "Rivers",
          age: 28,
          isVerified: true
        },
        roles: ["admin", "editor"],
        settings: {
          theme: "dark",
          notifications: {
            email: true,
            push: false
          }
        }
      },
      null,
      2
    )
  );
  const [rootInterfaceName, setRootInterfaceName] = useState<string>('UserResponse');
  const [busy, setBusy] = useState<boolean>(false);
  const [tsManual, setTsManual] = useState<string>('');

  const { message: toastMessage, show: showToast } = useToast(3000);

  const debouncedText = useDebouncedValue(doc.text, 250);

  const outputTs = useMemoCompute(debouncedText, rootInterfaceName);
  const displayTs = doc.isLarge ? tsManual : outputTs;

  const handleGenerate = useCallback(async () => {
    if (!doc.text.trim()) {
      setTsManual('');
      return;
    }
    setBusy(true);
    await yieldToPaint();
    const res = safeParseJson(doc.text);
    if (res.error) {
      setTsManual(`// Error parsing JSON:\n// ${res.error}`);
      setBusy(false);
      return;
    }
    if (res.data === null || res.data === undefined) {
      setTsManual('// Enter valid JSON to generate TypeScript interfaces');
      setBusy(false);
      return;
    }
    setTsManual(jsonToTypeScript(res.data, rootInterfaceName || 'Root'));
    showToast("TypeScript types generated!");
    setBusy(false);
  }, [doc.text, rootInterfaceName, showToast]);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(displayTs);
    showToast(ok ? "TypeScript types copied to clipboard!" : "Copy failed");
  }, [displayTs, showToast]);

  const handleDownloadTs = useCallback(() => {
    const name = `${rootInterfaceName || 'Root'}.ts`;
    downloadText(displayTs, name, 'text/plain');
    showToast(`Downloaded ${name}`);
  }, [displayTs, rootInterfaceName, showToast]);

  const handleDownloadInput = useCallback(() => {
    const name = deriveDownloadName(doc.filename, ".json", "input");
    downloadText(doc.text, name, 'application/json');
    showToast(`Downloaded ${name}`);
  }, [doc.text, doc.filename, showToast]);

  const applyFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    actions.loadFile(result);
    setTsManual('');
    showToast(`Loaded ${result.name} (${formatBytes(result.size)})`);
  }, [actions, showToast]);

  const handleFileError = useCallback((msg: string) => {
    showToast(msg);
  }, [showToast]);

  const handleDropFiles = useCallback((files: FileList) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    readTextFile(arr[0], { accept: ACCEPT_JSON }).then(applyFile).catch(handleFileError);
  }, [applyFile, handleFileError]);

  const drop = useFileDrop(handleDropFiles);

  const handleClear = useCallback(() => {
    actions.clear();
    setTsManual('');
    showToast("Cleared");
  }, [actions, showToast]);

  return (
    <div class="w-full bg-white dark:bg-[#0c0d0e] rounded-2xl border border-[#e5e5e5] dark:border-[#22242a] overflow-hidden shadow-xs transition-colors">
      <Toast message={toastMessage} />

      {/* Toolbar */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] dark:bg-[#14161b] border-b border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-xs">
          <span class="font-medium text-[#111111] dark:text-[#f0f0f2]">Root Interface:</span>
          <input
            type="text"
            value={rootInterfaceName}
            onInput={(e) => setRootInterfaceName((e.target as HTMLInputElement).value)}
            class="px-2.5 py-1 rounded-full border border-[#cacacb] dark:border-[#2b2d35] bg-white dark:bg-[#18191d] font-mono text-xs outline-none text-[#111111] dark:text-[#f0f0f2]"
          />
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={busy || !doc.text.trim()}
            class={`px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {busy ? 'Working…' : 'Generate'}
          </button>
          <button
            onClick={handleCopy}
            disabled={busy || !displayTs}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Copy TypeScript
          </button>
          <button
            onClick={handleDownloadTs}
            disabled={busy || !displayTs}
            class={`px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Download
          </button>
        </div>
      </div>

      {doc.isLarge && (
        <div class="px-4 sm:px-6 py-2 bg-[#fff4e5] dark:bg-[#3d2305]/40 border border-[#e5e5e5] dark:border-[#5c3a0a]">
          <div class="flex items-center gap-2 text-[11px] font-medium text-[#b45309] dark:text-[#fde047]">
            <span class="w-1.5 h-1.5 rounded-full bg-[#b45309] dark:bg-[#fde047]"></span>
            Large file mode: live generation disabled. Click "Generate" to generate TypeScript.
          </div>
          <button
            onClick={handleGenerate}
            disabled={busy}
            class="ml-auto px-3 py-1 rounded-full text-xs font-semibold border border-[#b45309] dark:border-[#fde047] text-[#b45309] dark:text-[#fde047] hover:bg-[#b45309] dark:hover:bg-[#fde047] hover:text-white dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>
      )}

      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a]">
        <div {...drop.getDropProps()} class="relative p-4 bg-white dark:bg-[#0c0d0e]">
          {drop.isDragging && (
            <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
          )}
          <Panel
            title="Input JSON Payload"
            filename={doc.filename}
            lineCount={doc.lineCount}
            edited={doc.edited}
            accept={ACCEPT_JSON}
            onFile={applyFile}
            onError={handleFileError}
            fileLabel="Choose file"
            fileAriaLabel="Choose file for TypeScript input"
            onClear={handleClear}
            onCopy={handleCopy}
            onDownload={handleDownloadInput}
            fullscreenable
          >
            <EditorTextarea
              value={doc.text}
              onInput={(v) => { actions.setText(v); setTsManual(''); }}
              placeholder="Paste JSON payload..."
              ariaLabel="JSON to TypeScript input"
            />
          </Panel>
        </div>

        <div class="p-4 bg-[#fafafa] dark:bg-[#111215]">
          <Panel
            title="Generated TypeScript Types"
            lineCount={displayTs ? displayTs.split('\n').length : 0}
            onCopy={handleCopy}
            onDownload={handleDownloadTs}
            fullscreenable
          >
            <EditorTextarea
              value={displayTs}
              readOnly
              onInput={() => {}}
              placeholder="TypeScript types will appear here..."
              ariaLabel="TypeScript output"
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

function useMemoCompute(text: string, rootName: string): string {
  const res = safeParseJson(text);
  if (res.error) {
    return `// Error parsing JSON:\n// ${res.error}`;
  }
  if (res.data === null || res.data === undefined) {
    return '// Enter valid JSON to generate TypeScript interfaces';
  }
  return jsonToTypeScript(res.data, rootName || 'Root');
}
