/**
 * useTextDoc.ts - Single source of truth for one editor's document state.
 * Holds { text, filename, edited, lineCount (memoized), isLarge } and
 * exposes loadFile(result), setText(next, opts), clear().
 */
import { useState, useCallback, useMemo } from 'preact/hooks';
import { isLargeText } from '../utils/fileIO';

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
}

export function useTextDoc(initialText = ''): [TextDoc, TextDocActions] {
  const [text, setTextState] = useState<string>(initialText);
  const [filename, setFilenameState] = useState<string | null>(null);
  const [edited, setEditedState] = useState<boolean>(false);

  const lineCount = useMemo(() => (text ? text.split('\n').length : 0), [text]);
  const isLarge = isLargeText(text);

  const loadFile = useCallback(
    (result: { name: string; size: number; text: string; large: boolean }) => {
      setTextState(result.text);
      setFilenameState(result.name);
      setEditedState(false);
    },
    []
  );

  const setText = useCallback(
    (next: string, opts: { markEdited?: boolean } = {}) => {
      setTextState(next);
      if (opts.markEdited !== false) setEditedState(true);
    },
    []
  );

  const clear = useCallback(() => {
    setTextState('');
    setFilenameState(null);
    setEditedState(false);
  }, []);

  const setFilename = useCallback((name: string | null) => {
    setFilenameState(name);
  }, []);

  const doc: TextDoc = { text, filename, edited, lineCount, isLarge };

  return [doc, { loadFile, setText, clear, setFilename }];
}
