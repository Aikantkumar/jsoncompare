import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { useT } from './LangContext';

export interface ResizeHandleProps {
  onDrag: (clientY: number, deltaY: number, e: PointerEvent) => void;
  onReset: () => void;
  onKeyAdjust?: (step: number) => void;
  onGoToMin?: () => void;
  onGoToMax?: () => void;
  valueNow?: number;
  valueMin?: number;
  valueMax?: number;
  label?: string;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export default function ResizeHandle({
  onDrag,
  onReset,
  onKeyAdjust,
  onGoToMin,
  onGoToMax,
  valueNow,
  valueMin = 15,
  valueMax = 85,
  label,
  onDragStart,
  onDragEnd,
}: ResizeHandleProps) {
  const t = useT();
  const resolvedLabel = label ?? t('a11y.resizeHandle');
  const [isDragging, setIsDragging] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);
  const lastYRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  const cleanupDrag = useCallback(() => {
    setIsDragging(false);
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    onDragEnd?.();
  }, [onDragEnd]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (e.button !== 0) return; // only primary mouse button
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore if pointer capture fails
    }
    setIsDragging(true);
    lastYRef.current = e.clientY;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    onDragStart?.();
  }, [onDragStart]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDragging) return;
    const clientY = e.clientY;
    const deltaY = clientY - lastYRef.current;
    lastYRef.current = clientY;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      onDrag(clientY, deltaY, e);
    });
  }, [isDragging, onDrag]);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!isDragging) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    cleanupDrag();
  }, [isDragging, cleanupDrag]);

  // Window-level safety listeners while dragging
  useEffect(() => {
    if (!isDragging) return;
    const onWindowPointerMove = (e: PointerEvent) => {
      handlePointerMove(e);
    };
    const onWindowPointerUp = (e: PointerEvent) => {
      handlePointerUp(e);
    };
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    };
  }, [isDragging, handlePointerMove, handlePointerUp]);

  // Cleanup on unmount if unmounted mid-drag
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.shiftKey ? 0.10 : 0.02;
      onKeyAdjust?.(-step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 0.10 : 0.02;
      onKeyAdjust?.(step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onGoToMin?.();
    } else if (e.key === 'End') {
      e.preventDefault();
      onGoToMax?.();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onReset();
    }
  }, [onKeyAdjust, onGoToMin, onGoToMax, onReset]);

  return (
    <>
      {isDragging && (
        <div class="fixed inset-0 z-[200] cursor-row-resize select-none pointer-events-auto" />
      )}
      <div
        ref={handleRef}
        role="separator"
        aria-orientation="horizontal"
        aria-label={resolvedLabel}
        aria-valuenow={valueNow}
        aria-valuemin={valueMin}
        aria-valuemax={valueMax}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDblClick={onReset}
        onKeyDown={handleKeyDown}
        class={`relative h-2 w-full shrink-0 select-none touch-none cursor-row-resize flex items-center justify-center transition-colors group focus:outline-none focus-visible:ring-1 focus-visible:ring-[#111111] dark:focus-visible:ring-white before:absolute before:-inset-y-1.5 before:inset-x-0 before:z-10 ${
          isDragging
            ? 'bg-[#111111] dark:bg-[#f0f0f2]'
            : 'bg-[#e5e5e5] dark:bg-[#22242a] hover:bg-[#111111]/80 dark:hover:bg-[#f0f0f2]/80'
        }`}
      >
        <div
          class={`h-1 w-10 rounded-full transition-colors z-20 ${
            isDragging
              ? 'bg-white dark:bg-[#111111]'
              : 'bg-[#cacacb] dark:bg-[#383d47] group-hover:bg-white dark:group-hover:bg-[#111111]'
          }`}
        />
      </div>
    </>
  );
}
