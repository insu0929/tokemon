"""Refresh the bundled Kanto catalog and assets from PokeAPI's public data."""
import csv
import io
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://raw.githubusercontent.com/PokeAPI/'

def download(url):
    with urlopen(url, timeout=45) as response:
        return response.read()

def table(name):
    return list(csv.DictReader(io.StringIO(download(BASE + 'pokeapi/master/data/v2/csv/' + name + '.csv').decode('utf-8'))))

def main():
    rows = [r for r in table('pokemon_species') if 1 <= int(r['id']) <= 151]
    names = {(r['pokemon_species_id'], r['local_language_id']): r['name'] for r in table('pokemon_species_names')}
    catalog = {r['identifier']: {'id': int(r['id']), 'name': names[(r['id'], '3')], 'label': names[(r['id'], '9')].upper()} for r in rows}
    by_id = {r['id']: r for r in rows}
    # Only ordinary Kanto level evolutions: no regional forms or special conditions.
    for evo in table('pokemon_evolution'):
        target = by_id.get(evo['evolved_species_id'])
        if not target or evo['evolution_trigger_id'] != '1' or not evo['minimum_level']:
            continue
        parent = by_id.get(target['evolves_from_species_id'])
        if not parent:
            continue
        if any(evo.get(k) not in ('', '0') for k in ['trigger_item_id', 'gender_id', 'location_id', 'held_item_id', 'time_of_day', 'known_move_id', 'known_move_type_id', 'minimum_happiness', 'minimum_beauty', 'minimum_affection', 'relative_physical_stats', 'party_species_id', 'party_type_id', 'trade_species_id', 'needs_overworld_rain', 'turn_upside_down']):
            continue
        catalog[parent['identifier']]['evolution'] = {'level': int(evo['minimum_level']), 'species': target['identifier']}
    (ROOT / 'src/species.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tasks = []
    for kind, entry in catalog.items():
        ident = entry['id']
        tasks.extend([(kind + '.gif', BASE + f'sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/{ident}.gif'), (kind + '.ogg', BASE + f'cries/main/cries/pokemon/latest/{ident}.ogg')])
    def asset(task):
        filename, url = task
        dest = ROOT / 'assets' / filename
        if not dest.exists():
            data = download(url)
            assert data.startswith(b'GIF8' if filename.endswith('.gif') else b'OggS'), filename
            dest.write_bytes(data)
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(asset, tasks))
    print(f'Bundled {len(catalog)} species, {sum("evolution" in s for s in catalog.values())} level evolutions and {len(tasks)} assets.')

if __name__ == '__main__':
    main()
