/**
 * formatConverters.ts - Client-side converters for YAML, XML, CSV and JSON
 */

// Simple, robust YAML to JSON & JSON to YAML serializer/deserializer
export function jsonToYaml(obj: any, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (obj === null || obj === undefined) return `${pad}null\n`;
  if (typeof obj === 'string') {
    if (obj.includes('\n') || /[:#{}[\]]/.test(obj)) {
      return `${pad}"${obj.replace(/"/g, '\\"')}"\n`;
    }
    return `${pad}${obj}\n`;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return `${pad}${obj}\n`;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${pad}[]\n`;
    let out = '';
    for (const item of obj) {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const itemYaml = jsonToYaml(item, indent + 1).trimStart();
        out += `${pad}- ${itemYaml}`;
      } else {
        out += `${pad}- ${jsonToYaml(item, 0).trimStart()}`;
      }
    }
    return out;
  }

  if (typeof obj === 'object') {
    let out = '';
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
        out += `${pad}${key}:\n${jsonToYaml(value, indent + 1)}`;
      } else {
        const valStr = jsonToYaml(value, 0).trimStart();
        out += `${pad}${key}: ${valStr}`;
      }
    }
    return out;
  }

  return `${pad}${String(obj)}\n`;
}

// Basic recursive YAML parser for standard key-value structures and lists
export function yamlToJson(yamlStr: string): any {
  const lines = yamlStr.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  
  function parseBlock(startIndex: number, baseIndent: number): { result: any; nextIndex: number } {
    let isArray = false;
    let isObject = false;
    let arrResult: any[] = [];
    let objResult: Record<string, any> = {};

    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];
      const indent = line.search(/\S/);
      if (indent < baseIndent) break;

      const trimmed = line.trim();

      if (trimmed.startsWith('- ')) {
        isArray = true;
        const valPart = trimmed.slice(2).trim();
        if (valPart.includes(': ')) {
          // Object item in array
          const [subKey, ...rest] = valPart.split(': ');
          const subVal = parseScalar(rest.join(': '));
          arrResult.push({ [subKey]: subVal });
        } else {
          arrResult.push(parseScalar(valPart));
        }
        i++;
      } else if (trimmed.includes(':')) {
        isObject = true;
        const [k, ...rest] = trimmed.split(':');
        const key = k.trim();
        const valPart = rest.join(':').trim();

        if (!valPart) {
          // Nested block
          const next = parseBlock(i + 1, indent + 1);
          objResult[key] = next.result;
          i = next.nextIndex;
        } else {
          objResult[key] = parseScalar(valPart);
          i++;
        }
      } else {
        i++;
      }
    }

    return {
      result: isArray ? arrResult : objResult,
      nextIndex: i
    };
  }

  function parseScalar(val: string): any {
    const v = val.trim();
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null' || v === '~') return null;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1);
    }
    return v;
  }

  return parseBlock(0, 0).result;
}

// XML to JSON & JSON to XML converter
export function jsonToXml(obj: any, rootTag = 'root'): string {
  function toXml(val: any, tag: string): string {
    if (val === null || val === undefined) return `<${tag}/>`;
    if (typeof val !== 'object') {
      return `<${tag}>${escapeXml(String(val))}</${tag}>`;
    }
    if (Array.isArray(val)) {
      return val.map(item => toXml(item, tag)).join('\n');
    }
    const children = Object.entries(val)
      .map(([k, v]) => toXml(v, k))
      .join('\n');
    return `<${tag}>\n${children}\n</${tag}>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${toXml(obj, rootTag)}`;
}

export function xmlToJson(xmlStr: string): any {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');

  function nodeToObj(node: Node): any {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue?.trim() || '';
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const obj: Record<string, any> = {};

      // Attributes
      if (element.attributes.length > 0) {
        obj['@attributes'] = {};
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          obj['@attributes'][attr.name] = attr.value;
        }
      }

      // Children
      const childNodes = Array.from(element.childNodes).filter(
        c => c.nodeType === Node.ELEMENT_NODE || (c.nodeType === Node.TEXT_NODE && c.nodeValue?.trim())
      );

      if (childNodes.length === 0) {
        return element.textContent || '';
      }

      if (childNodes.length === 1 && childNodes[0].nodeType === Node.TEXT_NODE) {
        return childNodes[0].nodeValue?.trim() || '';
      }

      for (const child of childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as Element;
          const childVal = nodeToObj(el);
          if (obj[el.nodeName]) {
            if (!Array.isArray(obj[el.nodeName])) {
              obj[el.nodeName] = [obj[el.nodeName]];
            }
            obj[el.nodeName].push(childVal);
          } else {
            obj[el.nodeName] = childVal;
          }
        }
      }

      return obj;
    }

    return null;
  }

  return { [xmlDoc.documentElement.nodeName]: nodeToObj(xmlDoc.documentElement) };
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// CSV to JSON & JSON to CSV
export function jsonToCsv(data: any): string {
  const array = Array.isArray(data) ? data : [data];
  if (array.length === 0) return '';

  const headers = Array.from(
    new Set(array.flatMap(item => (typeof item === 'object' && item !== null ? Object.keys(item) : ['value'])))
  );

  const csvRows = [headers.join(',')];

  for (const item of array) {
    const row = headers.map(header => {
      const val = typeof item === 'object' && item !== null ? item[header] : item;
      const str = val === undefined || val === null ? '' : String(val);
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(row.join(','));
  }

  return csvRows.join('\n');
}

export function csvToJson(csvStr: string): any[] {
  const lines = csvStr.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const result: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowValues = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, any> = {};
    headers.forEach((header, index) => {
      const val = rowValues[index];
      if (/^-?\d+(\.\d+)?$/.test(val)) {
        obj[header] = Number(val);
      } else if (val === 'true') {
        obj[header] = true;
      } else if (val === 'false') {
        obj[header] = false;
      } else {
        obj[header] = val;
      }
    });
    result.push(obj);
  }

  return result;
}

