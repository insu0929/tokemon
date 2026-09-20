const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createProgression, pointsFor } = require('../src/progression.cjs');
const { items } = require('../src/items.cjs');
const { evolutionItemPrice: price } = require('../src/tuning.cjs');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokemon-items-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return { dir, store: createProgression(dir) };
}
test('tokens fund a shared wallet; purchases preserve EXP and persist quantities', async t => {
  const { dir, store } = await fixture(t);
  await store.add(30, 'demo');
  await store.add(40000, 'claude');
  const before = await store.add(59970, 'codex');
  assert.equal(before.balance, 100000);
  const bought = await store.buy('fire-stone');
  assert.equal(bought.balance, 0);
  assert.equal(bought.points, before.points);
  assert.equal(bought.level, before.level);
  assert.equal(bought.inventory['fire-stone'], 1);
  await store.select('eevee');
  const reloaded = await createProgression(dir).get();
  assert.equal(reloaded.inventory['fire-stone'], 1);
  assert.equal(reloaded.balance, 0);
  const evolved = await store.use('fire-stone', reloaded);
  assert.equal(evolved.species, 'flareon');
  assert.equal(evolved.inventory['fire-stone'], 0);
  assert.equal((await store.select('pikachu')).points, before.points);
});
test('all 20 stone/trade routes consume one item, retain EXP and retain form after restart', async t => {
  const { dir, store } = await fixture(t);
  await store.setDemoBalance(10000000);
  let routes = 0;
  for (const [id, item] of Object.entries(items)) {
    for (const [from, to] of Object.entries(item.targets)) {
      await store.select(from);
      await store.reset();
      const before = await store.add(12345);
      await store.buy(id);
      const after = await store.use(id, before);
      assert.equal(after.species, to, `${from} → ${to}`);
      assert.equal(after.starter, from);
      assert.equal(after.points, before.points);
      assert.equal(after.inventory[id], 0);
      assert.equal((await store.add(100)).species, to, 'EXP cannot revert item evolution');
      assert.equal((await createProgression(dir).get()).species, to);
      routes++;
    }
  }
  assert.equal(routes, 20);
});
test('level evolution followed by item evolution stays attached to original starter', async t => {
  const { store } = await fixture(t);
  await store.select('abra');
  await store.add(150000);
  const before = await store.get();
  assert.equal(before.species, 'kadabra');
  await store.buy('linking-cord');
  assert.equal((await store.use('linking-cord', before)).species, 'alakazam');
  await store.select('pikachu');
  assert.equal((await store.select('abra')).species, 'alakazam');
  const reset = await store.reset();
  assert.equal(reset.species, 'abra');
  assert.equal(reset.balance, 50000);
  assert.equal(reset.inventory['linking-cord'], 0, 'Reset does not refund consumed items');
});
test('insufficient funds, invalid IDs, incompatible and stale uses never spend anything', async t => {
  const { store } = await fixture(t);
  await assert.rejects(store.buy('moon-stone'));
  await store.setDemoBalance(price * 2);
  for (const id of ['__proto__', 'constructor', 'missing', null, 1, ['moon-stone']]) {
    await assert.rejects(store.buy(id));
    await assert.rejects(store.use(id, await store.get()));
  }
  await store.buy('moon-stone');
  let before = await store.get();
  await assert.rejects(store.use('moon-stone', before));
  assert.deepEqual(await store.get(), before);
  await store.buy('thunder-stone');
  before = await store.get();
  await store.select('eevee');
  const changed = await store.get();
  await assert.rejects(store.use('thunder-stone', before));
  await assert.rejects(store.use('thunder-stone'));
  assert.deepEqual(await store.get(), changed);
});
test('simultaneous purchases and uses cannot overspend or consume twice', async t => {
  const { store } = await fixture(t);
  await store.setDemoBalance(price);
  const results = await Promise.allSettled([store.buy('thunder-stone'), store.buy('thunder-stone')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const before = await store.get();
  const uses = await Promise.allSettled([store.use('thunder-stone', before), store.use('thunder-stone', before)]);
  assert.equal(uses.filter(r => r.status === 'fulfilled').length, 1);
  const after = await store.get();
  assert.equal(after.balance, 0);
  assert.equal(after.inventory['thunder-stone'], 0);
  assert.equal(after.species, 'raichu');
});
test('version 3 migration preserves all growth, starts a zero wallet and writes version 4', async t => {
  const { dir } = await fixture(t);
  const records = { pikachu: pointsFor('demo', 12345), abra: pointsFor('demo', 150000) };
  await fs.writeFile(path.join(dir, 'progress.json'), JSON.stringify({ version: 3, selected: 'abra', revision: 7, records }));
  const store = createProgression(dir);
  const initial = await store.get();
  assert.equal(initial.species, 'kadabra');
  assert.equal(initial.balance, 0);
  assert.deepEqual(initial.inventory, {});
  await store.setDemoBalance(price);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'progress.json'), 'utf8'));
  assert.deepEqual(saved.records, records);
  assert.equal(saved.version, 4);
});
test('demo balance editing changes no growth or inventory and validates numbers', async t => {
  const { dir, store } = await fixture(t);
  await store.add(100);
  const before = await store.get();
  for (const amount of [-1, 1.2, NaN, Infinity, '100', 1000000000001]) await assert.rejects(store.setDemoBalance(amount));
  assert.deepEqual(await store.get(), before);
  await store.setDemoBalance(1000000);
  const after = await createProgression(dir).get();
  assert.equal(after.balance, 1000000);
  assert.equal(after.points, before.points);
  assert.deepEqual(after.inventory, before.inventory);
  assert.equal((await store.setDemoBalance(0)).balance, 0);
});
test('failed save leaves both wallet and inventory unchanged', async t => {
  const { dir, store } = await fixture(t);
  await store.setDemoBalance(price);
  const before = await store.get();
  await fs.mkdir(path.join(dir, 'progress.json.tmp'));
  await assert.rejects(store.buy('thunder-stone'));
  assert.deepEqual(await store.get(), before);
  assert.deepEqual(await createProgression(dir).get(), before);
});
test('corrupt wallet, inventory and evolution saves cannot be silently overwritten', async t => {
  const { dir } = await fixture(t);
  const base = { version: 4, selected: 'pikachu', records: { pikachu: 0 }, revision: 0, balance: 0, inventory: {}, forms: {} };
  for (const patch of [{ balance: -1 }, { inventory: [] }, { inventory: { 'moon-stone': -1 } }, { forms: [] }, { forms: { pikachu: 'mew' } }]) {
    const raw = JSON.stringify({ ...base, ...patch });
    await fs.writeFile(path.join(dir, 'progress.json'), raw);
    const store = createProgression(dir);
    await assert.rejects(store.get());
    await assert.rejects(store.setDemoBalance(100));
    assert.equal(await fs.readFile(path.join(dir, 'progress.json'), 'utf8'), raw);
  }
});
