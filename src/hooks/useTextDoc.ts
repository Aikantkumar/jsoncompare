/**
 * useTextDoc.ts - Single source of truth for one editor's document state.
 * Holds { text, filename, edited, lineCount (memoized), isLarge } and
 * exposes loadFile(result), setText(next, opts), clear(), setFilename(),
 * setEdited(flag).
 *
 * With { persistKey } the doc is persisted to sessionStorage under the
 * 'jsoncompare:doc:' prefix (see src/utils/docStorage.ts): text, filename
 * and the edited flag. Storage survives full-page navigations and reloads
 * within the tab and is cleared when the tab closes.
 *
 * The server-rendered sample text is used for the initial render so client
 * markup matches; stored values are restored in a useEffect after mount.
 * null from readDoc means "nothing stored" (show the sample); a stored
 * empty doc is restored as-is, so a cleared editor stays empty.
 * Writes are debounced (~300 ms) and flushed on 'pagehide'. Every storage
 * call is wrapped in try/catch; quota errors are swallowed so persistence
 * never breaks typing or uploading.
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'preact/hooks';
import { isLargeText } from '../utils/fileIO';
import { readDoc, writeDoc, type StoredDoc } from '../utils/docStorage';

const PERSIST_DEBOUNCE_MS = 300;

export interface TextDoc {
  text: string;
  filename: string | null;
  edited: boolean;
  lineCount: number;
  isLarge: boolean;
}

export interface TextDocActions {
  loadFile: (result: { name: string; size: number; text: string; large: boolean }) => void;
  setText: (next: string, opts?: { markEdited?: boolean }) => void;
  clear: () => void;
  setFilename: (name: string | null) => void;
  setEdited: (flag: boolean) => void;
}

export function useTextDoc(
  initialText = '',
  opts?: { persistKey?: string },
): [TextDoc, TextDocActions] {
  const persistKey = opts?.persistKey;
  const [text, setTextState] = useState<string>(initialText);
  const [filename, setFilenameState] = useState<string | null>(null);
  const [edited, setEditedState] = useState<boolean>(false);

  const lineCount = useMemo(() => (text ? text.split('\n').length : 0), [text]);
  const isLarge = isLargeText(text);

  const stateRef = useRef<StoredDoc>({ text, filename, edited });
  // Keep the ref in sync with the latest committed state so pagehide flushes
  // always write the current values.
  useEffect(() => {
    stateRef.current = { text, filename, edited };
  });

  // Hydration: restore after mount so server/client markup match. null means
  // "nothing stored"; a stored empty doc restores as empty, not the sample.
  useEffect(() => {
    if (!persistKey) return;
    const stored = readDoc(persistKey);
    if (stored !== null) {
      setTextState(stored.text);
      setFilenameState(stored.filename);
      setEditedState(stored.edited);
    }
  }, [persistKey]);

  const flush = useCallback(() => {
    if (!persistKey) return;
    try {
      writeDoc(persistKey, stateRef.current);
    } catch {
      // writeDoc already swallows quota errors; stay defensive.
    }
  }, [persistKey]);

  // Debounced persist on every change; flushed on pagehide. Skip the very
  // first render so the initial sample is not written over a restored value.
  const didMount = useRef(false);
  useEffect(() => {
    if (!persistKey) return;
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, PERSIST_DEBOUNCE_MS);
    };
    schedule();
    const onPagehide = () => {
      if (timer) clearTimeout(timer);
      flush();
    };
    window.addEventListener('pagehide', onPagehide);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('pagehide', onPagehide);
    };
  }, [persistKey, text, filename, edited, flush]);

  const loadFile = useCallback(
    (result: { name: string; size: number; text: string; large: boolean }) => {
      setTextState(result.text);
      setFilenameState(result.name);
      setEditedState(false);
    },
    [],
  );

  const setText = useCallback(
    (next: string, opts: { markEdited?: boolean } = {}) => {
      setTextState(next);
      if (opts.markEdited !== false) setEditedState(true);
    },
    [],
  );

  const clear = useCallback(() => {
    setTextState('');
    setFilenameState(null);
    setEditedState(false);
  }, []);

  const setFilename = useCallback((name: string | null) => {
    setFilenameState(name);
  }, []);

  const setEdited = useCallback((flag: boolean) => {
    setEditedState(flag);
  }, []);

  const doc: TextDoc = { text, filename, edited, lineCount, isLarge };

  return [doc, { loadFile, setText, clear, setFilename, setEdited }];
}
