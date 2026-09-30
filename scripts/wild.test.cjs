const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const config = require('../src/wild-encounters.json');
const species = require('../src/species.json');
const { createWildTable, isEligible, validDay, localDay } = require('../src/wild.cjs');
const { createProgression } = require('../src/progression.cjs');
const { captureChance } = require('../src/wild.cjs');

test('capture rates reflect rarity and ball grade with a 95% ceiling', () => {
  for (const [rarity, expected] of Object.entries({ common: [0.6, 0.9, 0.95], uncommon: [0.4, 0.6, 0.8], rare: [0.2, 0.3, 0.4], ultra: [0.08, 0.12, 0.16] })) {
    ['poke-ball', 'great-ball', 'ultra-ball'].forEach((ball, i) => assert.ok(Math.abs(captureChance(rarity, ball) - expected[i]) < 1e-12));
  }
  assert.throws(() => captureChance('common', 'fire-stone'));
});

test('capture consumes one ball, retries failures, adds party and persists without duplicate captures', async t => {
  const f = await fixture(t);
  let state = await f.store.claimDailyReward();
  const expected = () => ({ ...state.wildEncounter, revision: state.revision });
  const failed = await f.store.capture('poke-ball', expected());
  assert.equal(failed.caught, false);
  assert.equal(failed.progress.inventory['poke-ball'], 0);
  assert.equal(failed.progress.party.length, 1);
  state = failed.progress;
  await assert.rejects(f.store.capture('poke-ball', expected()));
  await f.store.setDemoBalance(100000);
  state = await f.store.buy('ultra-ball');
  const successStore = createProgression(f.dir, f.now, () => 0);
  const results = await Promise.allSettled([successStore.capture('ultra-ball', expected()), successStore.capture('ultra-ball', expected())]);
  assert.equal(results[0].value.caught, true);
  assert.equal(results[1].status, 'rejected');
  state = results[0].value.progress;
  assert.equal(state.species, 'pikachu');
  assert.equal(state.inventory['ultra-ball'], 0);
  assert.equal(state.party.some(member => member.starter === state.wildEncounter.species), true);
  const reloaded = createProgression(f.dir, f.now);
  assert.deepEqual(await reloaded.claimDailyReward(), state);
  await assert.rejects(reloaded.capture('poke-ball', expected()));
  assert.equal((await reloaded.select(state.wildEncounter.species)).level, 1);
});

test('capture rejects stale and invalid requests and save failures never consume inventory', async t => {
  const f = await fixture(t);
  const before = await f.store.claimDailyReward();
  const store = createProgression(f.dir, f.now, () => 0);
  const expected = { ...before.wildEncounter, revision: before.revision };
  await assert.rejects(store.capture('fire-stone', expected));
  await assert.rejects(store.capture('poke-ball', { ...expected, revision: 0 }));
  await fs.mkdir(path.join(f.dir, 'progress.json.tmp'));
  await assert.rejects(store.capture('poke-ball', expected));
  assert.deepEqual(await store.get(), before);
  await fs.rmdir(path.join(f.dir, 'progress.json.tmp'));
  f.setDate(new Date(2026, 8, 30));
  await assert.rejects(store.capture('poke-ball', expected));
  assert.deepEqual(await store.get(), before);
});

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokemon-wild-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let date = new Date(2026, 8, 29, 23, 59);
  let calls = 0;
  const now = () => date;
  const random = () => { calls++; return 0.9999; };
  const store = createProgression(dir, now, random);
  return { dir, store, now, random, setDate: value => { date = value; }, calls: () => calls };
}

test('encounters contain exactly 74 Gen I base forms, no evolutions or excluded legends', () => {
  const expected = Object.keys(species).filter(isEligible).sort();
  assert.equal(expected.length, 74);
  assert.deepEqual(Object.keys(config.pokemon).sort(), expected);
  for (const kind of ['ivysaur', 'raichu', 'gengar', 'vaporeon', 'articuno', 'zapdos', 'moltres', 'mew', 'mewtwo']) {
    assert.equal(isEligible(kind), false, kind);
    const invalid = structuredClone(config);
    invalid.pokemon[kind] = { rarity: 'common' };
    assert.throws(() => createWildTable(invalid));
  }
  for (const kind of ['pikachu', 'clefairy', 'jigglypuff', 'hitmonlee', 'jynx', 'snorlax']) assert.equal(isEligible(kind), true, 'Later generations do not change the Gen I base-form rule');
  for (const kind of ['bulbasaur', 'charmander', 'squirtle', 'farfetchd', 'lickitung', 'mr-mime', 'jynx', 'hitmonlee', 'hitmonchan', 'eevee', 'porygon']) assert.equal(config.pokemon[kind].rarity, 'rare');
  for (const kind of ['lapras', 'omanyte', 'kabuto', 'aerodactyl', 'snorlax']) assert.equal(config.pokemon[kind].rarity, 'ultra');
});

