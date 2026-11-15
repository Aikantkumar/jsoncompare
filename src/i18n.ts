export interface Language {
  code: string;
  dir: string;
  label: string;
  locale: string;
  nativeName: string;
}

export const DEFAULT_LANG = 'en';

export const LANGUAGES: Record<string, Language> = {
  en: { code: 'en', dir: '', label: 'English', locale: 'en_US', nativeName: 'English' },
  es: { code: 'es', dir: 'es', label: 'Español', locale: 'es_ES', nativeName: 'Español' },
  zh: { code: 'zh-Hans', dir: 'zh', label: 'Chinese (Simplified)', locale: 'zh_CN', nativeName: '中文（简体）' },
  ja: { code: 'ja', dir: 'ja', label: 'Japanese', locale: 'ja_JP', nativeName: '日本語' },
  fr: { code: 'fr', dir: 'fr', label: 'French', locale: 'fr_FR', nativeName: 'Français' },
  de: { code: 'de', dir: 'de', label: 'German', locale: 'de_DE', nativeName: 'Deutsch' },
  pt: { code: 'pt', dir: 'pt', label: 'Portuguese', locale: 'pt_BR', nativeName: 'Português' },
  ko: { code: 'ko', dir: 'ko', label: 'Korean', locale: 'ko_KR', nativeName: '한국어' },
  it: { code: 'it', dir: 'it', label: 'Italian', locale: 'it_IT', nativeName: 'Italiano' },
};

export const LANG_LIST: Language[] = Object.values(LANGUAGES);

export function langDir(lang: string): string {
  const info = LANGUAGES[lang];
  return info && info.dir ? `/${info.dir}` : '';
}

export function hreflangUrl(lang: string, canonicalPath: string): string {
  const dir = langDir(lang);
  const path = canonicalPath === '/' ? '' : canonicalPath;
  return `https://jsoncompareonline.com${dir}${path}`;
}

export function isDefaultLang(lang: string): boolean {
  return lang === DEFAULT_LANG;
}

export function localizedPath(lang: string, path: string): string {
  if (isDefaultLang(lang)) return path;
  const dir = langDir(lang);
  if (path === '/') return dir;
  return dir + path;
}

export function otherLangs(currentLang: string): Language[] {
  return LANG_LIST.filter((l) => l.code !== currentLang);
}
