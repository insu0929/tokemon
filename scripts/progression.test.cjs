const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { snapshot, createProgression } = require('../src/progression.cjs');

test('level/evolution boundaries and excess experience', () => {
  assert.equal(snapshot(99).totalExp, 0);
  assert.equal(snapshot(100).totalExp, 1);
  assert.equal(snapshot(9999).level, 1);
  assert.equal(snapshot(10000).level, 2);
  assert.equal(snapshot(39999).species, 'pikachu');
  assert.equal(snapshot(40000).species, 'raichu');
  assert.equal(snapshot(52345).exp, 23);
  assert.equal(snapshot(1000000).level, 101);
});
test('serial writes, token remainder, invalid input and restart persistence', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokemon-growth-'));
  const store = createProgression(dir);
  await Promise.all([store.add(99), store.add(1), store.add(39900)]);
  assert.equal((await store.get()).totalTokens, 40000);
  for (const input of [-1, 0, 1.5, NaN, Infinity, '100', 1000001]) await assert.rejects(store.add(input));
  assert.equal((await createProgression(dir).get()).species, 'raichu');
  await store.add(100);
  assert.equal((await store.get()).exp, 1);
});
test('corrupt saves are reported rather than silently overwritten', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokemon-corrupt-'));
  await fs.writeFile(path.join(dir, 'progress.json'), '{broken');
  const store = createProgression(dir);
  await assert.rejects(store.get());
  await assert.rejects(store.add(100));
  assert.equal(await fs.readFile(path.join(dir, 'progress.json'), 'utf8'), '{broken');
});
