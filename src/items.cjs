const species = require('./species.json');
const { evolutionItemPrice } = require('./tuning.cjs');

// Kanto item evolutions. Linking Cord replaces the four trade evolutions.
const items = {
  'fire-stone': { name: '불꽃의돌', symbol: '불', color: 'fire', targets: { vulpix: 'ninetales', growlithe: 'arcanine', eevee: 'flareon' } },
  'water-stone': { name: '물의돌', symbol: '물', color: 'water', targets: { poliwhirl: 'poliwrath', shellder: 'cloyster', staryu: 'starmie', eevee: 'vaporeon' } },
  'thunder-stone': { name: '천둥의돌', symbol: '번개', color: 'thunder', targets: { pikachu: 'raichu', eevee: 'jolteon' } },
  'leaf-stone': { name: '리프의돌', symbol: '풀', color: 'leaf', targets: { gloom: 'vileplume', weepinbell: 'victreebel', exeggcute: 'exeggutor' } },
  'moon-stone': { name: '달의돌', symbol: '달', color: 'moon', targets: { nidorina: 'nidoqueen', nidorino: 'nidoking', clefairy: 'clefable', jigglypuff: 'wigglytuff' } },
  'linking-cord': { name: '연결의끈', symbol: '끈', color: 'cord', targets: { kadabra: 'alakazam', machoke: 'machamp', graveler: 'golem', haunter: 'gengar' } },
};

function catalog(kind, inventory) {
  return Object.entries(items).map(([id, item]) => ({
    id, name: item.name, symbol: item.symbol, color: item.color,
    price: evolutionItemPrice, count: inventory[id] ?? 0,
    target: item.targets[kind] ?? null,
    targetName: species[item.targets[kind]]?.name ?? null,
  }));
}

function canReach(start, target) {
  if (start === target) return true;
  const next = [species[start].evolution?.species, ...Object.values(items).map(item => item.targets[start])].filter(Boolean);
  return next.some(kind => canReach(kind, target));
}

module.exports = { items, catalog, canReach };
