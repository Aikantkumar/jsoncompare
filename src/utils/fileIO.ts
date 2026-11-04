/**
 * fileIO.ts - Local (browser-only) file reading utilities.
 * Files are read only with the browser File API and never sent anywhere.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const LARGE_FILE_THRESHOLD_BYTES = 1024 * 1024; // 1 MB -> treat as "large"

export interface FileReadResult {
  name: string;
  size: number;
  text: string;
  large: boolean;
}

interface FileLike {
  name: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

function normalizeExt(ext: string): string {
  const e = ext.toLowerCase();
  return e.startsWith('.') ? e : `.${e}`;
}

function detectEncoding(bytes: Uint8Array): { encoding: string; bomLength: number } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8', bomLength: 3 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', bomLength: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'utf-16be', bomLength: 2 };
  }
  return { encoding: 'utf-8', bomLength: 0 };
}

/**
 * Read a file as text. Validates by FILE EXTENSION (not MIME, which browsers
 * report as "" for .yaml/.csv). Rejects empty files, files over MAX_FILE_BYTES,
 * and binary files containing NUL bytes. Detects and strips UTF-8/UTF-16 BOMs
 * so JSON.parse does not fail at position 0.
 *
 * Does NOT parse or validate JSON - invalid JSON still loads so Smart Fix /
 * Validator can work on it.
 */
export async function readTextFile(
  file: File | FileLike,
  { accept }: { accept: string[] }
): Promise<FileReadResult> {
  const name = file.name;
  const dotIdx = name.lastIndexOf('.');
  const ext = dotIdx === -1 ? '' : name.slice(dotIdx);
  const normalizedAccept = accept.map(normalizeExt);
  const normalizedExt = normalizeExt(ext);

  if (!normalizedAccept.includes(normalizedExt)) {
    throw new Error(
      `Unsupported file type "${ext || '(none)'}". Accepted: ${normalizedAccept.join(', ')}`
    );
  }

  if (file.size === 0) {
    throw new Error('The file is empty. Please select a non-empty file.');
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `File is too large (${formatBytes(file.size)}). Maximum allowed is ${formatBytes(MAX_FILE_BYTES)}.`
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { encoding, bomLength } = detectEncoding(bytes);
  let text = new TextDecoder(encoding).decode(bytes.slice(bomLength));

  // Strip any leading BOM character that survived decoding.
  if (text.startsWith('\uFEFF')) {
    text = text.slice(1);
  }

  if (text.includes('\0')) {
    throw new Error(
      'The file appears to be binary (contains NUL bytes) and cannot be read as text.'
    );
  }

  return {
    name,
    size: file.size,
    text,
    large: file.size > LARGE_FILE_THRESHOLD_BYTES,
  };
}
