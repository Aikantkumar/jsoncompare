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
import ResultPre from '../../components/shared/ResultPre';

// Sample Schema and Data
const SAMPLE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "UserAccount",
  type: "object",
  properties: {
    id: {
      type: "string",
      pattern: "^usr_[a-zA-Z0-9]+$"
    },
    username: {
      type: "string",
      minLength: 3,
      maxLength: 20
    },
    email: {
      type: "string",
      format: "email"
    },
    age: {
      type: "integer",
      minimum: 18
    },
    roles: {
      type: "array",
      items: {
        type: "string",
        enum: ["admin", "editor", "viewer"]
      },
      minItems: 1
    },
    isVerified: {
      type: "boolean"
    }
  },
  required: ["id", "username", "email", "age", "roles"]
};

const SAMPLE_DATA = {
  id: "usr_9482a",
  username: "johndoe",
  email: "john.doe@example.com",
  age: 26,
  roles: ["admin", "editor"],
  isVerified: true
};

interface ValidationError {
  path: string;
  message: string;
  keyword: string;
}

const MAX_VIOLATIONS_RENDERED = 500;

/**
 * Lightweight, robust client-side JSON Schema validator
 * Supports core Draft-07 & Draft 2020-12 keywords.
 */
function validateJsonSchema(data: any, schema: any, path = ''): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!schema || typeof schema !== 'object') return errors;

  if (schema.type) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = getJsonType(data);
    const matchesType = expectedTypes.some((t: string) => {
      if (t === 'integer') return typeof data === 'number' && Number.isInteger(data);
      return t === actualType;
    });
    if (!matchesType) {
      errors.push({
        path: path || '/',
        message: `Expected type ${expectedTypes.join(' or ')}, but received ${actualType}`,
        keyword: 'type'
      });
      return errors;
    }
  }

  if (Array.isArray(schema.enum)) {
    const matched = schema.enum.some((val: any) => JSON.stringify(val) === JSON.stringify(data));
    if (!matched) {
      errors.push({
        path: path || '/',
        message: `Value must be one of: [${schema.enum.map((v: any) => JSON.stringify(v)).join(', ')}]`,
        keyword: 'enum'
      });
    }
  }

  if (typeof data === 'string') {
    if (typeof schema.minLength === 'number' && data.length < schema.minLength) {
      errors.push({ path: path || '/', message: `String length (${data.length}) is shorter than minimum allowed (${schema.minLength})`, keyword: 'minLength' });
    }
    if (typeof schema.maxLength === 'number' && data.length > schema.maxLength) {
      errors.push({ path: path || '/', message: `String length (${data.length}) exceeds maximum allowed (${schema.maxLength})`, keyword: 'maxLength' });
    }
    if (schema.pattern) {
      try {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(data)) {
          errors.push({ path: path || '/', message: `String does not match required regex pattern: ${schema.pattern}`, keyword: 'pattern' });
        }
      } catch {}
    }
    if (schema.format === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data)) {
        errors.push({ path: path || '/', message: `String is not a valid email address`, keyword: 'format' });
      }
    }
  }

  if (typeof data === 'number') {
    if (typeof schema.minimum === 'number' && data < schema.minimum) {
      errors.push({ path: path || '/', message: `Value (${data}) is less than minimum (${schema.minimum})`, keyword: 'minimum' });
    }
    if (typeof schema.maximum === 'number' && data > schema.maximum) {
      errors.push({ path: path || '/', message: `Value (${data}) exceeds maximum (${schema.maximum})`, keyword: 'maximum' });
    }
  }

  if (Array.isArray(data)) {
    if (typeof schema.minItems === 'number' && data.length < schema.minItems) {
      errors.push({ path: path || '/', message: `Array has ${data.length} items, minimum required is ${schema.minItems}`, keyword: 'minItems' });
    }
    if (typeof schema.maxItems === 'number' && data.length > schema.maxItems) {
      errors.push({ path: path || '/', message: `Array has ${data.length} items, maximum allowed is ${schema.maxItems}`, keyword: 'maxItems' });
    }
    if (schema.items) {
      data.forEach((item, idx) => {
        const itemErrors = validateJsonSchema(item, schema.items, `${path}/${idx}`);
        errors.push(...itemErrors);
      });
    }
  }

  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    if (Array.isArray(schema.required)) {
      for (const reqKey of schema.required) {
        if (!(reqKey in data)) {
          errors.push({ path: `${path}/${reqKey}`, message: `Missing required property "${reqKey}"`, keyword: 'required' });
        }
      }
    }
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [propKey, propSchema] of Object.entries(schema.properties)) {
        if (propKey in data) {
          const propErrors = validateJsonSchema(data[propKey], propSchema, `${path}/${propKey}`);
          errors.push(...propErrors);
        }
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      const allowedKeys = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(data)) {
        if (!allowedKeys.has(key)) {
          errors.push({ path: `${path}/${key}`, message: `Unrecognized property "${key}" is not allowed by schema`, keyword: 'additionalProperties' });
        }
      }
    }
  }

  return errors;
}

