import { useState } from 'preact/hooks';

export function Probe() {
  const [v, setV] = useState<string>('');
  return (
    <textarea
      value={v}
      onInput={(e) => setV((e.target as HTMLTextAreaElement).value)}
      placeholder="x"
      rows={10}
      spellcheck={false}
      class="p-3"
      readOnly={false}
    />
  );
}
