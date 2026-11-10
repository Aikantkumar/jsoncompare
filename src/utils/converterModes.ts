/**
 * converterModes.ts - Pure converter mode configuration.
 * Accept lists are extension-validated; MIME is never trusted.
 */

export type ConverterMode =
  | 'yaml-to-json'
  | 'json-to-yaml'
  | 'xml-to-json'
  | 'json-to-xml'
  | 'csv-to-json'
  | 'json-to-csv';

export const MODE_LABELS: Record<ConverterMode, string> = {
  'yaml-to-json': 'YAML to JSON',
  'json-to-yaml': 'JSON to YAML',
  'xml-to-json': 'XML to JSON',
  'json-to-xml': 'JSON to XML',
  'csv-to-json': 'CSV to JSON',
  'json-to-csv': 'JSON to CSV',
};

export const MODE_ACCEPT: Record<ConverterMode, string[]> = {
  'yaml-to-json': ['.yaml', '.yml', '.txt'],
  'json-to-yaml': ['.json', '.txt'],
  'xml-to-json': ['.xml', '.txt'],
  'json-to-xml': ['.json', '.txt'],
  'csv-to-json': ['.csv', '.tsv', '.txt'],
  'json-to-csv': ['.json', '.txt'],
};

export const MODE_DOWNLOAD: Record<ConverterMode, { ext: string; mime: string }> = {
  'yaml-to-json': { ext: '.json', mime: 'application/json' },
  'json-to-yaml': { ext: '.yaml', mime: 'application/x-yaml' },
  'xml-to-json': { ext: '.json', mime: 'application/json' },
  'json-to-xml': { ext: '.xml', mime: 'application/xml' },
  'csv-to-json': { ext: '.json', mime: 'application/json' },
  'json-to-csv': { ext: '.csv', mime: 'text/csv' },
};

export function acceptForMode(mode: ConverterMode): string[] {
  return MODE_ACCEPT[mode];
}

export function downloadExtForMode(mode: ConverterMode): string {
  return MODE_DOWNLOAD[mode].ext;
}

export function downloadMimeForMode(mode: ConverterMode): string {
  return MODE_DOWNLOAD[mode].mime;
}
