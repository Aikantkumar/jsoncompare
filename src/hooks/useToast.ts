/**
 * useToast.ts - Centralized toast state.
 * Replaces the 10 duplicated showToast implementations across tool pages.
 */
import { useState, useRef, useEffect, useCallback } from 'preact/hooks';

export interface UseToastReturn {
  message: string;
  show: (msg: string, duration?: number) => void;
  clear: () => void;
}

export function useToast(defaultDuration = 3000): UseToastReturn {
  const [message, setMessage] = useState<string>('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setMessage('');
  }, []);

  const show = useCallback(
    (msg: string, duration: number = defaultDuration) => {
      clear();
      setMessage(msg);
      if (duration > 0) {
        timerRef.current = setTimeout(clear, duration);
      }
    },
    [clear, defaultDuration]
  );

  // Clear the pending timeout on unmount.
  useEffect(() => () => clear(), [clear]);

  return { message, show, clear };
}
