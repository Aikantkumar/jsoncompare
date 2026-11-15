import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../../locales/en.ts';
import { es } from '../../locales/es.ts';
import { zh } from '../../locales/zh.ts';
import { ja } from '../../locales/ja.ts';
import { fr } from '../../locales/fr.ts';
import { de } from '../../locales/de.ts';
import { pt } from '../../locales/pt.ts';
import { ko } from '../../locales/ko.ts';
import { it as itLocale } from '../../locales/it.ts';

const LOCALES = { en, es, zh, ja, fr, de, pt, ko, it: itLocale };

function placeholders(value: string): string[] {
  const seen = new Set<string>();
  for (const m of value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) {
    seen.add(m[1]);
  }
  return [...seen];
}

describe('locales', () => {
  const enKeys = Object.keys(en);

  it('every locale has exactly the same keys as en', () => {
    for (const [code, dict] of Object.entries(LOCALES)) {
      const keys = Object.keys(dict);
      assert.deepStrictEqual(
        keys.sort(),
        enKeys.sort(),
        `${code} keys differ from en`
      );
    }
  });

  it('no value is empty', () => {
    for (const [code, dict] of Object.entries(LOCALES)) {
      for (const [key, value] of Object.entries(dict)) {
        assert.ok(value.length > 0, `${code}.${key} is empty`);
      }
    }
  });

  it('the set of placeholders matches en for each key', () => {
    for (const [code, dict] of Object.entries(LOCALES)) {
      for (const key of enKeys) {
        const enPh = placeholders(en[key]);
        const locPh = placeholders(dict[key]);
        assert.deepStrictEqual(
          locPh.sort(),
          enPh.sort(),
          `${code}.${key} placeholders mismatch: ${JSON.stringify(locPh)} vs ${JSON.stringify(enPh)}`
        );
      }
    }
  });
});
