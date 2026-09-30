const { randomInt } = require('node:crypto');
const species = require('./species.json');
const { items } = require('./items.cjs');
const config = require('./wild-encounters.json');

const excluded = new Set(['articuno', 'zapdos', 'moltres', 'mew', 'mewtwo']);
const evolved = new Set([
  ...Object.values(species).map(entry => entry.evolution?.species).filter(Boolean),
  ...Object.values(items).flatMap(item => Object.values(item.targets)),
]);
const isEligible = kind => typeof kind === 'string' && Object.hasOwn(species, kind) && !evolved.has(kind) && !excluded.has(kind);
const random = () => randomInt(0x100000000) / 0x100000000;
const catchRates = { common: 0.6, uncommon: 0.4, rare: 0.2, ultra: 0.08 };
const fleeRates = { common: 0.1, uncommon: 0.2, rare: 0.3, ultra: 0.4 };
function fleeChance(rarity) {
  if (!Object.hasOwn(fleeRates, rarity)) throw new Error('Invalid wild rarity');
  return fleeRates[rarity];
}
const ballMultipliers = { 'poke-ball': 1, 'great-ball': 1.5, 'ultra-ball': 2 };
function captureChance(rarity, ball) {
  if (!Object.hasOwn(catchRates, rarity) || !Object.hasOwn(ballMultipliers, ball)) throw new Error('Invalid capture');
  return Math.min(0.95, catchRates[rarity] * ballMultipliers[ball]);
}

function createWildTable(settings = config) {
  const groups = Object.entries(settings.rarities).map(([rarity, entry]) => {
    if (!['common', 'uncommon', 'rare', 'ultra'].includes(rarity) || !Number.isSafeInteger(entry.weight) || entry.weight <= 0) throw new Error('Invalid wild rarity');
    return { rarity, weight: entry.weight, pokemon: [] };
  });
  for (const [kind, entry] of Object.entries(settings.pokemon)) {
    const group = groups.find(group => group.rarity === entry.rarity);
    if (!isEligible(kind) || !group) throw new Error(`Invalid wild species: ${kind}`);
    group.pokemon.push(kind);
  }
  const total = groups.reduce((sum, group) => sum + group.weight, 0);
  if (!groups.length || groups.some(group => !group.pokemon.length) || !Number.isSafeInteger(total)) throw new Error('Invalid wild encounter table');
  return {
    draw(rng = random) {
      const next = () => {
        const value = rng();
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid random value');
        return value;
      };
      const roll = next() * total;
      let boundary = 0;
      const group = groups.find(group => { boundary += group.weight; return roll < boundary; });
      const kind = group.pokemon[Math.floor(next() * group.pokemon.length)];
      return { species: kind, rarity: group.rarity };
    },
  };
}

const table = createWildTable();
function localDay(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Invalid date');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validEncounter(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && validDay(value.date) && isEligible(value.species)
    && Object.hasOwn(config.rarities, value.rarity)
    && (value.caught === undefined || typeof value.caught === 'boolean')
    && (value.fled === undefined || typeof value.fled === 'boolean')
    && !(value.caught && value.fled);
}

module.exports = { fleeChance, captureChance, ballMultipliers, random, createWildTable, drawEncounter: rng => table.draw(rng), isEligible, localDay, validDay, validEncounter };
