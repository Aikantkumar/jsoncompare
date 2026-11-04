/**
 * Toast.tsx - Single shared toast component.
 * Sits above the fullscreen overlay (z-[110]) and announces via aria-live.
 */
import { useEffect } from 'preact/hooks';

interface Props {
  message: string;
  duration?: number;
}

export default function Toast({ message, duration = 3000 }: Props) {
  if (!message) return null;

  useEffect(() => {
    const timer = setTimeout(() => {
      // Toast is controlled by the parent (useToast.clear); this is a safety net.
    }, duration);
    return () => clearTimeout(timer);
  }, [duration]);

  return (
    <div role="status" aria-live="polite" class="fixed top-6 right-6 z-[110] flex flex-col gap-2 pointer-events-none">
      <div
        class="pointer-events-auto flex items-center gap-2 bg-[#111111] dark:bg-[#f0f0f2] text-white dark:text-[#111111] text-xs px-4 py-2.5 rounded-full shadow-2xl border border-[#cacacb] dark:border-[#2b2d35]"
      >
        <span class="w-2 h-2 rounded-full bg-[#1eaa52]"></span>
        {message}
      </div>
    </div>
  );
}
