import { useState, useRef, useCallback, useEffect, useContext } from 'preact/hooks';
import { createContext } from 'preact';
import { PanelFullscreenContext } from './Panel';
import { useT } from './LangContext';

export interface ToolWorkspaceContextValue {
  isFullscreen: boolean;
  toggleFullscreen: () => void;
}

export const ToolWorkspaceContext = createContext<ToolWorkspaceContextValue>({
  isFullscreen: false,
  toggleFullscreen: () => {},
});

export function useToolWorkspace(): ToolWorkspaceContextValue {
  return useContext(ToolWorkspaceContext);
}

const FULLSCREEN_BTN_CLASS =
  'px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer';

interface ToolWorkspaceProps {
  children?: any;
  class?: string;
}

export default function ToolWorkspace({ children, class: className = '' }: ToolWorkspaceProps) {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isFallback, setIsFallback] = useState<boolean>(false);
  const [spacerHeight, setSpacerHeight] = useState<number>(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyOverflowRef = useRef<string | null>(null);

  const enterFallback = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    setSpacerHeight(el.offsetHeight || 0);
    setIsFallback(true);
    setIsFullscreen(true);
  }, []);

  const enterFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    bodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (el.requestFullscreen) {
      const promise = el.requestFullscreen({ navigationUI: 'hide' });
      if (promise && typeof promise.catch === 'function') {
        promise.catch(() => {
          enterFallback();
        });
      }
    } else if ((el as any).webkitRequestFullscreen) {
      try {
        (el as any).webkitRequestFullscreen();
      } catch {
        enterFallback();
      }
    } else {
      enterFallback();
    }
  }, [enterFallback]);

  const exitFullscreen = useCallback(() => {
    if (isFallback) {
      setIsFallback(false);
      setIsFullscreen(false);
      setSpacerHeight(0);
      if (bodyOverflowRef.current !== null) {
        document.body.style.overflow = bodyOverflowRef.current;
        bodyOverflowRef.current = null;
      } else {
        document.body.style.overflow = '';
      }
      return;
    }
    try {
      const exitPromise = document.exitFullscreen
        ? document.exitFullscreen()
        : (document as any).webkitExitFullscreen?.();
      if (exitPromise && typeof exitPromise.catch === 'function') {
        exitPromise.catch(() => {});
      }
    } catch {
      // ignore
    }
    setIsFullscreen(false);
    if (bodyOverflowRef.current !== null) {
      document.body.style.overflow = bodyOverflowRef.current;
      bodyOverflowRef.current = null;
    }
  }, [isFallback]);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  useEffect(() => {
    const onChange = () => {
      const fsElement = document.fullscreenElement ?? (document as any).webkitFullscreenElement;
      const now = fsElement === rootRef.current;
      setIsFullscreen(now);
      if (!now && isFallback) {
        setIsFallback(false);
        setSpacerHeight(0);
        if (bodyOverflowRef.current !== null) {
          document.body.style.overflow = bodyOverflowRef.current;
          bodyOverflowRef.current = null;
        }
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [isFallback]);

  useEffect(() => {
    if (!isFullscreen || !isFallback) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitFullscreen();
      }
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [isFullscreen, isFallback, exitFullscreen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFullscreen]);

  useEffect(() => {
    return () => {
      if (isFullscreen) {
        try {
          const fsElement = document.fullscreenElement ?? (document as any).webkitFullscreenElement;
          if (fsElement && fsElement === rootRef.current) {
            if (document.exitFullscreen) {
              document.exitFullscreen().catch(() => {});
            } else if ((document as any).webkitExitFullscreen) {
              (document as any).webkitExitFullscreen();
            }
          }
        } catch {}
        if (bodyOverflowRef.current !== null) {
          document.body.style.overflow = bodyOverflowRef.current;
          bodyOverflowRef.current = null;
        }
      }
    };
  }, [isFullscreen]);

  const rootClasses = isFullscreen
    ? 'w-screen h-screen flex flex-col overflow-hidden bg-white dark:bg-[#0c0d0e] transition-colors'
    : `${className} transition-colors`.trim();

  const fallbackOverlay = isFallback && isFullscreen ? (
    <div className="fixed inset-0 z-[100] h-[100dvh] w-screen bg-white dark:bg-[#0c0d0e] overflow-hidden flex flex-col">
      {children}
    </div>
  ) : null;

  const renderChildren = isFallback && isFullscreen ? null : children;

  const value: ToolWorkspaceContextValue = { isFullscreen, toggleFullscreen };

  return (
    <>
      {isFallback && !isFullscreen && (
        <div className="w-full" style={{ height: `${spacerHeight}px` }} />
      )}
      <div
        ref={rootRef}
        className={rootClasses}
        style={isFallback && isFullscreen ? { display: 'none' } : undefined}
      >
        <ToolWorkspaceContext.Provider value={value}>
          <PanelFullscreenContext.Provider value={{ isFullscreen }}>
            {renderChildren}
          </PanelFullscreenContext.Provider>
        </ToolWorkspaceContext.Provider>
      </div>
      {fallbackOverlay}
    </>
  );
}

export function FullscreenButton() {
  const { isFullscreen, toggleFullscreen } = useToolWorkspace();
  const t = useT();
  return (
    <button
      type="button"
      onClick={toggleFullscreen}
      aria-label={t('a11y.toggleFullscreen')}
      aria-pressed={isFullscreen}
      class={FULLSCREEN_BTN_CLASS}
    >
      {isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen')}
    </button>
  );
}
