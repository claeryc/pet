"""Turns the web game's text-grid pixel icons (src/ui/icons.ts) into PNGs
for the Godot prototype, so both versions show the very same art.
Run from the repository root: python3 godot-prototype/tools/export_icons.py"""
import re, sys
from PIL import Image

PAL = dict(re.findall(r"^\s+(\w+): '(#[0-9a-f]{6})'", open('src/render/palette.ts').read(), re.M))
LETTERS = {'k':'ink','w':'white','r':'rose','p':'pink','g':'leaf','m':'mint','b':'ocean','s':'sky',
           'y':'butter','c':'cocoa','o':'peach','l':'lilac','v':'lavender','e':'cream','u':'plum'}
WANT = ['gold','hunger','happiness','health','energy','riceBall','strawberry','cookie','cuddle','tickle',
        'cooking','shop','map','journal','collection','skills','familyTree','guide','settings','letter','shrimp','salmon','lobster']
src = open('src/ui/icons.ts').read()
out = sys.argv[1] if len(sys.argv) > 1 else 'godot-prototype/art/icons'
# "--all" as a second argument exports every icon in icons.ts, not just WANT.
if len(sys.argv) > 2 and sys.argv[2] == '--all':
    WANT = re.findall(r"\n\s+(\w+): pixelIcon\(", src)
for name in WANT:
    m = re.search(r"\n\s+" + name + r": pixelIcon\(\s*\[(.*?)\]\s*(?:,\s*\{(.*?)\})?\s*,?\s*\)", src, re.S)
    if not m:
        print('missing', name); continue
    rows = re.findall(r"'([^']*)'", m.group(1))
    extra = {}
    if m.group(2):
        for ch, col in re.findall(r"(\w)\s*:\s*PALETTE\.(\w+)", m.group(2)):
            extra[ch] = PAL[col]
        for ch, col in re.findall(r"(\w)\s*:\s*'(#[0-9a-fA-F]{6})'", m.group(2)):
            extra[ch] = col
    img = Image.new('RGBA', (len(rows[0]), len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            col = extra.get(ch) or (PAL[LETTERS[ch]] if ch in LETTERS else None)
            if col:
                img.putpixel((x, y), tuple(int(col[i:i+2], 16) for i in (1, 3, 5)) + (255,))
    img.save(f'{out}/{name}.png')
    print(name, img.size)


# The four need icons, which show their own level in five steps (needIcons.ts):
# one sheet per need, 0 (empty) on the left to 4 (full) on the right.
NKEY = dict(re.findall(r"^\s+(\w): '(\w+)',", open('src/ui/needIcons.ts').read().split('const ROWS')[0], re.M))
need_src = open('src/ui/needIcons.ts').read().split('const ROWS')[1]
for need in ['hunger', 'happiness', 'health', 'energy']:
    block = need_src.split(need + ': [', 1)[1]
    frames = re.findall(r"\[\s*((?:'[^']*',?\s*)+)\]", block)[:5]
    grids = [re.findall(r"'([^']*)'", f) for f in frames]
    w, h = len(grids[0][0]), len(grids[0])
    sheet = Image.new('RGBA', (w * 5, h), (0, 0, 0, 0))
    for i, g in enumerate(grids):
        for y, row in enumerate(g):
            for x, ch in enumerate(row):
                if ch in NKEY:
                    c = PAL[NKEY[ch]]
                    sheet.putpixel((i * w + x, y), tuple(int(c[k:k+2], 16) for k in (1, 3, 5)) + (255,))
    sheet.save(f'{out}/need-{need}.png')
    print('need', need, sheet.size)
