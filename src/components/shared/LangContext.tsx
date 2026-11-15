/**
 * LangContext.tsx - Per-language UI strings for Preact islands.
 *
 * Languages are resolved statically from the `lang` prop passed by the Astro
 * page (there is no runtime language switching inside components). Unknown or
 * missing `lang` falls back to 'en'.
 */
import { createContext } from 'preact';
import { useContext, useCallback, useMemo } from 'preact/hooks';
import { LANGUAGES, DEFAULT_LANG } from '../../i18n';
import { en } from '../../locales/en';
import { es } from '../../locales/es';
import { zh } from '../../locales/zh';
import { ja } from '../../locales/ja';
import { fr } from '../../locales/fr';
import { de } from '../../locales/de';
import { pt } from '../../locales/pt';
import { ko } from '../../locales/ko';
import { it } from '../../locales/it';

export const LOCALES: Record<string, Record<string, string>> = {
  en,
  es,
  zh,
  ja,
  fr,
  de,
  pt,
  ko,
  it,
};

export interface LangContextValue {
  lang: string;
  t: (key: string, params?: Record<string, string>) => string;
  formatNumber: (n: number) => string;
}

const DEFAULT_CTX: LangContextValue = {
  lang: DEFAULT_LANG,
  t: (key) => key,
  formatNumber: (n) => String(n),
};

export const LangContext = createContext<LangContextValue>(DEFAULT_CTX);

export function LangProvider({ lang, children }: { lang?: string; children: unknown }) {
  const resolved = LANGUAGES[lang] !== undefined ? lang : DEFAULT_LANG;
  const dict = LOCALES[resolved] ?? LOCALES[DEFAULT_LANG] ?? {};
  const locale = LANGUAGES[resolved]?.locale ?? LANGUAGES[DEFAULT_LANG].locale;

  const t = useCallback(
    (key: string, params?: Record<string, string>): string => {
      let text = dict[key] ?? LOCALES[DEFAULT_LANG]?.[key] ?? key;
      if (params) {
        text = text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, name) => {
          return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`;
        });
      }
      return text;
    },
    [dict, resolved],
  );

  const formatNumber = useCallback(
    (n: number): string => {
      try {
        return new Intl.NumberFormat(locale).format(n);
      } catch {
        return String(n);
      }
    },
    [locale],
  );

  const value = useMemo<LangContextValue>(() => ({ lang: resolved, t, formatNumber }), [resolved, t, formatNumber]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT(): LangContextValue['t'] {
  return useContext(LangContext).t;
}

export function useLang(): string {
  return useContext(LangContext).lang;
}

export function useFormatNumber(): LangContextValue['formatNumber'] {
  return useContext(LangContext).formatNumber;
}
