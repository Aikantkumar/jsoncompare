/**
 * ResultPre.tsx - Read-only large-output viewer.
 * Renders at most RESULT_PREVIEW_MAX_CHARS chars in a <pre>, with a
 * "Showing first N of M characters - Show all" notice when truncated.
 * Copy/Download always use the FULL string. Fullscreen-aware.
 */
import { useState, useCallback } from 'preact/hooks';
import { usePanelFullscreen } from './Panel';
import { copyText, downloadText } from '../../utils/download';

export const RESULT_PREVIEW_MAX_CHARS = 200_000;

interface Props {
  value: string;
  title?: string;
  copyLabel?: string;
  downloadName?: string;
  downloadMime?: string;
  rows?: number;
}

export default function ResultPre({
  value,
  title = 'Result Output',
  copyLabel = 'Copy',
  downloadName = 'result.json',
  downloadMime = 'application/json',
  rows = 12,
}: Props) {
  const { isFullscreen } = usePanelFullscreen();
  const [showAll, setShowAll] = useState<boolean>(false);

  const truncated = value.length > RESULT_PREVIEW_MAX_CHARS && !showAll;
  const display = truncated ? value.slice(0, RESULT_PREVIEW_MAX_CHARS) : value;

  const handleCopy = useCallback(async () => {
    const ok = await copyText(value);
    // Toast is owned by the parent via useToast; this just performs the copy.
    return ok;
  }, [value]);

  const handleDownload = useCallback(() => {
    downloadText(value, downloadName, downloadMime);
  }, [value, downloadName, downloadMime]);

  const base =
    'w-full font-mono text-xs leading-relaxed p-3 rounded-lg border focus:outline-none';
  const border = 'border-[#e5e5e5] dark:border-[#22242a]';
  const bg = 'bg-white dark:bg-[#121316]';
  const fg = 'text-[#111111] dark:text-[#f0f0f2]';
  const height = isFullscreen ? 'h-full min-h-0' : `h-auto min-h-[${rows * 28}px]`;
  const overflow = 'overflow-auto';

  return (
    <div class="flex flex-col min-h-0">
      {title && (
        <div class="flex items-center justify-between mb-1.5 px-3">
          <span class="text-[11px] font-semibold text-[#707072] dark:text-[#8e8e93] uppercase tracking-wide">
            {title}
          </span>
          <div class="flex items-center gap-2">
            <button
              onClick={handleCopy}
              class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
            >
              {copyLabel}
            </button>
            <button
              onClick={handleDownload}
              class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
            >
              Download
            </button>
          </div>
        </div>
      )}
      <pre class={`${base} ${border} ${bg} ${fg} ${height} ${overflow} whitespace-pre break-all`}>
        {display}
      </pre>
      {truncated && (
        <div class="px-3 py-1.5 text-[10px] text-[#b45309] dark:text-[#fde047] bg-[#fff4e5] dark:bg-[#3d2305]/20 border border-[#e5e5e5] dark:border-[#5c3a0a] rounded-t-none rounded-b-xl">
          Showing first {RESULT_PREVIEW_MAX_CHARS.toLocaleString()} of {value.length.toLocaleString()} characters{' '}
          <button
            onClick={() => setShowAll(true)}
            class="underline font-medium ml-1 hover:text-white dark:hover:text-white"
          >
            Show all
          </button>
        </div>
      )}
    </div>
  );
}
