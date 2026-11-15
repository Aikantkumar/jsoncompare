import { useState, useMemo, useRef, useCallback, useEffect } from 'preact/hooks';
import {
  computeLineDiff,
  sortKeysDeep,
  safeParseJson,
  generateJsonPatch,
  evaluateSimpleJsonPath,
  repairJsonString,
  type DiffLine,
  type DiffStats,
  type JsonPatchOperation,
} from '../../utils/jsonDiff';
import { useToast } from '../../hooks/useToast';
import { formatBytes, readTextFile } from '../../utils/fileIO';
import { copyText, downloadText, deriveDownloadName } from '../../utils/download';
import { yieldToPaint } from '../../utils/async';
import { useTextDoc } from '../../hooks/useTextDoc';
import { useFileDrop } from '../../hooks/useFileDrop';
import Toast from '../../components/shared/Toast';
import Panel, { PanelFullscreenContext, usePanelFullscreen } from '../../components/shared/Panel';
import EditorTextarea from '../../components/shared/EditorTextarea';
import ResizeHandle from '../../components/shared/ResizeHandle';
import { LangProvider, useT, useFormatNumber } from '../../components/shared/LangContext';

const SAMPLES = {
  apiResponse: {
    left: JSON.stringify(
      {
        status: 200,
        endpoint: "/api/v1/users",
        timestamp: "2026-11-01T10:00:00Z",
        meta: { page: 1, limit: 10, total: 102 },
        users: [
          { id: "usr_1", name: "Sarah Chen", role: "admin", active: true, email: "sarah@acme.dev" },
          { id: "usr_2", name: "David Miller", role: "developer", active: true, email: "david@acme.dev" },
          { id: "usr_3", name: "Elena Rostova", role: "designer", active: false, email: "elena@acme.dev" }
        ],
        flags: { featureX: false, betaAccess: true }
      },
      null,
      2
    ),
    right: JSON.stringify(
      {
        status: 200,
        endpoint: "/api/v1/users",
        timestamp: "2026-11-01T10:05:00Z",
        meta: { page: 1, limit: 25, total: 103 },
        users: [
          { id: "usr_1", name: "Sarah Chen", role: "super_admin", active: true, email: "sarah@acme.dev" },
          { id: "usr_2", name: "David Miller", role: "lead_developer", active: true, email: "david.m@acme.dev" },
          { id: "usr_4", name: "Marcus Vance", role: "devops", active: true, email: "marcus@acme.dev" }
        ],
        flags: { featureX: true, betaAccess: true, darkThemeV2: true }
      },
      null,
      2
    )
  },
  keyOrder: {
    left: JSON.stringify({ database: "postgres", port: 5432, host: "localhost", ssl: true, timeout: 30 }, null, 2),
    right: JSON.stringify({ timeout: 30, ssl: true, host: "localhost", port: 5432, database: "postgres" }, null, 2)
  }
};

const ACCEPT_JSON_TXT = ['.json', '.txt'];
const DIFF_ROW_CAP = 3000;
const FOLD_THRESHOLD = 6;

type AppView = 'split' | 'unified' | 'patch';

interface DiffRowItem {
  kind: 'line' | 'fold' | 'showmore';
  line?: DiffLine;
  foldId?: number;
  foldCount?: number;
  foldLines?: DiffLine[];
  remaining?: number;
}

function buildDiffDisplay(lines: DiffLine[], rowCap: number): { items: DiffRowItem[]; remaining: number } {
  const items: DiffRowItem[] = [];
  let foldId = 0;
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === 'unchanged') {
      let j = i;
      while (j < lines.length && lines[j].type === 'unchanged') j++;
      const run = lines.slice(i, j);
      if (run.length > FOLD_THRESHOLD) {
        items.push({ kind: 'fold', foldId, foldCount: run.length, foldLines: run });
        foldId++;
      } else {
        for (const line of run) items.push({ kind: 'line', line });
      }
      i = j;
    } else {
      items.push({ kind: 'line', line: lines[i] });
      i++;
    }
  }

  let remaining = 0;
  if (items.length > DIFF_ROW_CAP) {
    remaining = items.length - DIFF_ROW_CAP;
    items.length = DIFF_ROW_CAP;
  }
  return { items, remaining };
}

