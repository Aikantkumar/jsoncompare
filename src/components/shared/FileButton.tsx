/**
 * FileButton.tsx - Accessible local file picker.
 * A visible pill button triggers a hidden <input type="file"> via ref.click().
 * input.value is reset after every read so re-selecting the same file works.
 */
import { useRef, useCallback } from 'preact/hooks';
import { readTextFile } from '../../utils/fileIO';

interface Props {
  accept: string[];
  onFile: (result: { name: string; size: number; text: string; large: boolean }) => void;
  onError: (message: string) => void;
  label?: string;
}

export default function FileButton({ accept, onFile, onError, label = 'Choose file' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const open = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const result = await readTextFile(file, { accept });
        onFile(result);
      } catch (err: unknown) {
        onError(err instanceof Error ? err.message : 'Failed to read file');
      } finally {
        // Reset so re-selecting the same file fires onChange again.
        if (e.target) {
          e.target.value = '';
        }
      }
    },
    [accept, onFile, onError]
  );

  return (
    <>
      <button
        type="button"
        onClick={open}
        class="px-3 py-1 rounded-full text-xs font-medium bg-white dark:bg-[#18191d] border border-[#cacacb] dark:border-[#2b2d35] text-[#111111] dark:text-[#f0f0f2] hover:bg-[#111111] hover:text-white dark:hover:bg-[#f0f0f2] dark:hover:text-[#111111] transition-colors cursor-pointer"
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        class="sr-only"
        accept={accept.join(',')}
        onChange={handleChange}
      />
    </>
  );
}