test('rarity draw has exact agreed weights and every member is reachable uniformly', () => {
  const table = createWildTable();
  const counts = { common: 0, uncommon: 0, rare: 0, ultra: 0 };
  for (let i = 0; i < 3100; i++) {
    const rolls = [(i + 0.5) / 3100, 0];
    counts[table.draw(() => rolls.shift()).rarity]++;
  }
  assert.deepEqual(counts, { common: 1760, uncommon: 930, rare: 310, ultra: 100 });
  assert.equal(counts.ultra / 3100, 1 / 31);
  let offset = 0;
  for (const [rarity, { weight }] of Object.entries(config.rarities)) {
    const members = Object.keys(config.pokemon).filter(kind => config.pokemon[kind].rarity === rarity);
    for (let i = 0; i < members.length; i++) {
      const rolls = [(offset + weight / 2) / 3100, (i + 0.5) / members.length];
      assert.equal(table.draw(() => rolls.shift()).species, members[i]);
    }
    offset += weight;
  }
  assert.equal(table.draw(() => 0).rarity, 'common');
  assert.equal(table.draw(() => 1 - Number.EPSILON).rarity, 'ultra');
  for (const invalid of [-1, 1, NaN, Infinity, '0']) assert.throws(() => table.draw(() => invalid));
});

test('daily encounter and ball commit once across parallel calls, reload, selection and resets', async t => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => f.store.claimDailyReward()));
  const first = results[0];
  for (const result of results) assert.deepEqual(result, first);
  assert.equal(f.calls(), 2);
  assert.equal(first.inventory['poke-ball'], 1);
  assert.equal(first.wildEncounter.date, '2026-09-29');
  assert.equal(first.wildEncounter.rarity, 'ultra');
  assert.equal(first.points, 0);
  assert.equal(first.balance, 0);
  assert.equal(first.species, 'pikachu');
  const reloaded = createProgression(f.dir, f.now, () => { throw Error('Must not reroll'); });
  assert.deepEqual((await reloaded.claimDailyReward()).wildEncounter, first.wildEncounter);
  await f.store.select('eevee');
  await f.store.reset();
  assert.deepEqual((await f.store.claimDailyReward()).wildEncounter, first.wildEncounter);
  first.wildEncounter.species = 'mew';
  assert.notEqual((await f.store.get()).wildEncounter.species, 'mew', 'Snapshots cannot mutate saved encounters');
});

test('local midnight refreshes once, missed days do not accumulate, rollback cannot reroll', async t => {
  const f = await fixture(t);
  await f.store.claimDailyReward();
  f.setDate(new Date(2026, 8, 30, 0, 0));
  const next = await f.store.claimDailyReward();
  assert.equal(next.wildEncounter.date, '2026-09-30');
  assert.equal(next.inventory['poke-ball'], 2);
  assert.equal(f.calls(), 4);
  f.setDate(new Date(2026, 9, 5));
  const later = await f.store.claimDailyReward();
  assert.equal(later.inventory['poke-ball'], 3);
  assert.equal(f.calls(), 6);
  f.setDate(new Date(2026, 8, 29));
  assert.deepEqual(await f.store.claimDailyReward(), later);
  assert.equal(f.calls(), 6);
  assert.equal(localDay(new Date(2026, 8, 30, 0, 1)), '2026-09-30');
});

test('existing daily ball claim gains an encounter without another ball, old growth migrates', async t => {
  const f = await fixture(t);
  await f.store.claimDailyReward();
  const file = path.join(f.dir, 'progress.json');
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  delete saved.wildEncounter;
  await fs.writeFile(file, JSON.stringify(saved));
  const migrated = await createProgression(f.dir, f.now, f.random).claimDailyReward();
  assert.equal(migrated.inventory['poke-ball'], 1);
  assert.ok(migrated.wildEncounter);
  assert.equal(migrated.points, 0);
  assert.equal(migrated.balance, 0);
});

