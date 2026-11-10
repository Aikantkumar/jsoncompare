/**
 * useDebouncedValue.ts - Debounce a value so expensive derives run at most
 * once every `ms` ms after the input stops changing.
 */
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    cancel();
    timerRef.current = setTimeout(() => {
      setDebounced(value);
      timerRef.current = null;
    }, ms);
    return cancel;
  }, [value, ms, cancel]);

  return debounced;
}
