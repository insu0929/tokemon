const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../src/i18n.js');
const species = require('../src/species.json');
const fs = require('node:fs');

test('all messages preserve placeholders in all four languages', () => {
  const placeholders = text => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  for (const [key, translations] of Object.entries(i18n.messages)) {
    for (const language of Object.keys(i18n.languages)) {
      assert.ok(translations[language]?.trim(), `${key}: ${language}`);
      assert.deepEqual(placeholders(translations[language]), placeholders(translations.ko), `${key}: ${language}`);
    }
  }
});

test('all 151 Pokémon names are available offline in every language', () => {
  for (const language of Object.keys(i18n.languages)) {
    i18n.setLanguage(language);
    for (const entry of Object.values(species)) assert.ok(i18n.names[entry.name][language]);
  }
  i18n.setLanguage('ja');
  assert.equal(i18n.name('피카츄'), 'ピカチュウ');
  i18n.setLanguage('zh-CN');
  assert.equal(i18n.name('피카츄'), '皮卡丘');
});

test('language validation, formatting, and source keys', () => {
  i18n.setLanguage('en');
  assert.equal(i18n.t('m23', 'Raichu'), 'Evolve into Raichu');
  assert.equal(i18n.name('천둥의돌'), 'Thunder Stone');
  for (const filename of ['renderer.js', 'main.cjs', 'index.html']) {
    const source = fs.readFileSync(require('node:path').join(__dirname, '../src', filename), 'utf8');
    for (const match of source.matchAll(/(?:t\('|'m|="m)(\d+)/g)) assert.ok(i18n.messages[`m${match[1]}`]);
  }
  for (const invalid of ['fr', '__proto__', null, {}, '']) {
    i18n.setLanguage(invalid);
    assert.equal(i18n.language, 'ko');
  }
});
