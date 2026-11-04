/**
 * useFileDrop.ts - Drag-and-drop hook for a panel.
 * - depth counter on dragenter/dragleave (no flicker)
 * - preventDefault on dragover and drop (prevents browser navigation)
 * - dashed highlight while dragging
 * - ignores non-file drags
 */
import { useRef, useState, useCallback } from 'preact/hooks';

export interface FileDropReturn {
  isDragging: boolean;
  onDragEnter: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  getDropProps: () => Record<string, any>;
}

export function useFileDrop(
  onFiles: (files: FileList) => void,
  { multiple = false }: { multiple?: boolean } = {}
): FileDropReturn {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const depthRef = useRef<number>(0);

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    if (dt && dt.types && dt.types.includes('Files')) {
      depthRef.current += 1;
      setIsDragging(true);
    }
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current <= 0) {
      setIsDragging(false);
    }
  }, []);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    depthRef.current = 0;
    setIsDragging(false);
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      onFiles((multiple ? dt.files : Array.from(dt.files).slice(0, 1)) as FileList);
    }
  }, [onFiles, multiple]);

  const getDropProps = useCallback(() => ({
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
  }), [onDragEnter, onDragLeave, onDragOver, onDrop]);

  return { isDragging, onDragEnter, onDragLeave, onDragOver, onDrop, getDropProps };
}