function getJsonType(val: any): string {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  return typeof val;
}

const ACCEPT_SCHEMA = ['.json'];
const ACCEPT_DATA = ['.json', '.txt'];

export default function JsonSchemaValidatorApp() {
  const [schemaDoc, schemaActions] = useTextDoc(JSON.stringify(SAMPLE_SCHEMA, null, 2));
  const [dataDoc, dataActions] = useTextDoc(JSON.stringify(SAMPLE_DATA, null, 2));
  const [busy, setBusy] = useState<boolean>(false);

  const { message: toastMessage, show: showToast } = useToast(3000);

  const debouncedSchema = useDebouncedValue(schemaDoc.text, 250);
  const debouncedData = useDebouncedValue(dataDoc.text, 250);

  const validationResult = useMemoCompute(debouncedSchema, debouncedData);

  const handleValidate = useCallback(async () => {
    setBusy(true);
    await yieldToPaint();
    setBusy(false);
  }, []);

  const handleLoadSample = useCallback(() => {
    schemaActions.setText(JSON.stringify(SAMPLE_SCHEMA, null, 2), { markEdited: false });
    dataActions.setText(JSON.stringify(SAMPLE_DATA, null, 2), { markEdited: false });
    showToast("Loaded sample Schema and Data");
  }, [schemaActions, dataActions, showToast]);

  const handleFormatBoth = useCallback(() => {
    try {
      const s = JSON.parse(schemaDoc.text);
      schemaActions.setText(JSON.stringify(s, null, 2));
    } catch {}
    try {
      const d = JSON.parse(dataDoc.text);
      dataActions.setText(JSON.stringify(d, null, 2));
    } catch {}
    showToast("Formatted both inputs");
  }, [schemaDoc.text, dataDoc.text, schemaActions, dataActions, showToast]);

  const handleCopySchema = useCallback(async () => {
    const ok = await copyText(schemaDoc.text);
    showToast(ok ? "Copied schema to clipboard!" : "Copy failed");
  }, [schemaDoc.text, showToast]);

  const handleCopyData = useCallback(async () => {
    const ok = await copyText(dataDoc.text);
    showToast(ok ? "Copied data to clipboard!" : "Copy failed");
  }, [dataDoc.text, showToast]);

  const handleDownloadSchema = useCallback(() => {
    const name = deriveDownloadName(schemaDoc.filename, ".schema", "schema");
    downloadText(schemaDoc.text, name, 'application/json');
    showToast(`Downloaded ${name}`);
  }, [schemaDoc.text, schemaDoc.filename, showToast]);

  const handleDownloadData = useCallback(() => {
    const name = deriveDownloadName(dataDoc.filename, ".data", "data");
    downloadText(dataDoc.text, name, 'application/json');
    showToast(`Downloaded ${name}`);
  }, [dataDoc.text, dataDoc.filename, showToast]);

  const applySchemaFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    schemaActions.loadFile(result);
    showToast(`Loaded ${result.name} (${formatBytes(result.size)})`);
  }, [schemaActions, showToast]);

  const applyDataFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    dataActions.loadFile(result);
    showToast(`Loaded ${result.name} (${formatBytes(result.size)})`);
  }, [dataActions, showToast]);

  const handleFileError = useCallback((msg: string) => {
    showToast(msg);
  }, [showToast]);

  const handleDropSchema = useCallback((files: FileList) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    readTextFile(arr[0], { accept: ACCEPT_SCHEMA }).then(applySchemaFile).catch(handleFileError);
  }, [applySchemaFile, handleFileError]);

  const handleDropData = useCallback((files: FileList) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    readTextFile(arr[0], { accept: ACCEPT_DATA }).then(applyDataFile).catch(handleFileError);
  }, [applyDataFile, handleFileError]);

  const schemaDrop = useFileDrop(handleDropSchema);
  const dataDrop = useFileDrop(handleDropData);

  const handleClearSchema = useCallback(() => {
    schemaActions.clear();
    showToast("Cleared schema");
  }, [schemaActions, showToast]);

  const handleClearData = useCallback(() => {
    dataActions.clear();
    showToast("Cleared data");
  }, [dataActions, showToast]);

  const { status, message, errors } = validationResult;
  const displayedErrors = errors.slice(0, MAX_VIOLATIONS_RENDERED);
  const hiddenCount = errors.length > MAX_VIOLATIONS_RENDERED ? errors.length - MAX_VIOLATIONS_RENDERED : 0;

  return (
    <div class="w-full bg-white dark:bg-[#0c0d0e] rounded-2xl border border-[#e5e5e5] dark:border-[#22242a] overflow-hidden shadow-xs transition-colors">
      <Toast message={toastMessage} />

      {/* Top Banner with Validation Status */}
      <div
        class={`p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e5e5] dark:border-[#22242a] ${
          status === 'valid'
            ? 'bg-[#e8f7ee] dark:bg-[#06331e]/40 text-[#007d48] dark:text-[#34d399]'
            : status === 'invalid'
            ? 'bg-[#fde8e8] dark:bg-[#451010]/40 text-[#d30005] dark:text-[#fca5a5]'
            : status === 'schema_error' || status === 'data_error'
            ? 'bg-[#fff4e5] dark:bg-[#3d2305]/40 text-[#b45309] dark:text-[#fde047]'
            : 'bg-[#f5f5f5] dark:bg-[#14161b] text-[#707072] dark:text-[#b5b5b8]'
        }`}
      >
        <div class="flex items-center gap-2.5">
          <span class="w-4 h-4 rounded-full flex items-center justify-center font-bold text-xs border border-current">
            {status === 'valid' ? '✓' : status === 'invalid' ? '✕' : '!'}
          </span>
          <span class="text-xs font-semibold">{message}</span>
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={handleLoadSample}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            Load Sample
          </button>
          <button
            onClick={handleFormatBoth}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            Prettify Both
          </button>
        </div>
      </div>

      {schemaDoc.isLarge || dataDoc.isLarge && (
        <div class="px-4 sm:px-6 py-2 bg-[#fff4e5] dark:bg-[#3d2305]/40 border border-[#e5e5e5] dark:border-[#5c3a0a]">
          <div class="flex items-center gap-2 text-[11px] font-medium text-[#b45309] dark:text-[#fde047]">
            <span class="w-1.5 h-1.5 rounded-full bg-[#b45309] dark:bg-[#fde047]"></span>
            Large file mode: live validation disabled. Click "Validate against schema" to check.
          </div>
          <button
            onClick={handleValidate}
            disabled={busy}
            class="ml-auto px-3 py-1 rounded-full text-xs font-semibold border border-[#b45309] dark:border-[#fde047] text-[#b45309] dark:text-[#fde047] hover:bg-[#b45309] dark:hover:bg-[#fde047] hover:text-white dark:hover:text-[#111111] transition-colors cursor-pointer"
          >
            {busy ? 'Validating…' : 'Validate against schema'}
          </button>
        </div>
      )}

      {/* Error Details List if Invalid */}
      {displayedErrors.length > 0 && (
        <div class="bg-[#fef2f2] dark:bg-[#451010]/20 border-b border-[#fca5a5] dark:border-[#7a1f1f] p-4 text-xs font-mono text-[#991b1b] dark:text-[#fca5a5]">
          <div class="font-bold mb-2 uppercase tracking-wide text-[11px]">Violations Breakdown:</div>
          <ul class="space-y-1 max-h-[400px] overflow-y-auto">
            {displayedErrors.map((err, i) => (
              <li key={i} class="flex items-start gap-2">
                <span class="font-bold text-[#b91c1c] dark:text-[#fca5a5]">{err.path}:</span>
                <span>{err.message}</span>
                <span class="text-[10px] bg-[#fee2e2] dark:bg-[#451010]/30 px-1.5 py-0.2 rounded border border-[#fca5a5] dark:border-[#7a1f1f]">[{err.keyword}]</span>
              </li>
            ))}
            {hiddenCount > 0 && (
              <li class="text-[10px] text-[#707072] dark:text-[#8e8e93] italic">
                …and {hiddenCount} more violation{hiddenCount !== 1 ? 's' : ''} (counts remain exact)
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Dual Inputs */}
      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a]">
        <div {...schemaDrop.getDropProps()} class="relative p-4 bg-white dark:bg-[#0c0d0e]">
          {schemaDrop.isDragging && (
            <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
          )}
          <Panel
            title="JSON Schema (Draft-07 / 2020-12)"
            filename={schemaDoc.filename}
            lineCount={schemaDoc.lineCount}
            edited={schemaDoc.edited}
            accept={ACCEPT_SCHEMA}
            onFile={applySchemaFile}
            onError={handleFileError}
            fileLabel="Choose file"
            fileAriaLabel="Choose file for JSON Schema"
            onClear={handleClearSchema}
            onCopy={handleCopySchema}
            onDownload={handleDownloadSchema}
            fullscreenable
          >
            <EditorTextarea
              value={schemaDoc.text}
              onInput={(v) => schemaActions.setText(v)}
              placeholder="Paste JSON Schema..."
              ariaLabel="Schema editor"
            />
          </Panel>
        </div>

        <div {...dataDrop.getDropProps()} class="relative p-4 bg-white dark:bg-[#0c0d0e]">
          {dataDrop.isDragging && (
            <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
          )}
          <Panel
            title="Target JSON Data"
            filename={dataDoc.filename}
            lineCount={dataDoc.lineCount}
            edited={dataDoc.edited}
            accept={ACCEPT_DATA}
            onFile={applyDataFile}
            onError={handleFileError}
            fileLabel="Choose file"
            fileAriaLabel="Choose file for JSON Data"
            onClear={handleClearData}
            onCopy={handleCopyData}
            onDownload={handleDownloadData}
            fullscreenable
          >
            <EditorTextarea
              value={dataDoc.text}
              onInput={(v) => dataActions.setText(v)}
              placeholder="Paste JSON data..."
              ariaLabel="Data editor"
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

function useMemoCompute(schemaText: string, dataText: string) {
  const s = safeParseJson(schemaText, false);
  const d = safeParseJson(dataText, false);

  if (s.error) {
    return { status: 'schema_error' as const, message: `Schema Syntax Error: ${s.error}`, errors: [] as ValidationError[] };
  }
  if (d.error) {
    return { status: 'data_error' as const, message: `Data Syntax Error: ${d.error}`, errors: [] as ValidationError[] };
  }
  if (!s.data || !d.data) {
    return { status: 'empty' as const, message: 'Enter both Schema and Data to validate', errors: [] as ValidationError[] };
  }

  const errors = validateJsonSchema(d.data, s.data);
  if (errors.length === 0) {
    return { status: 'valid' as const, message: 'JSON Data complies with the provided schema!', errors: [] as ValidationError[] };
  }
  return {
    status: 'invalid' as const,
    message: `Validation failed: found ${errors.length} schema violation${errors.length > 1 ? 's' : ''}`,
    errors
  };
}
