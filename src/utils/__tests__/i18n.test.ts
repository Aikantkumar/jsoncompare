import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { localizedPath } from '../../i18n.ts';

describe('localizedPath', () => {
  it('English paths are unchanged', () => {
    assert.strictEqual(localizedPath('en', '/'), '/');
    assert.strictEqual(localizedPath('en', '/tools/json-formatter'), '/tools/json-formatter');
    assert.strictEqual(localizedPath('en', '/convert/yaml-to-json'), '/convert/yaml-to-json');
  });

  it('non-English paths get the language prefix', () => {
    assert.strictEqual(localizedPath('es', '/'), '/es');
    assert.strictEqual(localizedPath('es', '/tools/json-sorter'), '/es/tools/json-sorter');
    assert.strictEqual(localizedPath('de', '/'), '/de');
    assert.strictEqual(localizedPath('de', '/about'), '/de/about');
    assert.strictEqual(localizedPath('zh', '/convert/json-to-yaml'), '/zh/convert/json-to-yaml');
  });

  it('the home page has no trailing slash', () => {
    assert.strictEqual(localizedPath('es', '/'), '/es');
    assert.strictEqual(localizedPath('pt', '/'), '/pt');
    assert.notStrictEqual(localizedPath('es', '/'), '/es/');
  });
});
