/**
 * EditorTextarea.tsx - The single textarea used by every editor panel.
 * Inline: default min-height + resize-y. Fullscreen: h-full min-h-0 resize-none,
 * filling the Panel body (Panel body is flex-1 min-h-0).
 * Light + dark variants on every element.
 */
import { useCallback } from 'preact/hooks';
import { usePanelFullscreen } from './Panel';

export const EDITOR_MIN_HEIGHT_PX = 163;

interface Props {
  value: string;
  onInput: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

export default function EditorTextarea({
  value,
  onInput,
  readOnly = false,
  placeholder = '',
  ariaLabel = 'JSON editor',
}: Props) {
  const { isFullscreen } = usePanelFullscreen();

  const handleInput = useCallback(
    (e: Event) => {
      const target = e.target as HTMLTextAreaElement;
      onInput(target.value);
    },
    [onInput]
  );

  const base =
    'w-full font-mono text-xs leading-relaxed p-3 rounded-lg border focus:outline-none focus:ring-1 focus:ring-[#111111] dark:focus:ring-white';
  const border = 'border-[#e5e5e5] dark:border-[#22242a]';
  const bg = 'bg-white dark:bg-[#121316]';
  const fg = 'text-[#111111] dark:text-[#f0f0f2]';
  const resize = isFullscreen ? 'resize-none' : 'resize-y';
  const height = isFullscreen ? 'h-full min-h-0' : 'h-auto';
  const heightStyle = isFullscreen ? undefined : { minHeight: `${EDITOR_MIN_HEIGHT_PX}px` };

  return (
    <textarea
      ref={undefined as any}
      readOnly={readOnly}
      value={value}
      onInput={handleInput}
      placeholder={placeholder}
      aria-label={ariaLabel}
      spellcheck={false}
      class={`${base} ${border} ${bg} ${fg} ${resize} ${height}`}
      style={heightStyle}
    />
  );
}
