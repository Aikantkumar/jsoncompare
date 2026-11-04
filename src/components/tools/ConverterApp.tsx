import { useState } from 'preact/hooks';
import { jsonToYaml, yamlToJson, jsonToXml, xmlToJson, jsonToCsv, csvToJson } from '../../utils/formatConverters';
import { safeParseJson } from '../../utils/jsonDiff';

interface Props {
  initialMode: 'yaml-to-json' | 'json-to-yaml' | 'xml-to-json' | 'json-to-xml' | 'csv-to-json' | 'json-to-csv';
}

export default function ConverterApp({ initialMode }: Props) {
  const [mode, setMode] = useState(initialMode);
  const [input, setInput] = useState<string>(() => {
    if (initialMode === 'json-to-yaml') {
      return JSON.stringify({ name: "my-app", version: "1.0.0", env: "production", database: { host: "127.0.0.1", port: 5432 } }, null, 2);
    }
    if (initialMode === 'yaml-to-json') {
      return 'name: my-app\nversion: 1.0.0\nenv: production\ndatabase:\n  host: 127.0.0.1\n  port: 5432';
    }
    if (initialMode === 'json-to-xml') {
      return JSON.stringify({ user: { id: 101, name: "Alice", active: true } }, null, 2);
    }
    if (initialMode === 'xml-to-json') {
      return '<?xml version="1.0"?>\n<user>\n  <id>101</id>\n  <name>Alice</name>\n  <active>true</active>\n</user>';
    }
    if (initialMode === 'json-to-csv') {
      return JSON.stringify([
        { id: 1, name: "Alpha", score: 95 },
        { id: 2, name: "Beta", score: 88 }
      ], null, 2);
    }
    return 'id,name,score\n1,Alpha,95\n2,Beta,88';
  });
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const handleConvert = () => {
    setError('');
    try {
      if (mode === 'json-to-yaml') {
        const parsed = JSON.parse(input);
        setOutput(jsonToYaml(parsed));
      } else if (mode === 'yaml-to-json') {
        const res = yamlToJson(input);
        setOutput(JSON.stringify(res, null, 2));
      } else if (mode === 'json-to-xml') {
        const parsed = JSON.parse(input);
        setOutput(jsonToXml(parsed));
      } else if (mode === 'xml-to-json') {
        const res = xmlToJson(input);
        setOutput(JSON.stringify(res, null, 2));
      } else if (mode === 'json-to-csv') {
        const parsed = JSON.parse(input);
        setOutput(jsonToCsv(parsed));
      } else if (mode === 'csv-to-json') {
        const res = csvToJson(input);
        setOutput(JSON.stringify(res, null, 2));
      }
      showToast("Converted successfully!");
    } catch (err: any) {
      setError(err.message || 'Error converting data');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    showToast("Copied to clipboard!");
  };

  return (
    <div class="w-full bg-white dark:bg-[#0c0d0e] rounded-2xl border border-[#e5e5e5] dark:border-[#22242a] overflow-hidden shadow-xs transition-colors">
      {toastMessage && (
        <div class="fixed bottom-6 right-6 z-50 bg-[#111111] dark:bg-[#f0f0f2] text-white dark:text-[#111111] text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-[#1eaa52]"></span>
          {toastMessage}
        </div>
      )}

      {/* Toolbar */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] dark:bg-[#14161b] border-b border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <select
            value={mode}
            onChange={(e) => setMode((e.target as HTMLSelectElement).value as any)}
            class="px-3 py-1.5 rounded-full border border-[#cacacb] dark:border-[#2b2d35] bg-white dark:bg-[#18191d] text-xs font-semibold text-[#111111] dark:text-[#f0f0f2] outline-none"
          >
            <option value="yaml-to-json">YAML to JSON</option>
            <option value="json-to-yaml">JSON to YAML</option>
            <option value="xml-to-json">XML to JSON</option>
            <option value="json-to-xml">JSON to XML</option>
            <option value="csv-to-json">CSV to JSON</option>
            <option value="json-to-csv">JSON to CSV</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={handleConvert}
            class="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer"
          >
            Convert Now
          </button>
          <button
            onClick={handleCopy}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            Copy Result
          </button>
        </div>
      </div>

      {error && (
        <div class="bg-[#fde8e8] dark:bg-[#451010]/50 text-[#d30005] dark:text-[#fca5a5] px-6 py-2 text-xs font-mono border-b border-[#e5e5e5] dark:border-[#22242a]">
          Conversion Error: {error}
        </div>
      )}

      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a]">
        <div class="p-4 bg-white dark:bg-[#0c0d0e]">
          <div class="text-[11px] font-semibold text-[#707072] dark:text-[#8e8e93] uppercase tracking-wide mb-2">Input Source Data</div>
          <textarea
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            rows={16}
            spellcheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] dark:text-[#f0f0f2] p-3 rounded-xl border border-[#e5e5e5] dark:border-[#22242a] bg-white dark:bg-[#121316] resize-y focus:outline-none focus:border-[#111111] dark:focus:border-white"
          />
        </div>

        <div class="p-4 bg-[#fafafa] dark:bg-[#111215]">
          <div class="text-[11px] font-semibold text-[#707072] dark:text-[#8e8e93] uppercase tracking-wide mb-2">Converted Target Data</div>
          <textarea
            value={output}
            readOnly
            placeholder="Converted output will appear here..."
            rows={16}
            spellcheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] dark:text-[#f0f0f2] p-3 rounded-xl border border-[#e5e5e5] dark:border-[#22242a] bg-white dark:bg-[#121316] resize-y focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

