const fs = require('node:fs/promises');
const path = require('node:path');
const tuning = require('./tuning.cjs');
const { items, catalog, canReach } = require('./items.cjs');

const species = require('./species.json');
// Progress is kept in fixed-point EXP so sources with different token rates share one monster.
const POINTS_PER_EXP = 1000000;
const V1_TOKENS_PER_EXP = 100;
const EXP_PER_LEVEL = tuning.expPerLevel;
const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function pointsFor(source, tokens) {
  if (!Object.hasOwn(tuning.tokensPerExp, source)) throw new Error('Unknown token source');
  return Math.round(tokens * POINTS_PER_EXP / tuning.tokensPerExp[source]);
}
function snapshot(points, starter = 'pikachu', revision = 0) {
  if (!Number.isSafeInteger(points) || points < 0) throw new Error('Invalid progress');
  if (!Object.hasOwn(species, starter)) throw new Error('Unknown species');
  const totalExp = Math.floor(points / POINTS_PER_EXP);
  const level = 1 + Math.floor(totalExp / EXP_PER_LEVEL);
  let kind = starter;
  while (species[kind].evolution && level >= species[kind].evolution.level) kind = species[kind].evolution.species;
  return { points, totalExp, level, starter, revision, species: kind, name: species[kind].name,
    label: species[kind].label, exp: totalExp % EXP_PER_LEVEL, nextExp: EXP_PER_LEVEL,
    evolutionLevel: species[kind].evolution?.level ?? null };
}
function createProgression(directory) {
  const filename = path.join(directory, 'progress.json');
  let state = { version: 4, selected: 'pikachu', records: { pikachu: 0 }, revision: 0, balance: 0, inventory: {}, forms: {} };
  const current = () => {
    const result = snapshot(state.records[state.selected], state.forms[state.selected] ?? state.selected, state.revision);
    return { ...result, starter: state.selected, balance: state.balance, inventory: { ...state.inventory }, items: catalog(result.species, state.inventory) };
  };
  let queue = Promise.resolve();
  const loaded = (async () => {
    try {
      const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
      // Version 1 stored demo tokens at a fixed 100 tokens per EXP.
      if (saved.version === 1 || saved.version === 2) {
        const points = snapshot(saved.version === 1 ? saved.totalTokens * (POINTS_PER_EXP / V1_TOKENS_PER_EXP) : saved.points).points;
        const selected = points >= 400 * POINTS_PER_EXP ? 'raichu' : 'pikachu';
        state = { ...state, selected, records: { [selected]: points } };
      } else if (saved.version === 3 || saved.version === 4) {
        if (!isMap(saved.records) || typeof saved.selected !== 'string' || !Object.hasOwn(saved.records, saved.selected) || !Number.isSafeInteger(saved.revision) || saved.revision < 0) throw new Error('Invalid progress');
        for (const [kind, points] of Object.entries(saved.records)) snapshot(points, kind);
        if (saved.version === 4) {
          if (!Number.isSafeInteger(saved.balance) || saved.balance < 0 || !isMap(saved.inventory) || !isMap(saved.forms)) throw new Error('Invalid wallet');
          for (const [id, count] of Object.entries(saved.inventory)) {
            if (!Object.hasOwn(items, id) || !Number.isSafeInteger(count) || count < 0) throw new Error('Invalid inventory');
          }
          for (const [kind, form] of Object.entries(saved.forms)) {
            if (!Object.hasOwn(saved.records, kind) || typeof form !== 'string' || !Object.hasOwn(species, form) || !canReach(kind, form)) throw new Error('Invalid evolution');
          }
        }
        state = { ...state, ...saved, version: 4 };
        if (saved.version === 3) Object.assign(state, { balance: 0, inventory: {}, forms: {} });
      } else throw new Error('Unsupported progress version');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  })();
  async function write(next) {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(`${filename}.tmp`, JSON.stringify(next));
    await fs.rename(`${filename}.tmp`, filename);
  }
  return {
    async get() { await loaded; await queue; return current(); },
    select(kind) {
      const operation = queue.then(async () => {
        await loaded;
        if (!Object.hasOwn(species, kind)) throw new Error('Unknown species');
        const next = { ...state, selected: kind, records: { ...state.records, [kind]: state.records[kind] ?? 0 }, revision: state.revision + 1 };
        await write(next);
        state = next;
        return current();
      });
      queue = operation.catch(() => {});
      return operation;
    },
    reset() {
      const operation = queue.then(async () => {
        await loaded;
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, 'progress-before-reset.json'), JSON.stringify(state));
        const forms = { ...state.forms };
        delete forms[state.selected];
        const next = { ...state, forms, records: { ...state.records, [state.selected]: 0 }, revision: state.revision + 1 };
        await write(next);
        state = next;
        return current();
      });
      queue = operation.catch(() => {});
      return operation;
    },
    add(tokens, source = 'demo') {
      const operation = queue.then(async () => {
        await loaded;
        if (!Number.isSafeInteger(tokens) || tokens <= 0) throw new Error('Tokens must be a positive integer');
        // Typed demo input stays small; linked usage may catch up millions at once.
        if (source === 'demo' && tokens > 1000000) throw new Error('Tokens must be an integer from 1 to 1000000');
        const result = snapshot(state.records[state.selected] + pointsFor(source, tokens), state.selected, state.revision + 1);
        const balance = state.balance + tokens;
        if (!Number.isSafeInteger(balance)) throw new Error('Token balance overflow');
        const next = { ...state, balance, records: { ...state.records, [state.selected]: result.points }, revision: result.revision };
        await write(next);
        state = next;
        return current();
      });
      queue = operation.catch(() => {});
      return operation;
    },
    setDemoBalance(balance) {
      const operation = queue.then(async () => {
        await loaded;
        if (!Number.isSafeInteger(balance) || balance < 0 || balance > 1000000000000) throw new Error('체험 잔액은 0부터 1조 사이의 정수로 입력해 주세요.');
        const next = { ...state, balance, revision: state.revision + 1 };
        await write(next);
        state = next;
        return current();
      });
      queue = operation.catch(() => {});
      return operation;
    },
    buy(id) {
      const operation = queue.then(async () => {
        await loaded;
        if (typeof id !== 'string' || !Object.hasOwn(items, id)) throw new Error('알 수 없는 아이템이에요.');
        if (state.balance < tuning.evolutionItemPrice) throw new Error('토큰이 부족해요.');
        const count = (state.inventory[id] ?? 0) + 1;
        if (!Number.isSafeInteger(count)) throw new Error('가방에 더 담을 수 없어요.');
        const next = { ...state, balance: state.balance - tuning.evolutionItemPrice,
          inventory: { ...state.inventory, [id]: count }, revision: state.revision + 1 };
        await write(next);
        state = next;
        return current();
      });
      queue = operation.catch(() => {});
      return operation;
    },
    use(id, expected) {
      const operation = queue.then(async () => {
        await loaded;
        if (typeof id !== 'string' || !Object.hasOwn(items, id)) throw new Error('알 수 없는 아이템이에요.');
        const before = current();
        if (!expected || expected.starter !== before.starter || expected.species !== before.species) throw new Error('포켓몬이 바뀌었어요. 가방을 다시 확인해 주세요.');
        const target = items[id].targets[before.species];
        if (!target) throw new Error('이 포켓몬에게 사용할 수 없어요.');
        if (!(state.inventory[id] > 0)) throw new Error('보유한 아이템이 없어요.');
        const next = { ...state, forms: { ...state.forms, [state.selected]: target },
          inventory: { ...state.inventory, [id]: state.inventory[id] - 1 }, revision: state.revision + 1 };
        await write(next);
        state = next;
        return current();
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
module.exports = { species, snapshot, pointsFor, createProgression };
