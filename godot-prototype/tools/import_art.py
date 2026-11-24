"""Copies the web game's pet art into the Godot prototype and writes Godot
resources for it, so the prototype uses the very same sprite sheets.

For every pet listed in PETS it writes:
  art/pets/<id>.png         the sprite sheet, unchanged
  pets/<id>_frames.tres     a SpriteFrames (one animation per manifest row),
                            which the Godot editor's SpriteFrames panel opens
  pets/<id>.tres            a PetLook: the frames, the face set and point, and
                            how far the head moves in every frame
and for every face set used: art/faces/<set>.png and faces/<set>.tres.

Run from the repository root: python3 godot-prototype/tools/import_art.py
"""
import json, shutil, os
from PIL import Image

ROOT = 'public/sprites'
OUT = 'godot-prototype'
PETS = ['sprig', 'dumpling', 'acornet', 'pinchy', 'starhoot']
NAMES = json.load(open('src/data/characters.json'))
NAMES = {c['sheet']: c['name'] for c in NAMES['characters']}
EXPRESSIONS = ['content', 'happy', 'pouting', 'sad', 'crying', 'surprised', 'inLove', 'grumpy', 'sleepy', 'hungry', 'chewing', 'sick']
FACE_MS = dict(content=300, happy=300, pouting=500, sad=600, crying=300, surprised=300,
               inLove=350, grumpy=500, sleepy=700, hungry=400, chewing=180, sick=600)
FACE_ANCHOR = (16, 18)

m = json.load(open(f'{ROOT}/manifest.json'))
FW, FH = m['frameWidth'], m['frameHeight']


def sprite_frames(png_res, anims):
    """anims: list of (name, row, frames, frame_ms, loop)."""
    subs, entries = [], []
    for name, row, frames, ms, loop in anims:
        refs = []
        for f in range(frames):
            sid = f"{name.replace('-', '_')}_{f}"
            subs.append(f'[sub_resource type="AtlasTexture" id="{sid}"]\natlas = ExtResource("tex")\n'
                        f'region = Rect2({f * FW}, {row * FH}, {FW}, {FH})\n')
            refs.append(f'{{"duration": 1.0, "texture": SubResource("{sid}")}}')
        entries.append(f'{{"frames": [{", ".join(refs)}], "loop": {"true" if loop else "false"}, '
                       f'"name": &"{name}", "speed": {1000 / ms:.4f}}}')
    return ('[gd_resource type="SpriteFrames" format=3]\n\n'
            f'[ext_resource type="Texture2D" path="{png_res}" id="tex"]\n\n' + '\n'.join(subs) +
            '\n[resource]\nanimations = [' + ', '.join(entries) + ']\n')


def measure_head(img, anims, head, sideways):
    """Port of measureHead (src/render/sprites.ts)."""
    px = img.load()
    W, H = img.size
    def solid(row, frame, x, y):
        X, Y = frame * FW + x, row * FH + y
        return 0 <= x < FW and 0 <= y < FH and X < W and Y < H and px[X, Y][3] != 0
    def top_of(row, frame, cx):
        lowest = 0
        for x in range(cx - 2, cx + 3):
            y = 0
            while y < FH and not solid(row, frame, x, y): y += 1
            lowest = max(lowest, y)
        return lowest
    def span_at(row, frame, y):
        x = -1
        for d in range(5):
            if x >= 0: break
            if solid(row, frame, head['x'] - d, y): x = head['x'] - d
            elif solid(row, frame, head['x'] + d, y): x = head['x'] + d
        if x < 0: return None
        l = r = x
        while solid(row, frame, l - 1, y): l -= 1
        while solid(row, frame, r + 1, y): r += 1
        return l, r
    idle = anims['idle']
    base_top = top_of(idle['row'], 0, head['x'])
    base_span = span_at(idle['row'], 0, head['y'])
    offsets, shifts = {}, {}
    for name, a in anims.items():
        offsets[name], shifts[name] = [], []
        for f in range(a['frames']):
            dy = top_of(a['row'], f, head['x']) - base_top
            span = base_span and name in sideways and span_at(a['row'], f, head['y'] + dy)
            dx = 0
            if base_span and span:
                l, r = span[0] - base_span[0], span[1] - base_span[1]
                mid = (l + r) / 2
                if abs(l - mid) <= 1: dx = int(mid)
            offsets[name].append(top_of(a['row'], f, head['x'] + dx) - base_top if dx else dy)
            shifts[name].append(dx)
    return offsets, shifts