function DiffTable(props: {
  lines: DiffLine[];
  view: AppView;
}) {
  const { lines, view } = props;
  const { isFullscreen } = usePanelFullscreen();
  const t = useT();
  const formatNumber = useFormatNumber();
  const [expandedFolds, setExpandedFolds] = useState<Set<number>>(new Set());
  const [rowCap, setRowCap] = useState<number>(DIFF_ROW_CAP);

  const { items, remaining } = useMemo(() => buildDiffDisplay(lines, rowCap), [lines, rowCap]);

  const toggleFold = (id: number) => {
    setExpandedFolds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleShowMore = () => {
    setRowCap((prev) => prev + DIFF_ROW_CAP);
  };

  const rowClasses = (type: string) => {
    if (type === 'removed') return 'bg-[#fde8e8] dark:bg-[#451010]/50 text-[#d30005] dark:text-[#fca5a5]';
    if (type === 'added') return 'bg-[#e8f7ee] dark:bg-[#06331e]/50 text-[#007d48] dark:text-[#6ee7b7]';
    if (type === 'modified') return 'bg-[#fff4e5] dark:bg-[#3d2305]/50';
    return '';
  };

  return (
    <>
      <div class={isFullscreen ? 'h-full overflow-auto' : 'overflow-x-auto max-h-[600px] overflow-y-auto'}>
        <table class="w-full border-collapse font-mono text-xs text-left">
          <thead class={isFullscreen ? 'sticky top-0 z-10 bg-[#fafafa] dark:bg-[#16181d]' : ''}>
            <tr class="bg-[#fafafa] dark:bg-[#16181d] border-b border-[#e5e5e5] dark:border-[#22242a] text-[11px] text-[#707072] dark:text-[#8e8e93]">
              {view === 'split' && (
                <>
                  <th class="w-12 px-2 py-1.5 text-right font-normal">#</th>
                  <th class="w-1/2 px-3 py-1.5 font-normal border-r border-[#e5e5e5] dark:border-[#22242a]">{t('compare.colOriginal')}</th>
                  <th class="w-12 px-2 py-1.5 text-right font-normal">#</th>
                  <th class="w-1/2 px-3 py-1.5 font-normal">{t('compare.colModified')}</th>
                </>
              )}
              {view === 'unified' && (
                <>
                  <th class="w-12 px-2 py-1.5 text-right font-normal">{t('compare.colL')}</th>
                  <th class="w-12 px-2 py-1.5 text-right font-normal">{t('compare.colR')}</th>
                  <th class="w-8 px-2 py-1.5 text-center font-normal">{t('compare.colOp')}</th>
                  <th class="px-3 py-1.5 font-normal">{t('compare.colContent')}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody class="divide-y divide-[#f0f0f0] dark:divide-[#1c1f26]">
            {items.map((item, idx) => {
              if (item.kind === 'fold') {
                return (
                  <tr
                    key={`fold-${item.foldId}`}
                    class="cursor-pointer hover:bg-[#fcfcfc] dark:hover:bg-[#16181d] transition-colors"
                    onClick={() => toggleFold(item.foldId!)}
                  >
                    <td colSpan={4} class="px-3 py-1.5 text-[11px] text-[#707072] dark:text-[#8e8e93] border-l border-[#e5e5e5] dark:border-[#22242a]">
                      {formatNumber(item.foldCount)} {t(item.foldCount === 1 ? 'compare.foldUnchangedOne' : 'compare.foldUnchangedOther', { n: formatNumber(item.foldCount) })}{' '}
                      <span class="ml-2 text-[#1151ff] dark:text-[#60a5fa] hover:underline cursor-pointer">
                        {expandedFolds.has(item.foldId!) ? t('compare.foldShowLess') : t('compare.foldShow')}
                      </span>
                    </td>
                  </tr>
                );
              }
              if (item.kind === 'showmore') {
                return (
                  <tr key="showmore">
                    <td colSpan={4} class="px-3 py-1.5 text-center text-[11px] text-[#1151ff] dark:text-[#60a5fa] cursor-pointer hover:underline" onClick={handleShowMore}>
                      {t('compare.showMore', { n: formatNumber(item.remaining) })}
                    </td>
                  </tr>
                );
              }
              const line = item.line!;
              const isModified = line.type === 'modified';

              if (view === 'unified' && isModified) {
                return (
                  <>
                    <tr key={`u-remove-${idx}`} class={`${rowClasses('removed')} hover:bg-[#fcfcfc] dark:hover:bg-[#16181d] transition-colors`}>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none">{line.leftLineNumber ?? ''}</td>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none"></td>
                      <td class="w-8 px-2 py-0.5 text-center select-none font-bold">-</td>
                      <td class="px-3 py-0.5 whitespace-pre font-mono break-all">{line.leftText}</td>
                    </tr>
                    <tr key={`u-add-${idx}`} class={`${rowClasses('added')} hover:bg-[#fcfcfc] dark:hover:bg-[#16181d] transition-colors`}>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none"></td>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none">{line.rightLineNumber ?? ''}</td>
                      <td class="w-8 px-2 py-0.5 text-center select-none font-bold">+</td>
                      <td class="px-3 py-0.5 whitespace-pre font-mono break-all">{line.rightText}</td>
                    </tr>
                  </>
                );
              }

              const isRemoved = line.type === 'removed';
              const isAdded = line.type === 'added';

              return (
                <tr key={`line-${idx}`} class={`hover:bg-[#fcfcfc] dark:hover:bg-[#16181d] transition-colors leading-5 ${rowClasses(line.type)}`}>
                  {view === 'split' && (
                    <>
                      <td class={`w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none ${(isRemoved || isModified) ? rowClasses(line.type).split(' ')[0] : ''}`}>
                        {line.leftLineNumber ?? ''}
                      </td>
                      <td class={`w-1/2 px-3 py-0.5 border-r border-[#e5e5e5] dark:border-[#22242a] whitespace-pre font-mono break-all ${rowClasses(line.type)}`}>
                        {line.leftText !== undefined ? line.leftText : ''}
                      </td>
                      <td class={`w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none ${(isAdded || isModified) ? rowClasses(line.type).split(' ')[0] : ''}`}>
                        {line.rightLineNumber ?? ''}
                      </td>
                      <td class={`w-1/2 px-3 py-0.5 whitespace-pre font-mono break-all ${rowClasses(line.type)}`}>
                        {line.rightText !== undefined ? line.rightText : ''}
                      </td>
                    </>
                  )}
                  {view === 'unified' && !isModified && (
                    <>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none">
                        {line.leftLineNumber ?? ''}
                      </td>
                      <td class="w-12 px-2 py-0.5 text-right text-[11px] text-[#9e9ea0] dark:text-[#636366] select-none">
                        {line.rightLineNumber ?? ''}
                      </td>
                      <td class="w-8 px-2 py-0.5 text-center select-none font-bold">
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      </td>
                      <td class="px-3 py-0.5 whitespace-pre font-mono break-all">
                        {line.type === 'added' ? line.rightText : line.leftText}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
        {remaining > 0 && (
          <button type="button" onClick={handleShowMore} class="px-3 py-1.5 text-[11px] text-[#1151ff] dark:text-[#60a5fa] hover:underline cursor-pointer mt-2">
            {t('compare.showMore', { n: formatNumber(remaining) })}
          </button>
        )}
      </>
    );
  }

const DEFAULT_TOP_RATIO = 0.4;
const MIN_TOP_RATIO = 0.15;
const MAX_TOP_RATIO = 0.85;

function getStoredTopRatio(): number {
  if (typeof window === 'undefined') return DEFAULT_TOP_RATIO;
  try {
    const item = localStorage.getItem('jsoncompare:topRatio');
    if (item !== null) {
      const val = parseFloat(item);
      if (!Number.isNaN(val) && val >= MIN_TOP_RATIO && val <= MAX_TOP_RATIO) {
        return val;
      }
    }
  } catch {
    // localStorage not available
  }
  return DEFAULT_TOP_RATIO;
}

function setStoredTopRatio(ratio: number) {
  try {
    localStorage.setItem('jsoncompare:topRatio', ratio.toString());
  } catch {
    // localStorage not available
  }
}

function getStoredNormalHeight(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const item = localStorage.getItem('jsoncompare:normalHeightPx');
    if (item !== null) {
      const val = parseInt(item, 10);
      const max = (window.innerHeight || 900) * 0.8;
      if (!Number.isNaN(val) && val >= 120 && val <= max) {
        return val;
      }
    }
  } catch {
    // localStorage not available
  }
  return null;
}

function setStoredNormalHeight(height: number | null) {
  try {
    if (height === null) {
      localStorage.removeItem('jsoncompare:normalHeightPx');
    } else {
      localStorage.setItem('jsoncompare:normalHeightPx', height.toString());
    }
  } catch {
    // localStorage not available
  }
}

export default function JsonCompareApp({ lang = 'en' }: { lang?: string } = {}) {
  return (
    <LangProvider lang={lang}>
      <JsonCompareAppInner />
    </LangProvider>
  );
}

function JsonCompareAppInner() {
  const t = useT();
  const formatNumber = useFormatNumber();
  const [leftDoc, leftActions] = useTextDoc(SAMPLES.apiResponse.left, { persistKey: 'compare:left' });
  const [rightDoc, rightActions] = useTextDoc(SAMPLES.apiResponse.right, { persistKey: 'compare:right' });
  const [activeView, setActiveView] = useState<AppView>('split');

  const [ignoreKeyOrder, setIgnoreKeyOrder] = useState<boolean>(true);
  const [ignoreArrayOrder, setIgnoreArrayOrder] = useState<boolean>(false);
  const [matchArrayById, setMatchArrayById] = useState<boolean>(true);
  const [arrayIdKey, setArrayIdKey] = useState<string>('id');
  const [jsonPathFilter, setJsonPathFilter] = useState<string>('');

  const [diffResult, setDiffResult] = useState<{ lines: DiffLine[]; stats: DiffStats; degraded: boolean } | null>(null);
  const [patchResult, setPatchResult] = useState<JsonPatchOperation[]>([]);
  const [largeComparePending, setLargeComparePending] = useState<boolean>(false);

  const { message: toastMessage, show: showToast } = useToast(3000);

  const [workspaceFullscreen, setWorkspaceFullscreen] = useState<boolean>(false);
  const [isFallbackMode, setIsFallbackMode] = useState<boolean>(false);
  const [spacerHeight, setSpacerHeight] = useState<number>(0);
  const [topRatio, setTopRatio] = useState<number>(getStoredTopRatio);
  const [normalHeightPx, setNormalHeightPx] = useState<number | null>(getStoredNormalHeight);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workspaceBodyRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const fullscreenTriggerRef = useRef<HTMLButtonElement>(null);
  const bodyOverflowRef = useRef<string | null>(null);

  const handleResizeDrag = useCallback((clientY: number) => {
    const container = workspaceBodyRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const handleHalfHeight = 4;
    const relativeY = clientY - rect.top - handleHalfHeight;

    if (workspaceFullscreen) {
      const rawRatio = relativeY / rect.height;
      const clampedRatio = Math.min(MAX_TOP_RATIO, Math.max(MIN_TOP_RATIO, rawRatio));
      setTopRatio(clampedRatio);
      setStoredTopRatio(clampedRatio);
    } else {
      const maxPx = window.innerHeight * 0.8;
      const clampedPx = Math.min(maxPx, Math.max(120, Math.round(relativeY)));
      setNormalHeightPx(clampedPx);
      setStoredNormalHeight(clampedPx);
    }
  }, [workspaceFullscreen]);

  const handleResizeReset = useCallback(() => {
    if (workspaceFullscreen) {
      setTopRatio(DEFAULT_TOP_RATIO);
      setStoredTopRatio(DEFAULT_TOP_RATIO);
    } else {
      setNormalHeightPx(null);
      setStoredNormalHeight(null);
    }
  }, [workspaceFullscreen]);

  const handleResizeKeyAdjust = useCallback((step: number) => {
    if (workspaceFullscreen) {
      setTopRatio((prev) => {
        const next = Math.min(MAX_TOP_RATIO, Math.max(MIN_TOP_RATIO, prev + step));
        setStoredTopRatio(next);
        return next;
      });
    } else {
      const pxStep = Math.round(step * 500);
      setNormalHeightPx((prev) => {
        const base = prev ?? (workspaceBodyRef.current?.firstElementChild?.clientHeight || 280);
        const maxPx = window.innerHeight * 0.8;
        const next = Math.min(maxPx, Math.max(120, base + pxStep));
        setStoredNormalHeight(next);
        return next;
      });
    }
  }, [workspaceFullscreen]);

  const handleGoToMin = useCallback(() => {
    if (workspaceFullscreen) {
      setTopRatio(MIN_TOP_RATIO);
      setStoredTopRatio(MIN_TOP_RATIO);
    } else {
      setNormalHeightPx(120);
      setStoredNormalHeight(120);
    }
  }, [workspaceFullscreen]);

  const handleGoToMax = useCallback(() => {
    if (workspaceFullscreen) {
      setTopRatio(MAX_TOP_RATIO);
      setStoredTopRatio(MAX_TOP_RATIO);
    } else {
      const maxPx = Math.round(window.innerHeight * 0.8);
      setNormalHeightPx(maxPx);
      setStoredNormalHeight(maxPx);
    }
  }, [workspaceFullscreen]);

  // CSS Fallback for browsers without Fullscreen API (e.g. iPhone Safari)
  const enterCssFallback = useCallback(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    setSpacerHeight(workspace.offsetHeight || 0);
    setIsFallbackMode(true);
    setWorkspaceFullscreen(true);
    bodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const el = workspaceRef.current;
      if (!el) return;
      const focusable = el.querySelector<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      (focusable || el)?.focus?.();
    });
  }, []);

  const exitCssFallback = useCallback(() => {
    setIsFallbackMode(false);
    setWorkspaceFullscreen(false);
    setSpacerHeight(0);
    if (bodyOverflowRef.current !== null) {
      document.body.style.overflow = bodyOverflowRef.current;
      bodyOverflowRef.current = null;
    } else {
      document.body.style.overflow = '';
    }
    requestAnimationFrame(() => {
      fullscreenTriggerRef.current?.focus?.();
    });
  }, []);

  // Synchronous click handler for native Fullscreen API (F11 parity)
  const toggleWorkspaceFullscreen = useCallback(() => {
    const el = workspaceRef.current;
    const isNativeFs = Boolean(
      document.fullscreenElement || (document as any).webkitFullscreenElement
    );

    // If already in fullscreen, exit
    if (workspaceFullscreen || isNativeFs) {
      if (isNativeFs) {
        try {
          const exitPromise = document.exitFullscreen
            ? document.exitFullscreen()
            : (document as any).webkitExitFullscreen?.();
          if (exitPromise && typeof exitPromise.catch === 'function') {
            exitPromise.catch((err: unknown) => console.warn('exitFullscreen error', err));
          }
        } catch (err) {
          console.warn('exitFullscreen error', err);
        }
      } else {
        exitCssFallback();
      }
      return;
    }

    // Enter fullscreen: requestFullscreen must run synchronously inside user gesture
    if (el && (el.requestFullscreen || (el as any).webkitRequestFullscreen)) {
      try {
        const reqPromise = el.requestFullscreen
          ? el.requestFullscreen({ navigationUI: 'hide' })
          : (el as any).webkitRequestFullscreen();
        if (reqPromise && typeof reqPromise.catch === 'function') {
          reqPromise.catch((err: unknown) => {
            console.warn('requestFullscreen rejected, falling back to CSS overlay', err);
            enterCssFallback();
          });
        }
      } catch (err) {
        console.warn('requestFullscreen threw, falling back to CSS overlay', err);
        enterCssFallback();
      }
    } else {
      enterCssFallback();
    }
  }, [workspaceFullscreen, enterCssFallback, exitCssFallback]);

  // fullscreenchange is the single source of truth for native fullscreen state
  useEffect(() => {
    const onFullscreenChange = () => {
      const fsElement = document.fullscreenElement ?? (document as any).webkitFullscreenElement;
      const isFs = fsElement === workspaceRef.current;
      setWorkspaceFullscreen(isFs);
      if (!isFs) {
        setIsFallbackMode(false);
        requestAnimationFrame(() => {
          fullscreenTriggerRef.current?.focus?.();
        });
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  // Esc keydown listener: ONLY in CSS fallback mode (native fullscreen handles Esc automatically)
  useEffect(() => {
    if (!workspaceFullscreen || !isFallbackMode) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitCssFallback();
      }
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [workspaceFullscreen, isFallbackMode, exitCssFallback]);

  // Intercept F11 key to toggle our compare workspace fullscreen
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        try {
          e.preventDefault();
        } catch {
          // ignore if preventDefault is not permitted by browser
        }
        toggleWorkspaceFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleWorkspaceFullscreen]);

  // Unmount cleanup: exit fullscreen if unmounting while active, and restore body scroll if fallback was active
  useEffect(() => {
    return () => {
      const fsElement = document.fullscreenElement ?? (document as any).webkitFullscreenElement;
      if (fsElement && fsElement === workspaceRef.current) {
        try {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          } else if ((document as any).webkitExitFullscreen) {
            (document as any).webkitExitFullscreen();
          }
        } catch {
          // ignore
        }
      }
      if (bodyOverflowRef.current !== null) {
        document.body.style.overflow = bodyOverflowRef.current;
        bodyOverflowRef.current = null;
      }
    };
  }, []);

  const isLargeMode = leftDoc.isLarge || rightDoc.isLarge;

  // ---- File handling ----
  const applyLeftFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    leftActions.loadFile(result);
    showToast(t('common.loadedFile', { name: result.name, size: formatBytes(result.size) }));
  }, [leftActions, showToast]);

  const applyRightFile = useCallback((result: { name: string; size: number; text: string; large: boolean }) => {
    rightActions.loadFile(result);
    showToast(t('common.loadedFile', { name: result.name, size: formatBytes(result.size) }));
  }, [rightActions, showToast]);

  const handleFileError = useCallback((err: unknown) => {
    const e = err as Error & { code?: string; params?: Record<string, string> };
    const translated = e.code ? t(`error.file.${e.code}`, e.params) : null;
    showToast(translated ?? (e instanceof Error ? e.message : String(err)));
  }, [t, showToast]);

  const handleDropFiles = useCallback((files: FileList, preferredSide: 'left' | 'right') => {
    const arr = Array.from(files);
    if (arr.length >= 2) {
      readTextFile(arr[0], { accept: ACCEPT_JSON_TXT }).then(applyLeftFile).catch(handleFileError);
      readTextFile(arr[1], { accept: ACCEPT_JSON_TXT }).then(applyRightFile).catch(handleFileError);
      return;
    }
    const file = arr[0];
    if (!file) return;
    if (preferredSide === 'left') {
      readTextFile(file, { accept: ACCEPT_JSON_TXT }).then(applyLeftFile).catch(handleFileError);
    } else {
      readTextFile(file, { accept: ACCEPT_JSON_TXT }).then(applyRightFile).catch(handleFileError);
    }
  }, [applyLeftFile, applyRightFile, handleFileError]);

  const leftDrop = useFileDrop((files) => handleDropFiles(files, 'left'), { multiple: true });
  const rightDrop = useFileDrop((files) => handleDropFiles(files, 'right'), { multiple: true });

  // ---- Diff computation (debounced) ----
  const diffTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recomputeDiff = useCallback(() => {
    const leftRes = safeParseJson(leftDoc.text, false);
    const rightRes = safeParseJson(rightDoc.text, false);

    let leftData = leftRes.data;
    let rightData = rightRes.data;

    if (jsonPathFilter.trim()) {
      if (leftData) leftData = evaluateSimpleJsonPath(leftData, jsonPathFilter);
      if (rightData) rightData = evaluateSimpleJsonPath(rightData, jsonPathFilter);
    }

    if (ignoreKeyOrder && leftData && rightData) {
      leftData = sortKeysDeep(leftData, { ignoreArrayOrder, matchArrayById, idKey: arrayIdKey });
      rightData = sortKeysDeep(rightData, { ignoreArrayOrder, matchArrayById, idKey: arrayIdKey });
    }

    const leftText = leftData !== undefined && leftData !== null ? JSON.stringify(leftData, null, 2) : leftDoc.text;
    const rightText = rightData !== undefined && rightData !== null ? JSON.stringify(rightData, null, 2) : rightDoc.text;

    const diff = computeLineDiff(leftText, rightText, {
      maxEditDistance: 4000,
      memoryBudgetEntries: 2_000_000,
    });
    const patch = leftData && rightData ? generateJsonPatch(leftData, rightData) : [];

    setDiffResult({ lines: diff.lines, stats: diff.stats, degraded: diff.degraded });
    setPatchResult(patch);
    setLargeComparePending(false);
  }, [leftDoc.text, rightDoc.text, ignoreKeyOrder, ignoreArrayOrder, matchArrayById, arrayIdKey, jsonPathFilter]);

  useEffect(() => {
    if (isLargeMode) return;
    if (diffTimeoutRef.current) clearTimeout(diffTimeoutRef.current);
    diffTimeoutRef.current = setTimeout(() => {
      recomputeDiff();
    }, 250);
    return () => {
      if (diffTimeoutRef.current) clearTimeout(diffTimeoutRef.current);
    };
  }, [leftDoc.text, rightDoc.text, ignoreKeyOrder, ignoreArrayOrder, matchArrayById, arrayIdKey, jsonPathFilter, isLargeMode, recomputeDiff]);

  const handleCompare = async () => {
    setLargeComparePending(true);
    await yieldToPaint();
    recomputeDiff();
  };

  // ---- Actions ----
  const handleSwap = () => {
    const tmpText = leftDoc.text;
    const tmpFilename = leftDoc.filename;
    const tmpEdited = leftDoc.edited;
    leftActions.setText(rightDoc.text, { markEdited: false });
    leftActions.setFilename(rightDoc.filename);
    leftActions.setEdited(rightDoc.edited);
    rightActions.setText(tmpText, { markEdited: false });
    rightActions.setFilename(tmpFilename);
    rightActions.setEdited(tmpEdited);
    showToast(t('compare.toastSwapped'));
  };

  const handleClearLeft = () => {
    leftActions.clear();
    showToast(t('compare.toastClearedLeft'));
  };
  const handleClearRight = () => {
    rightActions.clear();
    showToast(t('compare.toastClearedRight'));
  };

  const handleCopy = async (text: string, side: 'left' | 'right') => {
    const ok = await copyText(text);
    showToast(ok ? t(side === 'left' ? 'compare.toastCopiedLeft' : 'compare.toastCopiedRight') : t('common.copyFailed'));
  };

  const handleDownload = (text: string, sourceName: string | null, fallback: string) => {
    const name = deriveDownloadName(sourceName, '.json', fallback);
    downloadText(text, name, 'application/json');
    showToast(t('common.downloadedFile', { name }));
  };

  const handleFormatBoth = () => {
    try {
      if (leftDoc.text.trim()) {
        const lp = JSON.parse(leftDoc.text);
        leftActions.setText(JSON.stringify(lp, null, 2));
      }
      if (rightDoc.text.trim()) {
        const rp = JSON.parse(rightDoc.text);
        rightActions.setText(JSON.stringify(rp, null, 2));
      }
      showToast(t('compare.toastFormattedBoth'));
    } catch {
      showToast(t('compare.toastFormatFailed'));
    }
  };

  const handleSmartRepairBoth = () => {
    const repairedLeft = repairJsonString(leftDoc.text);
    const repairedRight = repairJsonString(rightDoc.text);
    leftActions.setText(repairedLeft);
    rightActions.setText(repairedRight);
    showToast(t('compare.toastSmartRepairBoth'));
  };

  const handleCopyDiffReport = async () => {
    const report = {
      timestamp: new Date().toISOString(),
      stats: diffResult?.stats,
      patches: patchResult,
    };
    const ok = await copyText(JSON.stringify(report, null, 2));
    showToast(ok ? t('compare.toastCopiedDiffReport') : t('common.copyFailed'));
  };

  const stats = diffResult ? diffResult.stats : { added: 0, removed: 0, modified: 0, unchanged: 0, totalChanges: 0 };
  const lines = diffResult ? diffResult.lines : [];

  const viewPills = (active: AppView) => (
    <div class="flex items-center gap-1 bg-white dark:bg-[#18191d] p-1 rounded-full border border-[#cacacb]/60 dark:border-[#2b2d35] shadow-xs">
      <button
        onClick={() => setActiveView('split')}
        class={`px-3.5 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition-all cursor-pointer ${
          active === 'split'
            ? 'bg-[#111111] text-white dark:bg-[#f0f0f2] dark:text-[#111111] shadow-xs'
            : 'text-[#707072] dark:text-[#8e8e93] hover:text-[#111111] dark:hover:text-[#f0f0f2]'
        }`}
      >
        {t('compare.viewSplit')}
      </button>
      <button
        onClick={() => setActiveView('unified')}
        class={`px-3.5 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition-all cursor-pointer ${
          active === 'unified'
            ? 'bg-[#111111] text-white dark:bg-[#f0f0f2] dark:text-[#111111] shadow-xs'
            : 'text-[#707072] dark:text-[#8e8e93] hover:text-[#111111] dark:hover:text-[#f0f0f2]'
        }`}
      >
        {t('compare.viewUnified')}
      </button>
      <button
        onClick={() => setActiveView('patch')}
        class={`px-3.5 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition-all cursor-pointer ${
          active === 'patch'
            ? 'bg-[#111111] text-white dark:bg-[#f0f0f2] dark:text-[#111111] shadow-xs'
            : 'text-[#707072] dark:text-[#8e8e93] hover:text-[#111111] dark:hover:text-[#f0f0f2]'
        }`}
      >
        {t('compare.viewPatch', { n: formatNumber(patchResult.length) })}
      </button>
    </div>
  );

  const spacer = (
    <div ref={spacerRef} key="workspace-spacer" class="w-full" style={{ height: `${spacerHeight}px` }} />
  );

  return (
    <>
      {isFallbackMode && workspaceFullscreen && spacer}
      <div
        key="workspace-root"
        ref={workspaceRef}
        class={`bg-white dark:bg-[#0c0d0e] transition-colors ${
          workspaceFullscreen
            ? isFallbackMode
              ? 'fixed inset-0 z-[100] h-[100dvh] flex flex-col overflow-hidden'
              : 'w-screen h-screen flex flex-col overflow-hidden [&:fullscreen]:w-screen [&:fullscreen]:h-screen [&:fullscreen]:flex [&:fullscreen]:flex-col [&:fullscreen]:overflow-hidden'
            : 'w-full'
        }`}
      >
        <Toast message={toastMessage} />

        {/* Main Control Toolbar */}
        <div
          class={`border-b border-[#e5e5e5] dark:border-[#22242a] bg-[#f5f5f5]/80 dark:bg-[#14161b] px-4 sm:px-6 py-3 transition-colors shrink-0 ${
            workspaceFullscreen ? 'max-h-[40vh] overflow-y-auto' : ''
          }`}
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-1.5">
              <button
                onClick={handleSwap}
                title={t('compare.titleSwap')}
                class="px-3 py-1 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
              >
                ↔ {t('common.swap')}
              </button>
              <button
                onClick={handleFormatBoth}
                title={t('compare.titlePrettify')}
                class="px-3 py-1 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
              >
                {t('compare.btnPrettify')}
              </button>
              <button
                onClick={handleSmartRepairBoth}
                title={t('compare.titleSmartFix')}
                class="px-3 py-1 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#1151ff] dark:text-[#60a5fa] hover:bg-[#1151ff] hover:text-white dark:hover:bg-[#1151ff] dark:hover:text-white transition-colors cursor-pointer"
              >
                ✨ {t('compare.btnSmartFix')}
              </button>
              <button
                onClick={handleCopyDiffReport}
                class="px-3 py-1 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer"
              >
                {t('compare.btnCopyReport')}
              </button>
            </div>

            <div class="flex items-center gap-2 text-xs font-mono">
              <span class="px-2.5 py-0.5 rounded-full bg-white dark:bg-[#18191d] border border-[#e5e5e5] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] font-semibold">
                {stats.totalChanges === 0 ? t('compare.identical') : `${formatNumber(stats.totalChanges)} ${t(stats.totalChanges === 1 ? 'compare.changesOne' : 'compare.changesOther', { n: formatNumber(stats.totalChanges) })}`}
              </span>
                <span class="px-2 py-0.5 rounded-full bg-[#007d48]/10 text-[#007d48] dark:bg-[#1eaa52]/20 dark:text-[#34d399] font-medium">
                  {t('compare.added', { n: formatNumber(stats.added) })}
                </span>
                <span class="px-2 py-0.5 rounded-full bg-[#d30005]/10 text-[#d30005] dark:bg-[#f87171]/20 dark:text-[#f87171] font-medium">
                  {t('compare.removed', { n: formatNumber(stats.removed) })}
                </span>
                <span class="px-2 py-0.5 rounded-full bg-[#1151ff]/10 text-[#1151ff] dark:bg-[#60a5fa]/20 dark:text-[#60a5fa] font-medium">
                  {t('compare.modified', { n: formatNumber(stats.modified) })}
                </span>
            </div>

            {viewPills(activeView)}
          </div>

          <div class="mt-2.5 pt-2 border-t border-[#e5e5e5] dark:border-[#22242a] flex flex-wrap items-center justify-between gap-3 text-xs text-[#39393b] dark:text-[#b5b5b8]">
            <div class="flex flex-wrap items-center gap-4">
              <label class="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ignoreKeyOrder}
                  onChange={(e: any) => setIgnoreKeyOrder((e.target as HTMLInputElement).checked)}
                  class="rounded border-[#cacacb] dark:border-[#2b2d35] text-[#111111] focus:ring-0"
                />
                <span class="font-medium">{t('compare.ignoreKeyOrder')}</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ignoreArrayOrder}
                  onChange={(e: any) => setIgnoreArrayOrder((e.target as HTMLInputElement).checked)}
                  class="rounded border-[#cacacb] dark:border-[#2b2d35] text-[#111111] focus:ring-0"
                />
                <span class="font-medium">{t('compare.ignoreArrayOrder')}</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={matchArrayById}
                  onChange={(e: any) => setMatchArrayById((e.target as HTMLInputElement).checked)}
                  class="rounded border-[#cacacb] dark:border-[#2b2d35] text-[#111111] focus:ring-0"
                />
                <span class="font-medium">{t('compare.alignArrayByKey')}</span>
                <input
                  type="text"
                  value={arrayIdKey}
                  onInput={(e: any) => setArrayIdKey((e.target as HTMLInputElement).value)}
                  class="w-12 px-1.5 py-0.5 rounded-full border border-[#cacacb] dark:border-[#2b2d35] bg-white dark:bg-[#18191d] text-[11px] font-mono text-center text-[#111111] dark:text-[#f0f0f2]"
                />
              </label>
            </div>

            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5 bg-white dark:bg-[#18191d] px-2.5 py-1 rounded-full border border-[#cacacb]/80 dark:border-[#2b2d35]">
                <span class="font-mono text-[11px] text-[#707072] dark:text-[#8e8e93]">{t('compare.filterLabel')}</span>
                <input
                  type="text"
                  value={jsonPathFilter}
                  onInput={(e: any) => setJsonPathFilter((e.target as HTMLInputElement).value)}
                  placeholder={t('compare.filterPlaceholder')}
                  class="font-mono text-xs text-[#111111] dark:text-[#f0f0f2] outline-none w-36 bg-transparent"
                />
                {jsonPathFilter && (
                  <button
                    onClick={() => setJsonPathFilter('')}
                    class="text-[10px] text-[#707072] dark:text-[#8e8e93] hover:text-[#111111] dark:hover:text-[#f0f0f2] cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                ref={fullscreenTriggerRef}
                type="button"
                onClick={toggleWorkspaceFullscreen}
                aria-label={t('a11y.toggleFullscreen')}
                aria-pressed={workspaceFullscreen}
                class="px-3 py-1 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer"
              >
                {workspaceFullscreen ? t('common.exitFullscreen') : t('common.fullscreen')}
              </button>

              <div class="flex items-center gap-1 text-[11px]">
                <span class="text-[#707072] dark:text-[#8e8e93]">{t('compare.samples')}</span>
                  <button
                    onClick={() => {
                      leftActions.setText(SAMPLES.apiResponse.left, { markEdited: false });
                      rightActions.setText(SAMPLES.apiResponse.right, { markEdited: false });
                      leftActions.setFilename(null);
                      rightActions.setFilename(null);
                      leftActions.setEdited(false);
                      rightActions.setEdited(false);
                      showToast(t('compare.toastLoadedSampleApi'));
                    }}
                  class="hover:underline text-[#111111] dark:text-[#f0f0f2] cursor-pointer"
                >
                  {t('compare.sampleApi')}
                </button>
                <span class="text-[#cacacb] dark:text-[#383d47]">|</span>
                  <button
                    onClick={() => {
                      leftActions.setText(SAMPLES.keyOrder.left, { markEdited: false });
                      rightActions.setText(SAMPLES.keyOrder.right, { markEdited: false });
                      leftActions.setFilename(null);
                      rightActions.setFilename(null);
                      leftActions.setEdited(false);
                      rightActions.setEdited(false);
                      showToast(t('compare.toastLoadedSampleKeyOrder'));
                    }}
                  class="hover:underline text-[#111111] dark:text-[#f0f0f2] cursor-pointer"
                >
                  {t('compare.sampleKeyOrder')}
                </button>
                <span class="text-[#cacacb] dark:text-[#383d47]">|</span>
                  <button
                    onClick={() => {
                      leftActions.clear();
                      rightActions.clear();
                      showToast(t('compare.toastClearedBoth'));
                    }}
                  class="hover:underline text-[#d30005] dark:text-[#f87171] cursor-pointer"
                >
                  {t('compare.sampleClear')}
                </button>
              </div>
            </div>
          </div>

          {isLargeMode && (
            <div class="px-4 sm:px-6 py-2 bg-[#fff4e5] dark:bg-[#3d2305]/40 border border-[#e5e5e5] dark:border-[#5c3a0a]">
              <div class="flex items-center gap-2 text-[11px] font-medium text-[#b45309] dark:text-[#fde047]">
                <span class="w-1.5 h-1.5 rounded-full bg-[#b45309] dark:bg-[#fde047]"></span>
                {t('compare.largeBanner')}
              </div>
              <button
                onClick={handleCompare}
                disabled={largeComparePending}
                class="ml-auto px-3 py-1 rounded-full text-xs font-semibold border border-[#b45309] dark:border-[#fde047] text-[#b45309] dark:text-[#fde047] hover:bg-[#b45309] dark:hover:bg-[#fde047] hover:text-white dark:hover:text-[#111111] transition-colors cursor-pointer"
              >
                {largeComparePending ? t('compare.btnComparing') : t('compare.btnCompare')}
              </button>
            </div>
          )}

          {diffResult?.degraded && (
            <div class="px-4 sm:px-6 py-2 bg-[#fde8e8] dark:bg-[#451010]/40 border border-[#e5e5e5] dark:border-[#7a1f1f]">
              <div class="flex items-center gap-2 text-[11px] font-medium text-[#d30005] dark:text-[#fca5a5]">
                <span class="w-1.5 h-1.5 rounded-full bg-[#d30005] dark:bg-[#fca5a5]"></span>
                {t('compare.degradedBanner')}
              </div>
            </div>
          )}
        </div>

        {/* Workspace Body */}
        <PanelFullscreenContext.Provider value={{ isFullscreen: workspaceFullscreen }}>
          <div
            ref={workspaceBodyRef}
            class={workspaceFullscreen ? 'flex-1 min-h-0 flex flex-col overflow-hidden relative' : 'flex flex-col relative'}
          >
            {/* Editor Stage */}
            <div
              style={
                workspaceFullscreen
                  ? { height: `${topRatio * 100}%` }
                  : normalHeightPx !== null
                  ? { height: `${normalHeightPx}px` }
                  : undefined
              }
              class={
                workspaceFullscreen
                  ? 'min-h-0 shrink-0 grid grid-cols-1 lg:grid-cols-2 grid-rows-2 lg:grid-rows-1 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a] overflow-hidden'
                  : normalHeightPx !== null
                  ? 'min-h-[120px] shrink-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a] overflow-hidden'
                  : 'grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e5] dark:divide-[#22242a]'
              }
            >
              <div {...leftDrop.getDropProps()} class={`relative flex flex-col bg-white dark:bg-[#0c0d0e] ${workspaceFullscreen || normalHeightPx !== null ? 'h-full min-h-0 overflow-hidden' : ''}`}>
                {leftDrop.isDragging && (
                  <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
                )}
                <Panel
                  title={t('compare.titleLeft')}
                  filename={leftDoc.filename}
                  lineCount={leftDoc.lineCount}
                  edited={leftDoc.edited}
                  accept={ACCEPT_JSON_TXT}
                  onFile={applyLeftFile}
                  onError={handleFileError}
                  fileAriaLabel={t('compare.ariaChooseFileLeft')}
                  onClear={handleClearLeft}
                  onCopy={() => handleCopy(leftDoc.text, 'left JSON')}
                  onDownload={() => handleDownload(leftDoc.text, leftDoc.filename, 'left')}
                  class={workspaceFullscreen || normalHeightPx !== null ? 'h-full' : ''}
                >
                  <EditorTextarea
                    value={leftDoc.text}
                    onInput={(v) => { leftActions.setText(v); }}
                    placeholder={t('compare.placeholderLeft')}
                    ariaLabel={t('compare.ariaEditorLeft')}
                    fillHeight={workspaceFullscreen || normalHeightPx !== null}
                  />
                </Panel>
              </div>

              <div {...rightDrop.getDropProps()} class={`relative flex flex-col bg-white dark:bg-[#0c0d0e] ${workspaceFullscreen || normalHeightPx !== null ? 'h-full min-h-0 overflow-hidden' : ''}`}>
                {rightDrop.isDragging && (
                  <div class="absolute inset-0 border-2 border-dashed border-[#111111] dark:border-[#f0f0f2] rounded-xl pointer-events-none z-20" />
                )}
                <Panel
                  title={t('compare.titleRight')}
                  filename={rightDoc.filename}
                  lineCount={rightDoc.lineCount}
                  edited={rightDoc.edited}
                  accept={ACCEPT_JSON_TXT}
                  onFile={applyRightFile}
                  onError={handleFileError}
                  fileAriaLabel={t('compare.ariaChooseFileRight')}
                  onClear={handleClearRight}
                  onCopy={() => handleCopy(rightDoc.text, 'right JSON')}
                  onDownload={() => handleDownload(rightDoc.text, rightDoc.filename, 'right')}
                  class={workspaceFullscreen || normalHeightPx !== null ? 'h-full' : ''}
                >
                  <EditorTextarea
                    value={rightDoc.text}
                    onInput={(v) => { rightActions.setText(v); }}
                    placeholder={t('compare.placeholderRight')}
                    ariaLabel={t('compare.ariaEditorRight')}
                    fillHeight={workspaceFullscreen || normalHeightPx !== null}
                  />
                </Panel>
              </div>
            </div>

            {/* Draggable Height Resize Handle */}
            <ResizeHandle
              onDrag={handleResizeDrag}
              onReset={handleResizeReset}
              onKeyAdjust={handleResizeKeyAdjust}
              onGoToMin={handleGoToMin}
              onGoToMax={handleGoToMax}
              valueNow={workspaceFullscreen ? Math.round(topRatio * 100) : (normalHeightPx ? Math.round(normalHeightPx) : 40)}
              valueMin={workspaceFullscreen ? 15 : 120}
              valueMax={workspaceFullscreen ? 85 : Math.round(typeof window !== 'undefined' ? window.innerHeight * 0.8 : 800)}
            />

            {/* Visual Diff Output Viewport */}
              <Panel
                title={t('compare.titleDiff')}
                lineCount={lines.length}
              actions={viewPills(activeView)}
              onCopy={handleCopyDiffReport}
              onDownload={() => {
                const report = { timestamp: new Date().toISOString(), stats, patches: patchResult };
                downloadText(JSON.stringify(report, null, 2), 'diff-report.json', 'application/json');
                showToast(t('compare.toastDownloadedReport'));
              }}
              class={workspaceFullscreen ? 'flex-1 min-h-0 overflow-hidden' : ''}
            >
              <>
                {activeView !== 'patch' && <DiffTable lines={lines} view={activeView} />}
                {activeView === 'patch' && (
                  <div class={`p-4 sm:p-6 bg-[#fafafa] dark:bg-[#111215] transition-colors ${workspaceFullscreen ? 'h-full flex flex-col min-h-0' : ''}`}>
                    <div class="flex items-center justify-between mb-3 shrink-0">
                      <span class="text-xs font-semibold text-[#111111] dark:text-[#f0f0f2]">
                        {t('compare.patchTitle', { n: formatNumber(patchResult.length) })}
                      </span>
                      <button
                        onClick={async () => {
                          const ok = await copyText(JSON.stringify(patchResult, null, 2));
                          showToast(ok ? t('compare.toastPatchCopied') : t('common.copyFailed'));
                        }}
                        class="px-3 py-1 rounded-full text-xs font-semibold bg-[#111111] text-white hover:bg-[#39393b] dark:bg-[#f0f0f2] dark:text-[#111111] dark:hover:bg-white transition-colors cursor-pointer"
                      >
                        {t('compare.btnCopyPatch')}
                      </button>
                    </div>
                    <pre class={`p-4 rounded-xl bg-white dark:bg-[#121316] border border-[#e5e5e5] dark:border-[#22242a] font-mono text-xs overflow-x-auto text-[#111111] dark:text-[#f0f0f2] ${workspaceFullscreen ? 'flex-1 min-h-0 overflow-auto' : 'max-h-[500px]'}`}>
                      {patchResult.length > 0
                        ? JSON.stringify(patchResult, null, 2)
                        : t('compare.patchNone')}
                    </pre>
                  </div>
                )}
              </>
            </Panel>
          </div>
        </PanelFullscreenContext.Provider>
      </div>
    </>
  );
}

