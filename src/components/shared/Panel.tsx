/**
 * Panel.tsx - The single panel shell used by every tool page.
 *
 * Header: title, filename chip, line count, Choose file (FileButton), Clear,
 * Copy, Download, Fullscreen, plus extra `actions`.
 *
 * Fullscreen: CSS overlay (fixed inset-0 z-[100], 100dvh, role="dialog") on the
 * SAME mounted element (textarea cursor/scroll/selection/undo survive), with a
 * same-height spacer left in the page flow so layout does not jump. Esc closes,
 * body scroll is locked/restored, focus moves into the overlay and back to the
 * trigger, only one panel can be fullscreen at a time, and the Esc listener
 * exists only while open. If an ancestor breaks position:fixed, a portal to
 * document.body is used instead.
 */
import { useState, useRef, useEffect, useCallback, useContext } from 'preact/hooks';
import { createContext, createPortal } from 'preact';
import type { JSX } from 'preact';
import FileButton from './FileButton';

const FIXED_BREAKING_STYLES = ['transform', 'filter', 'backdropFilter', 'contain'];

// Only one panel may be fullscreen at a time.
let fullscreenOwner: { id: string; close: () => void } | null = null;

export interface PanelFullscreenContextValue {
  isFullscreen: boolean;
}

const PanelFullscreenContext = createContext<PanelFullscreenContextValue>({
  isFullscreen: false,
});

export function usePanelFullscreen(): PanelFullscreenContextValue {
  return useContext(PanelFullscreenContext);
}

function breaksFixed(cs: CSSStyleDeclaration): boolean {
  return Boolean(
    (cs.transform && cs.transform !== 'none' && cs.transform !== '') ||
    (cs.filter && cs.filter !== 'none' && cs.filter !== '') ||
    (cs.backdropFilter && cs.backdropFilter !== 'none' && cs.backdropFilter !== '') ||
    (cs.contain && cs.contain !== '')
  );
}

