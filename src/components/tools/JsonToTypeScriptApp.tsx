import { useState, useMemo } from 'preact/hooks';
import { safeParseJson } from '../../utils/jsonDiff';

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

export default function JsonToTypeScriptApp() {
  const [input, setInput] = useState<string>(
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
  const [toastMessage, setToastMessage] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const outputTs = useMemo(() => {
    const res = safeParseJson(input);
    if (res.error) {
      return `// Error parsing JSON:\n// ${res.error}`;
    }
    if (res.data === null || res.data === undefined) {
      return '// Enter valid JSON to generate TypeScript interfaces';
    }
    return jsonToTypeScript(res.data, rootInterfaceName || 'Root');
  }, [input, rootInterfaceName]);

  const handleCopy = () => {
    navigator.clipboard.writeText(outputTs);
    showToast("TypeScript types copied to clipboard!");
  };

  return (
    <div class="w-full bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden shadow-xs">
      {toastMessage && (
        <div class="fixed bottom-6 right-6 z-50 bg-[#111111] text-white text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-[#1eaa52]"></span>
          {toastMessage}
        </div>
      )}

      {/* Toolbar */}
      <div class="p-3 sm:px-6 bg-[#f5f5f5] border-b border-[#e5e5e5] flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-xs">
          <span class="font-medium text-[#111111]">Root Interface:</span>
          <input
            type="text"
            value={rootInterfaceName}
            onInput={(e) => setRootInterfaceName((e.target as HTMLInputElement).value)}
            class="px-2.5 py-1 rounded-full border border-[#cacacb] bg-white font-mono text-xs outline-none"
          />
        </div>

        <button
          onClick={handleCopy}
          class="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] transition-colors cursor-pointer"
        >
          Copy TypeScript
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5]">
        <div class="p-4">
          <div class="text-[11px] font-semibold text-[#707072] uppercase tracking-wide mb-2">Input JSON Payload</div>
          <textarea
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            rows={16}
            spellCheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] p-3 rounded-xl border border-[#e5e5e5] bg-white resize-y focus:outline-none focus:border-[#111111]"
          />
        </div>

        <div class="p-4 bg-[#fafafa]">
          <div class="text-[11px] font-semibold text-[#707072] uppercase tracking-wide mb-2">Generated TypeScript Types</div>
          <textarea
            value={outputTs}
            readOnly
            rows={16}
            spellCheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] p-3 rounded-xl border border-[#e5e5e5] bg-white resize-y focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