test('save failure changes neither encounter nor reward; retry succeeds', async t => {
  const f = await fixture(t);
  const before = await f.store.get();
  const tmp = path.join(f.dir, 'progress.json.tmp');
  await fs.mkdir(tmp);
  await assert.rejects(f.store.claimDailyReward());
  assert.deepEqual(await f.store.get(), before);
  await fs.rmdir(tmp);
  const result = await f.store.claimDailyReward();
  assert.equal(result.inventory['poke-ball'], 1);
  assert.ok(result.wildEncounter);
});

test('corrupt encounter saves are rejected instead of silently overwritten', async t => {
  const f = await fixture(t);
  await f.store.claimDailyReward();
  const file = path.join(f.dir, 'progress.json');
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  for (const patch of [null, [], { date: '2026-02-30', species: 'pikachu', rarity: 'common' }, { date: '2026-09-29', species: 'raichu', rarity: 'rare' }, { date: '2026-09-29', species: 'mew', rarity: 'ultra' }, { date: '2026-09-29', species: 'pikachu', rarity: '__proto__' }]) {
    const raw = JSON.stringify({ ...saved, wildEncounter: patch });
    await fs.writeFile(file, raw);
    const store = createProgression(f.dir, f.now);
    await assert.rejects(store.claimDailyReward());
    assert.equal(await fs.readFile(file, 'utf8'), raw);
  }
  assert.equal(validDay('2024-02-29'), true);
  assert.equal(validDay('2026-02-29'), false);
});
const { fleeChance, validEncounter } = require('../src/wild.cjs');
test('flee thresholds apply to every rarity after failure only', async t => {
  for (const [rarity, rate] of Object.entries({ common: .1, uncommon: .2, rare: .3, ultra: .4 })) {
    assert.equal(fleeChance(rarity), rate);
    for (const [roll, fled] of [[rate - .00001, true], [rate, false]]) {
      const f = await fixture(t);
      await f.store.claimDailyReward();
      const file = path.join(f.dir, 'progress.json');
      const saved = JSON.parse(await fs.readFile(file, 'utf8'));
      saved.wildEncounter.rarity = rarity;
      await fs.writeFile(file, JSON.stringify(saved));
      const rolls = [.9999, roll];
      const store = createProgression(f.dir, f.now, () => rolls.shift());
      const before = await store.get();
      const result = await store.capture('poke-ball', { ...before.wildEncounter, revision: before.revision });
      assert.equal(result.fled, fled);
      assert.equal(result.caught, false);
      assert.equal(result.progress.inventory['poke-ball'], 0);
      assert.deepEqual(result.progress.party, before.party);
      const reloaded = createProgression(f.dir, f.now);
      assert.equal((await reloaded.claimDailyReward()).wildEncounter.fled, fled);
      if (fled) {
        await reloaded.setDemoBalance(100000);
        const stocked = await reloaded.buy('poke-ball');
        await assert.rejects(reloaded.capture('poke-ball', { ...stocked.wildEncounter, revision: stocked.revision }));
        await reloaded.reset();
        assert.equal((await reloaded.claimDailyReward()).wildEncounter.fled, true);
        f.setDate(new Date(2026, 8, 30));
        assert.equal((await reloaded.claimDailyReward()).wildEncounter.fled, undefined);
      }
    }
  }
  const f = await fixture(t);
  const before = await f.store.claimDailyReward();
  let calls = 0;
  const store = createProgression(f.dir, f.now, () => { assert.equal(++calls, 1); return 0; });
  const result = await store.capture('poke-ball', { ...before.wildEncounter, revision: before.revision });
  assert.equal(result.caught, true);
  assert.equal(result.fled, false);
});

test('flee save failure and invalid randomness preserve inventory and encounter', async t => {
  const f = await fixture(t);
  const before = await f.store.claimDailyReward();
  const expected = { ...before.wildEncounter, revision: before.revision };
  for (const fleeRoll of [NaN, 0]) {
    const rolls = [.99, fleeRoll];
    const store = createProgression(f.dir, f.now, () => rolls.shift());
    if (fleeRoll === 0) await fs.mkdir(path.join(f.dir, 'progress.json.tmp'));
    await assert.rejects(store.capture('poke-ball', expected));
    assert.deepEqual(await store.get(), before);
  }
  assert.equal(validEncounter({ ...before.wildEncounter, fled: 'yes' }), false);
  assert.equal(validEncounter({ ...before.wildEncounter, caught: true, fled: true }), false);
});
