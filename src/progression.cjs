const fs = require('node:fs/promises');
const path = require('node:path');

// App-specific growth rules; each species can have its own evolution later.
const species = {
  pikachu: { name: '피카츄', label: 'PIKACHU', id: 25, evolution: { level: 5, species: 'raichu' } },
  raichu: { name: '라이츄', label: 'RAICHU', id: 26 },
};
const TOKENS_PER_EXP = 100;
const EXP_PER_LEVEL = 100;
function snapshot(totalTokens) {
  if (!Number.isSafeInteger(totalTokens) || totalTokens < 0) throw new Error('Invalid token total');
  const totalExp = Math.floor(totalTokens / TOKENS_PER_EXP);
  const level = 1 + Math.floor(totalExp / EXP_PER_LEVEL);
  const kind = level >= species.pikachu.evolution.level ? species.pikachu.evolution.species : 'pikachu';
  return { totalTokens, totalExp, level, species: kind, name: species[kind].name,
    label: species[kind].label, exp: totalExp % EXP_PER_LEVEL, nextExp: EXP_PER_LEVEL,
    evolutionLevel: species.pikachu.evolution.level, tokensPerExp: TOKENS_PER_EXP };
}
function createProgression(directory) {
  const filename = path.join(directory, 'progress.json');
  let total = 0;
  let queue = Promise.resolve();
  const loaded = (async () => {
    try {
      const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
      if (saved.version !== 1) throw new Error('Unsupported progress version');
      total = snapshot(saved.totalTokens).totalTokens;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  })();
  return {
    async get() { await loaded; await queue; return snapshot(total); },
    reset() {
      const operation = queue.then(async () => {
        await loaded;
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, 'progress-before-reset.json'), JSON.stringify({ version: 1, totalTokens: total }));
        await fs.writeFile(`${filename}.tmp`, JSON.stringify({ version: 1, totalTokens: 0 }));
        await fs.rename(`${filename}.tmp`, filename);
        total = 0;
        return snapshot(total);
      });
      queue = operation.catch(() => {});
      return operation;
    },
    add(tokens) {
      const operation = queue.then(async () => {
        await loaded;
        if (!Number.isSafeInteger(tokens) || tokens <= 0 || tokens > 1000000) throw new Error('Tokens must be an integer from 1 to 1000000');
        const next = snapshot(total + tokens);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(`${filename}.tmp`, JSON.stringify({ version: 1, totalTokens: next.totalTokens }));
        await fs.rename(`${filename}.tmp`, filename);
        total = next.totalTokens;
        return next;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
module.exports = { species, snapshot, createProgression };
