const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { snapshot, pointsFor, createProgression } = require('../src/progression.cjs');
const demo = tokens => snapshot(pointsFor('demo', tokens));

test('level/evolution boundaries and excess experience', () => {
  assert.equal(demo(99).totalExp, 0);
  assert.equal(demo(100).totalExp, 1);
  assert.equal(demo(9999).level, 1);
  assert.equal(demo(10000).level, 2);
  assert.equal(demo(39999).species, 'pikachu');
  assert.equal(demo(40000).species, 'raichu');
  assert.equal(demo(52345).exp, 23);
  assert.equal(demo(1000000).level, 101);
});
test('serial writes, token remainder, invalid input and restart persistence', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokemon-growth-'));
  const store = createProgression(dir);
  await Promise.all([store.add(99), store.add(1), store.add(39900)]);
  assert.equal((await store.get()).totalExp, 400);
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

test('reset restores Pikachu, preserves backup and serializes later additions', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokemon-reset-'));
  const store = createProgression(dir);
  await store.add(40000);
  const reset = await store.reset();
  assert.equal(reset.species, 'pikachu');
  assert.equal(reset.level, 1);
  assert.equal(reset.totalExp, 0);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'progress-before-reset.json'), 'utf8')).points, pointsFor('demo', 40000));
  assert.equal((await createProgression(dir).get()).points, 0);
  await Promise.all([store.add(40000), store.reset(), store.add(100)]);
  assert.equal((await store.get()).totalExp, 1);
});

test('linked sources use their own rate on the same monster, and version 1 saves migrate', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokemon-sources-'));
  await fs.writeFile(path.join(dir, 'progress.json'), JSON.stringify({ version: 1, totalTokens: 39950 }));
  const store = createProgression(dir);
  assert.equal((await store.get()).totalExp, 399, 'Version 1 tokens keep their EXP');
  assert.equal((await store.add(4999, 'claude')).species, 'pikachu', '50 demo tokens + 4,999 Claude tokens is just short of 1 EXP');
  assert.equal((await store.add(1, 'codex')).species, 'raichu');
  assert.equal((await store.add(3000000, 'claude')).level, 8, 'Linked usage may exceed the demo input limit');
  await assert.rejects(store.add(100, 'gemini'));
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'progress.json'), 'utf8')).version, 2);
  assert.equal((await createProgression(dir).get()).totalExp, 700);
});