function hasFixedBreakingAncestor(el: HTMLElement | null): boolean {
  let node = el?.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    if (breaksFixed(window.getComputedStyle(node))) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

interface Props {
  title: string;
  filename?: string | null;
  lineCount?: number;
  edited?: boolean;
  accept?: string[];
  onFile?: (result: { name: string; size: number; text: string; large: boolean }) => void;
  onError?: (message: string) => void;
  fileLabel?: string;
  onClear?: () => void;
  onCopy?: () => void;
  onDownload?: () => void;
  downloadName?: string;
  fullscreenable?: boolean;
  actions?: JSX.Element;
  children?: JSX.Element;
}

export default function Panel({
  title,
  filename,
  lineCount,
  edited = false,
  accept,
  onFile,
  onError,
  fileLabel = 'Choose file',
  onClear,
  onCopy,
  onDownload,
  downloadName = 'download.json',
  fullscreenable = false,
  actions,
  children,
}: Props) {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [spacerHeight, setSpacerHeight] = useState<number>(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bodyOverflowRef = useRef<string | null>(null);
  const id = useRef(Math.random().toString(36).slice(2, 8)).current;

  const shouldUsePortal = useCallback(() => hasFixedBreakingAncestor(panelRef.current), []);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setSpacerHeight(0);
    if (bodyOverflowRef.current !== null) {
      document.body.style.overflow = bodyOverflowRef.current;
      bodyOverflowRef.current = null;
    } else {
      document.body.style.overflow = '';
    }
    requestAnimationFrame(() => {
      triggerRef.current?.focus?.();
    });
    if (fullscreenOwner && fullscreenOwner.id === id) {
      fullscreenOwner = null;
    }
  }, [id]);

  const enterFullscreen = useCallback(() => {
    if (fullscreenOwner && fullscreenOwner.id !== id) {
      fullscreenOwner.close();
    }
    const panel = panelRef.current;
    if (!panel) return;
    setSpacerHeight(panel.offsetHeight || 0);
    setIsFullscreen(true);
    bodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const panelEl = panelRef.current;
      if (!panelEl) return;
      const focusable = panelEl.querySelector<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      (focusable || panelEl)?.focus?.();
    });
    fullscreenOwner = { id, close: exitFullscreen };
  }, [id, exitFullscreen]);

  // Esc listener exists only while open.
  useEffect(() => {
    if (!isFullscreen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitFullscreen();
      }
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [isFullscreen, exitFullscreen]);

  // Restore body scroll and clear ownership on unmount while open.
  useEffect(() => {
    return () => {
      if (isFullscreen) {
        document.body.style.overflow = bodyOverflowRef.current ?? '';
        bodyOverflowRef.current = null;
        if (fullscreenOwner && fullscreenOwner.id === id) {
          fullscreenOwner = null;
        }
      }
    };
  }, [isFullscreen, id]);

  const usePortal = shouldUsePortal();

  const baseClasses =
    'flex flex-col border border-[#e5e5e5] dark:border-[#22242a] rounded-xl bg-white dark:bg-[#0c0d0e] transition-colors overflow-hidden';
  const fullscreenClasses = isFullscreen
    ? 'fixed inset-0 z-[100] w-full h-[100dvh] outline-none shadow-2xl'
    : '';

  const headerClasses =
    'flex items-center justify-between px-4 py-2.5 shrink-0 border-b border-[#e5e5e5] dark:border-[#22242a] bg-[#f5f5f5] dark:bg-[#14161b]';

  const titleClasses = 'flex items-center gap-2';
  const dotClasses = 'w-2.5 h-2.5 rounded-full bg-[#cacacb] dark:bg-[#383d47]';
  const titleTextClasses = 'text-xs font-semibold text-[#111111] dark:text-[#f0f0f2] uppercase tracking-wide';

  const metaClasses = 'flex items-center gap-3 text-[11px] font-mono';
  const chipClasses =
    'flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#cacacb] dark:border-[#2b2d35] bg-white dark:bg-[#18191d] text-[#111111] dark:text-[#f0f0f2]';
  const lineCountClasses = 'text-[#707072] dark:text-[#8e8e93]';

  const controlsClasses = 'flex items-center gap-1';

  const pillSecondary =
    'px-3 py-1 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer';
  const pillPrimary =
    'px-3 py-1 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer';

  const bodyClasses = 'flex-1 min-h-0 overflow-auto';

  const panelEl = (
    <div
      ref={panelRef}
      class={`${baseClasses} ${fullscreenClasses}`.trim()}
      data-fullscreen={isFullscreen ? 'true' : 'false'}
    >
      <header class={headerClasses}>
        <div class={titleClasses}>
          <span class={dotClasses}></span>
          <span class={titleTextClasses}>{title}</span>
        </div>

        <div class={metaClasses}>
          {filename && (
            <span class={chipClasses}>
              {filename}
              {edited ? ' · edited' : ''}
            </span>
          )}
          {lineCount !== undefined && (
            <span class={lineCountClasses}>{lineCount} lines</span>
          )}
        </div>

        <div class={controlsClasses}>
          {actions}
          {accept && onFile && (
            <FileButton accept={accept} onFile={onFile} onError={onError!} label={fileLabel} />
          )}
          {onClear && (
            <button type="button" onClick={onClear} class={pillSecondary}>
              Clear
            </button>
          )}
          {onCopy && (
            <button type="button" onClick={onCopy} class={pillSecondary}>
              Copy
            </button>
          )}
          {onDownload && (
            <button type="button" onClick={onDownload} class={pillSecondary}>
              Download
            </button>
          )}
          {fullscreenable && (
            <button
              ref={triggerRef}
              type="button"
              onClick={enterFullscreen}
              aria-label="Toggle fullscreen"
              aria-pressed={isFullscreen}
              class={pillPrimary}
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
          )}
        </div>
      </header>

      <div class={bodyClasses}>
        <PanelFullscreenContext.Provider value={{ isFullscreen }}>
          {children}
        </PanelFullscreenContext.Provider>
      </div>
    </div>
  );

  const spacer = (
    <div ref={spacerRef} class="w-full" style={{ height: `${spacerHeight}px` }} />
  );

  if (usePortal) {
    return createPortal(<>{spacer}{panelEl}</>, document.body);
  }
  return <>{spacer}{panelEl}</>;
}
