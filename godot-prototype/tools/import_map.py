"""Copies the island and Backyard map art into the Godot prototype and
writes, for each map, a JSON file with every place's tap shape (as rows of
pixels), its bubble point and its pet point. The names and what each place
opens come from src/data/map.json.
Run from the repository root: python3 godot-prototype/tools/import_map.py"""
import json, re, shutil, os, glob

SRC = 'public/sprites/map'
OUT = 'godot-prototype'
os.makedirs(f'{OUT}/art/map', exist_ok=True)
os.makedirs(f'{OUT}/data/maps', exist_ok=True)
defs = json.load(open('src/data/map.json'))['maps']
for name in ['island', 'backyard']:
    for f in glob.glob(f'{SRC}/{name}*.png'):
        shutil.copy(f, f'{OUT}/art/map/')
    d = json.load(open(f'{SRC}/{name}.json'))
    out = {'width': d['width'], 'height': d['height'], 'night': d['night'], 'back': defs[name].get('back'),
           'extras': d.get('extras', []), 'areas': []}
    for a in defs[name]['areas']:
        at = d['areas'].get(a['id'])
        if not at:
            continue
        rows = [[int(x), int(y), int(w)] for x, y, w in re.findall(r'M(\d+) (\d+)h(\d+)v1h-\d+z', at['shape'])]
        out['areas'].append({'id': a['id'], 'name': a.get('name', a['id']), 'opens': a['opens'],
                             'box': at['box'], 'label': at['label'], 'pin': at['pin'], 'rows': rows})
    json.dump(out, open(f'{OUT}/data/maps/{name}.json', 'w'), separators=(',', ':'))
    print(name, [(a['id'], len(a['rows'])) for a in out['areas']])
