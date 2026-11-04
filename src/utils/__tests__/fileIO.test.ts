import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  readTextFile,
  MAX_FILE_BYTES,
  LARGE_FILE_THRESHOLD_BYTES,
  type FileReadResult,
} from '../fileIO.ts';

interface FileLike {
  name: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function fileFromText(name: string, text: string): FileLike {
  const bytes = new TextEncoder().encode(text);
  return { name, size: bytes.length, arrayBuffer: () => Promise.resolve(bytes.buffer) };
}

function fileFromBytes(name: string, bytes: Uint8Array): FileLike {
  return { name, size: bytes.length, arrayBuffer: () => Promise.resolve(bytes.buffer.slice() as ArrayBuffer) };
}

async function readOk(file: FileLike, accept: string[] = ['.json', '.txt']): Promise<FileReadResult> {
  return readTextFile(file, { accept });
}

describe('readTextFile (fileIO)', () => {
  it('reads a valid JSON file and reports size + large flag', async () => {
    const text = JSON.stringify({ hello: 'world' });
    const res = await readOk(fileFromText('data.json', text));
    assert.strictEqual(res.name, 'data.json');
    assert.strictEqual(res.size, new TextEncoder().encode(text).length);
    assert.strictEqual(res.text, text);
    assert.strictEqual(res.large, false);
  });

  it('reads .TXT with uppercase extension (case-insensitive)', async () => {
    const res = await readOk(fileFromText('notes.TXT', 'plain text'));
    assert.strictEqual(res.text, 'plain text');
  });

  it('treats files over 1 MB as large', async () => {
    const big = 'x'.repeat(LARGE_FILE_THRESHOLD_BYTES + 1);
    const res = await readOk(fileFromText('big.txt', big));
    assert.strictEqual(res.large, true);
  });

  it('rejects empty files', async () => {
    await assert.rejects(
      readOk(fileFromText('empty.json', '')),
      /The file is empty/
    );
  });

  it('rejects files over the max byte limit', async () => {
    const tooBig = 'x'.repeat(MAX_FILE_BYTES + 1);
    await assert.rejects(
      readOk(fileFromText('huge.json', tooBig)),
      /File is too large/
    );
  });

  it('rejects unsupported extensions', async () => {
    await assert.rejects(
      readOk(fileFromText('readme.md', '# hi'), ['.json']),
      /Unsupported file type/
    );
  });

  it('does not parse JSON, so invalid JSON still loads', async () => {
    const res = await readOk(fileFromText('broken.json', '{ not valid json'));
    assert.strictEqual(res.text, '{ not valid json');
  });

  it('strips a UTF-8 BOM', async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"ok":true}')]);
    const res = await readOk(fileFromBytes('bom.json', bom));
    assert.strictEqual(res.text, '{"ok":true}');
  });

  it('strips a UTF-16LE BOM', async () => {
    const text = '{"utf16":true}';
    const encoded = new TextEncoder().encode(text);
    const u16 = new Uint16Array(encoded.length);
    for (let i = 0; i < encoded.length; i++) u16[i] = encoded[i];
    const bytes = new Uint8Array(2 + u16.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let i = 0; i < u16.length; i++) {
      bytes[2 + i * 2] = u16[i] & 0xff;
      bytes[2 + i * 2 + 1] = u16[i] >> 8;
    }
    const res = await readOk(fileFromBytes('u16.json', bytes));
    assert.strictEqual(res.text, text);
  });

  it('rejects binary files containing NUL bytes', async () => {
    const bytes = new Uint8Array([0x7b, 0x00, 0x7d]);
    await assert.rejects(
      readOk(fileFromBytes('bin.json', bytes)),
      /binary|NUL/
    );
  });

  it('resolves relative extension without a leading dot in accept', async () => {
    const res = await readOk(fileFromText('data.json', '{}'), ['json']);
    assert.strictEqual(res.text, '{}');
  });
});
