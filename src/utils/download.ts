/**
 * download.ts - Safe client-side download / copy helpers.
 * Nothing is ever uploaded; files are created locally via Blob + anchor click.
 */

export function downloadText(text: string, filename: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for environments without clipboard permission.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Derive a download filename from a source name + suffix.
 * "users.json" + ".min" -> "users.min.json"
 * null -> fallback
 */
export function deriveDownloadName(sourceName: string | null, suffix: string, fallback: string): string {
  if (!sourceName) return fallback;
  const dotIdx = sourceName.lastIndexOf('.');
  if (dotIdx === -1) return `${sourceName}${suffix}`;
  return `${sourceName.slice(0, dotIdx)}${suffix}${sourceName.slice(dotIdx)}`;
}
