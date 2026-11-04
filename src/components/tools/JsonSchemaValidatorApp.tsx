import { useState, useMemo } from 'preact/hooks';
import { safeParseJson } from '../../utils/jsonDiff';

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

/**
 * Lightweight, robust client-side JSON Schema validator
 * Supports core Draft-07 & Draft 2020-12 keywords:
 * type, properties, required, items, enum, minLength, maxLength,
 * minimum, maximum, pattern, additionalProperties, minItems, maxItems
 */
function validateJsonSchema(data: any, schema: any, path = ''): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!schema || typeof schema !== 'object') return errors;

  // 1. Type validation
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
      return errors; // Stop deeper checking if type is completely mismatched
    }
  }

  // 2. Enum check
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

  // 3. String constraints
  if (typeof data === 'string') {
    if (typeof schema.minLength === 'number' && data.length < schema.minLength) {
      errors.push({
        path: path || '/',
        message: `String length (${data.length}) is shorter than minimum allowed (${schema.minLength})`,
        keyword: 'minLength'
      });
    }
    if (typeof schema.maxLength === 'number' && data.length > schema.maxLength) {
      errors.push({
        path: path || '/',
        message: `String length (${data.length}) exceeds maximum allowed (${schema.maxLength})`,
        keyword: 'maxLength'
      });
    }
    if (schema.pattern) {
      try {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(data)) {
          errors.push({
            path: path || '/',
            message: `String does not match required regex pattern: ${schema.pattern}`,
            keyword: 'pattern'
          });
        }
      } catch {}
    }
    if (schema.format === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data)) {
        errors.push({
          path: path || '/',
          message: `String is not a valid email address`,
          keyword: 'format'
        });
      }
    }
  }

  // 4. Number constraints
  if (typeof data === 'number') {
    if (typeof schema.minimum === 'number' && data < schema.minimum) {
      errors.push({
        path: path || '/',
        message: `Value (${data}) is less than minimum (${schema.minimum})`,
        keyword: 'minimum'
      });
    }
    if (typeof schema.maximum === 'number' && data > schema.maximum) {
      errors.push({
        path: path || '/',
        message: `Value (${data}) exceeds maximum (${schema.maximum})`,
        keyword: 'maximum'
      });
    }
  }

  // 5. Array constraints
  if (Array.isArray(data)) {
    if (typeof schema.minItems === 'number' && data.length < schema.minItems) {
      errors.push({
        path: path || '/',
        message: `Array has ${data.length} items, minimum required is ${schema.minItems}`,
        keyword: 'minItems'
      });
    }
    if (typeof schema.maxItems === 'number' && data.length > schema.maxItems) {
      errors.push({
        path: path || '/',
        message: `Array has ${data.length} items, maximum allowed is ${schema.maxItems}`,
        keyword: 'maxItems'
      });
    }
    if (schema.items) {
      data.forEach((item, idx) => {
        const itemErrors = validateJsonSchema(item, schema.items, `${path}/${idx}`);
        errors.push(...itemErrors);
      });
    }
  }

  // 6. Object constraints & properties
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    // Required properties
    if (Array.isArray(schema.required)) {
      for (const reqKey of schema.required) {
        if (!(reqKey in data)) {
          errors.push({
            path: `${path}/${reqKey}`,
            message: `Missing required property "${reqKey}"`,
            keyword: 'required'
          });
        }
      }
    }

    // Properties validation
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [propKey, propSchema] of Object.entries(schema.properties)) {
        if (propKey in data) {
          const propErrors = validateJsonSchema(data[propKey], propSchema, `${path}/${propKey}`);
          errors.push(...propErrors);
        }
      }
    }

    // AdditionalProperties check
    if (schema.additionalProperties === false && schema.properties) {
      const allowedKeys = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(data)) {
        if (!allowedKeys.has(key)) {
          errors.push({
            path: `${path}/${key}`,
            message: `Unrecognized property "${key}" is not allowed by schema`,
            keyword: 'additionalProperties'
          });
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

export default function JsonSchemaValidatorApp() {
  const [schemaInput, setSchemaInput] = useState<string>(JSON.stringify(SAMPLE_SCHEMA, null, 2));
  const [dataInput, setDataInput] = useState<string>(JSON.stringify(SAMPLE_DATA, null, 2));
  const [toastMessage, setToastMessage] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const validationResult = useMemo(() => {
    const s = safeParseJson(schemaInput, false);
    const d = safeParseJson(dataInput, false);

    if (s.error) {
      return { status: 'schema_error', message: `Schema Syntax Error: ${s.error}`, errors: [] };
    }
    if (d.error) {
      return { status: 'data_error', message: `Data Syntax Error: ${d.error}`, errors: [] };
    }
    if (!s.data || !d.data) {
      return { status: 'empty', message: 'Enter both Schema and Data to validate', errors: [] };
    }

    const errors = validateJsonSchema(d.data, s.data);
    if (errors.length === 0) {
      return { status: 'valid', message: 'JSON Data complies with the provided schema!', errors: [] };
    }
    return {
      status: 'invalid',
      message: `Validation failed: found ${errors.length} schema violation${errors.length > 1 ? 's' : ''}`,
      errors
    };
  }, [schemaInput, dataInput]);

  const handleLoadSample = () => {
    setSchemaInput(JSON.stringify(SAMPLE_SCHEMA, null, 2));
    setDataInput(JSON.stringify(SAMPLE_DATA, null, 2));
    showToast("Loaded sample Schema and Data");
  };

  const handleFormatBoth = () => {
    try {
      const s = JSON.parse(schemaInput);
      setSchemaInput(JSON.stringify(s, null, 2));
    } catch {}
    try {
      const d = JSON.parse(dataInput);
      setDataInput(JSON.stringify(d, null, 2));
    } catch {}
    showToast("Formatted both inputs");
  };

  return (
    <div class="w-full bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden shadow-xs">
      {toastMessage && (
        <div class="fixed bottom-6 right-6 z-50 bg-[#111111] text-white text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-[#1eaa52]"></span>
          {toastMessage}
        </div>
      )}

      {/* Top Banner with Validation Status */}
      <div
        class={`p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e5e5] ${
          validationResult.status === 'valid'
            ? 'bg-[#e8f7ee] text-[#007d48]'
            : validationResult.status === 'invalid'
            ? 'bg-[#fde8e8] text-[#d30005]'
            : validationResult.status === 'schema_error' || validationResult.status === 'data_error'
            ? 'bg-[#fff4e5] text-[#b45309]'
            : 'bg-[#f5f5f5] text-[#707072]'
        }`}
      >
        <div class="flex items-center gap-2.5">
          <span class="w-4 h-4 rounded-full flex items-center justify-center font-bold text-xs border border-current">
            {validationResult.status === 'valid' ? '✓' : validationResult.status === 'invalid' ? '✕' : '!'}
          </span>
          <span class="text-xs font-semibold">
            {validationResult.message}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={handleLoadSample}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white border border-[#cacacb] text-[#111111] hover:bg-[#111111] hover:text-white transition-colors cursor-pointer"
          >
            Load Sample
          </button>
          <button
            onClick={handleFormatBoth}
            class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white border border-[#cacacb] text-[#111111] hover:bg-[#111111] hover:text-white transition-colors cursor-pointer"
          >
            Prettify Both
          </button>
        </div>
      </div>

      {/* Error Details List if Invalid */}
      {validationResult.errors.length > 0 && (
        <div class="bg-[#fef2f2] border-b border-[#fca5a5] p-4 text-xs font-mono text-[#991b1b]">
          <div class="font-bold mb-2 uppercase tracking-wide text-[11px]">Violations Breakdown:</div>
          <ul class="space-y-1">
            {validationResult.errors.map((err, i) => (
              <li key={i} class="flex items-start gap-2">
                <span class="font-bold text-[#b91c1c]">{err.path}:</span>
                <span>{err.message}</span>
                <span class="text-[10px] bg-[#fee2e2] px-1.5 py-0.2 rounded border border-[#fca5a5]">[{err.keyword}]</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dual Inputs */}
      <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5]">
        <div class="p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] font-semibold text-[#707072] uppercase tracking-wide">
              JSON Schema (Draft-07 / 2020-12)
            </span>
            <span class="text-[11px] font-mono text-[#707072]">
              {schemaInput.split('\n').length} lines
            </span>
          </div>
          <textarea
            value={schemaInput}
            onInput={(e) => setSchemaInput((e.target as HTMLTextAreaElement).value)}
            rows={18}
            spellcheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] p-3 rounded-xl border border-[#e5e5e5] bg-white resize-y focus:outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111]"
          />
        </div>

        <div class="p-4 bg-[#fafafa]">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] font-semibold text-[#707072] uppercase tracking-wide">
              Target JSON Data
            </span>
            <span class="text-[11px] font-mono text-[#707072]">
              {dataInput.split('\n').length} lines
            </span>
          </div>
          <textarea
            value={dataInput}
            onInput={(e) => setDataInput((e.target as HTMLTextAreaElement).value)}
            rows={18}
            spellcheck={false}
            class="w-full font-mono text-xs leading-relaxed text-[#111111] p-3 rounded-xl border border-[#e5e5e5] bg-white resize-y focus:outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111]"
          />
        </div>
      </div>
    </div>
  );
}

