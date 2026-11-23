"""Turns the web game's text-grid pixel icons (src/ui/icons.ts) into PNGs
for the Godot prototype, so both versions show the very same art.
Run from the repository root: python3 godot-prototype/tools/export_icons.py"""
import re, sys
from PIL import Image

PAL = dict(re.findall(r"^\s+(\w+): '(#[0-9a-f]{6})'", open('src/render/palette.ts').read(), re.M))
LETTERS = {'k':'ink','w':'white','r':'rose','p':'pink','g':'leaf','m':'mint','b':'ocean','s':'sky',
           'y':'butter','c':'cocoa','o':'peach','l':'lilac','v':'lavender','e':'cream','u':'plum'}
WANT = ['gold','hunger','happiness','health','energy','riceBall','strawberry','cookie','cuddle','tickle']
src = open('src/ui/icons.ts').read()
out = sys.argv[1] if len(sys.argv) > 1 else 'godot-prototype/art/icons'
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