def gd_dict(d):
    return '{\n' + ',\n'.join(f'"{k}": [{", ".join(map(str, v))}]' for k, v in d.items()) + '\n}'


for d in ['art/pets', 'art/faces', 'pets', 'faces']:
    os.makedirs(f'{OUT}/{d}', exist_ok=True)

faces_used = set()
for pid in PETS:
    sheet = m['sheets'][pid]
    shape = m['shapes'].get(sheet.get('shape'), {})
    img = Image.open(f"{ROOT}/{sheet['file']}").convert('RGBA')
    shutil.copy(f"{ROOT}/{sheet['file']}", f'{OUT}/art/pets/{pid}.png')
    anims = dict(m['animations'])
    anims.update(sheet.get('animations', {}))
    moves = []
    sets = sheet.get('idleSet')
    for s in ([sets] if isinstance(sets, str) else sets or []):
        for name, a in m['idleSets'][s]['animations'].items():
            anims[name] = a
            moves.append(name)
    rows = img.size[1] // FH
    anims = {k: v for k, v in anims.items() if v['row'] < rows}
    with open(f'{OUT}/pets/{pid}_frames.tres', 'w') as f:
        f.write(sprite_frames(f'res://art/pets/{pid}.png',
                              [(k, a['row'], a['frames'], a['frameMs'], k not in moves) for k, a in anims.items()]))
    head = sheet.get('head') or shape.get('head')
    offsets, shifts = measure_head(img, anims, head, moves)
    for k, v in {**shape.get('headOffsets', {}), **sheet.get('headOffsets', {})}.items(): offsets[k] = v
    for k, v in {**shape.get('headShifts', {}), **sheet.get('headShifts', {})}.items(): shifts[k] = v
    face = sheet.get('face') or shape.get('face')
    face_set = sheet.get('faces') or shape.get('faces') or 'blob'
    if face: faces_used.add(face_set)
    lines = ['[gd_resource type="Resource" script_class="PetLook" format=3]', '',
             '[ext_resource type="Script" path="res://scripts/pet_look.gd" id="script"]',
             f'[ext_resource type="SpriteFrames" path="res://pets/{pid}_frames.tres" id="frames"]']
    if face:
        lines.append(f'[ext_resource type="SpriteFrames" path="res://faces/{face_set}.tres" id="faces"]')
    lines += ['', '[resource]', 'script = ExtResource("script")', f'display_name = "{NAMES.get(pid, pid.title())}"',
              'frames = ExtResource("frames")']
    if face:
        lines += ['face_frames = ExtResource("faces")', f'face_point = Vector2i({face["x"]}, {face["y"]})']
    lines += [f'head_offsets = {gd_dict(offsets)}', f'head_shifts = {gd_dict(shifts)}',
              'idle_moves = PackedStringArray(' + ', '.join(f'"{x}"' for x in moves) + ')']
    open(f'{OUT}/pets/{pid}.tres', 'w').write('\n'.join(lines) + '\n')
    print(pid, 'rows', rows, 'moves', moves, 'face', face_set if face else None)

for fs in sorted(faces_used):
    path = m['faceSets'][fs]['file']
    img = Image.open(f'{ROOT}/{path}').convert('RGBA')
    shutil.copy(f'{ROOT}/{path}', f'{OUT}/art/faces/{fs}.png')
    px = img.load(); W, H = img.size
    anims = []
    for r, name in enumerate(EXPRESSIONS):
        if (r + 1) * FH > H: continue
        n = 0
        for c in range(W // FW):
            if any(px[c * FW + x, r * FH + y][3] for x in range(FW) for y in range(FH)): n = c + 1
        if n: anims.append((name, r, n, FACE_MS[name], True))
    with open(f'{OUT}/faces/{fs}.tres', 'w') as f:
        f.write(sprite_frames(f'res://art/faces/{fs}.png', anims))
    print('faces', fs, [a[0] for a in anims])
