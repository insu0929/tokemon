const fs = require('node:fs/promises');
const path = require('node:path');
const tuning = require('./tuning.cjs');

// App-specific growth rules; each species can have its own evolution later.
const species = {
  pikachu: { name: '피카츄', label: 'PIKACHU', id: 25, evolution: { level: tuning.evolutionLevel, species: 'raichu' } },
  raichu: { name: '라이츄', label: 'RAICHU', id: 26 },
};
// Progress is kept in fixed-point EXP so sources with different token rates share one monster.
const POINTS_PER_EXP = 1000000;
const V1_TOKENS_PER_EXP = 100;
const EXP_PER_LEVEL = tuning.expPerLevel;
function pointsFor(source, tokens) {
  if (!Object.hasOwn(tuning.tokensPerExp, source)) throw new Error('Unknown token source');
  return Math.round(tokens * POINTS_PER_EXP / tuning.tokensPerExp[source]);
}
function snapshot(points) {
  if (!Number.isSafeInteger(points) || points < 0) throw new Error('Invalid progress');
  const totalExp = Math.floor(points / POINTS_PER_EXP);
  const level = 1 + Math.floor(totalExp / EXP_PER_LEVEL);
  const kind = level >= species.pikachu.evolution.level ? species.pikachu.evolution.species : 'pikachu';
  return { points, totalExp, level, species: kind, name: species[kind].name,
    label: species[kind].label, exp: totalExp % EXP_PER_LEVEL, nextExp: EXP_PER_LEVEL,
    evolutionLevel: species.pikachu.evolution.level };
}
function createProgression(directory) {
  const filename = path.join(directory, 'progress.json');
  let total = 0;
  let queue = Promise.resolve();
  const loaded = (async () => {
    try {
      const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
      // Version 1 stored demo tokens at a fixed 100 tokens per EXP.
      if (saved.version === 1) total = snapshot(saved.totalTokens * (POINTS_PER_EXP / V1_TOKENS_PER_EXP)).points;
      else if (saved.version === 2) total = snapshot(saved.points).points;
      else throw new Error('Unsupported progress version');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  })();
  async function write(points) {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(`${filename}.tmp`, JSON.stringify({ version: 2, points }));
    await fs.rename(`${filename}.tmp`, filename);
  }
  return {
    async get() { await loaded; await queue; return snapshot(total); },
    reset() {
      const operation = queue.then(async () => {
        await loaded;
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, 'progress-before-reset.json'), JSON.stringify({ version: 2, points: total }));
        await write(0);
        total = 0;
        return snapshot(total);
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
        const next = snapshot(total + pointsFor(source, tokens));
        await write(next.points);
        total = next.points;
        return next;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
module.exports = { species, snapshot, pointsFor, createProgression };
