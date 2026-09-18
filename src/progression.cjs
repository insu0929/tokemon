const fs = require('node:fs/promises');
const path = require('node:path');
const tuning = require('./tuning.cjs');

const species = require('./species.json');
// Progress is kept in fixed-point EXP so sources with different token rates share one monster.
const POINTS_PER_EXP = 1000000;
const V1_TOKENS_PER_EXP = 100;
const EXP_PER_LEVEL = tuning.expPerLevel;
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
  let state = { version: 3, selected: 'pikachu', records: { pikachu: 0 }, revision: 0 };
  const current = () => snapshot(state.records[state.selected], state.selected, state.revision);
  let queue = Promise.resolve();
  const loaded = (async () => {
    try {
      const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
      // Version 1 stored demo tokens at a fixed 100 tokens per EXP.
      if (saved.version === 1 || saved.version === 2) {
        const points = snapshot(saved.version === 1 ? saved.totalTokens * (POINTS_PER_EXP / V1_TOKENS_PER_EXP) : saved.points).points;
        const selected = points >= 400 * POINTS_PER_EXP ? 'raichu' : 'pikachu';
        state = { version: 3, selected, records: { [selected]: points }, revision: 0 };
      } else if (saved.version === 3) {
        if (!saved.records || !Object.hasOwn(saved.records, saved.selected) || !Number.isSafeInteger(saved.revision) || saved.revision < 0) throw new Error('Invalid progress');
        for (const [kind, points] of Object.entries(saved.records)) snapshot(points, kind);
        state = saved;
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
        const next = { ...state, records: { ...state.records, [state.selected]: 0 }, revision: state.revision + 1 };
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
        const next = { ...state, records: { ...state.records, [state.selected]: result.points }, revision: result.revision };
        await write(next);
        state = next;
        return result;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
module.exports = { species, snapshot, pointsFor, createProgression };
