"""Mossbun map art mockup: procedural pixel art (PIL).
Draws terrain + buildings at 195x422 art px (1 art px = 2 CSS px on a 390x844 phone).
Outputs scene PNGs + UI sprites into ./out/ ; compose.html + shot.js add the text chrome.
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
W, H = 195, 422


def hx(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def ramp(*cols):
    return [hx(c) for c in cols]


# ---- palette: the 20 base colours, each extended into a dark->light ramp -------------
INK = hx('2b2140')
PLUM = hx('5b3f6e')
R = dict(
    grass=ramp('2f6b5a', '3f8a6a', '57a982', '6cc19a', '8fd6a8', 'b6ecc0'),
    meadow=ramp('4f8f5a', '6aab64', '8cc873', 'a9dc84', 'c6ea97', 'e2f6b4'),
    home=ramp('3f8a6a', '5fb08a', '7fcfa6', '9be0b8', 'b9efcb', 'd8f8dd'),
    wheat=ramp('a8702f', 'cf9a44', 'eabf5c', 'f8d877', 'ffe596', 'fff3c2'),
    petal=ramp('b85f86', 'de86a3', 'f7a8b8', 'ffc3cf', 'ffdbe2', 'fff0f2'),
    sand=ramp('b98a5e', 'd9ab74', 'ecc98f', 'f6e2b3', 'fdf1d2'),
    path=ramp('a9794f', 'c99a66', 'e3bd85', 'f2d7a4', 'fbe9c4'),
    wood=ramp('3f2630', '5c3a2e', '8a5a44', 'b07a55', 'd39b6c', 'efc391'),
    cream=ramp('8f6f86', 'b99aa0', 'dcc0b4', 'f3e0cf', 'fff7ec', 'ffffff'),
    rose=ramp('5e2447', '7d2f52', 'a8405f', 'e05a7a', 'f48fb1', 'ffc0d0'),
    blue=ramp('2a3f78', '3a5d9c', '5a8fd6', '7fb2e8', '9ad3f0', 'd3f0fc'),
    slate=ramp('2b2140', '3d2e55', '5b3f6e', '7f63a0', 'a68bc9', 'd9c8ee'),
    stone=ramp('3a3355', '4b4266', '6f6890', '9a94b8', 'c4c0dc', 'e9e7f4'),
    butter=ramp('8a5326', 'b9782f', 'e0a441', 'f7cb5e', 'ffe596', 'fff6cf'),
    earth=ramp('3a2230', '56303a', '74443d', '8f5d47', 'ad7a55'),
    soil=ramp('3a2230', '4d2f33', '66403a', '80554a'),
    drysoil=ramp('7a5a4c', '96735f', 'b08d74', 'c8a88c'),
    cloud=ramp('a995c9', 'c6b6e2', 'e3d9f3', 'f4eefb', 'ffffff'),
    leaf=ramp('245848', '2f6b5a', '3f8a6a', '57a982', '7fcf96', 'b0eab0'),
    cherry=ramp('8f3f6c', 'b85f86', 'e386a8', 'f7a8c0', 'ffc8d8', 'ffe6ec'),
    orange=ramp('a8491f', 'd96a2a', 'f58f3c', 'ffb15e', 'ffd591'),
    honey=ramp('8a4a12', 'c47a1c', 'f0a52c', 'ffc94f', 'ffe89a'),
)
SEA = ramp('3f6cba', '4878c6', '5488d4', '6a9fe0', '86bcee', 'aadcf8', 'd8f3fd', 'ffffff')


def h2(x, y, s=0):
    n = (int(x) * 374761393 + int(y) * 668265263 + int(s) * 982451653) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffff) / 65535.0


def vnoise(w, h, cell, seed):
    rng = np.random.RandomState(seed)
    gw, gh = w // cell + 3, h // cell + 3
    g = (rng.rand(gh, gw) * 255).astype('uint8')
    im = Image.fromarray(g).resize((gw * cell, gh * cell), Image.BICUBIC)
    return np.asarray(im)[:h, :w].astype(float) / 255.0


def dist_out(mask, maxd):
    d = np.full(mask.shape, maxd + 1, float)
    d[mask] = 0
    cur = Image.fromarray((mask * 255).astype('uint8'))
    for i in range(1, maxd + 1):
        f = ImageFilter.MaxFilter(3) if i % 2 else ImageFilter.Kernel((3, 3), [0, 1, 0, 1, 1, 1, 0, 1, 0], scale=1)
        cur = cur.filter(f).point(lambda v: 255 if v else 0)
        a = np.asarray(cur) > 0
        d[a & (d > maxd)] = i
    return d


def mix(a, b, t):
    return tuple(int(round(a[i] * (1 - t) + b[i] * t)) for i in range(3)) + (255,)


# ---------------------------------------------------------------- terrain ----------
def build_terrain(poly, biome_seeds, paths, seed, ponds=(), cliff=9, sandw=(2, 8), plazas=()):
    big = Image.new('L', (W * 2, H * 2), 0)
    ImageDraw.Draw(big).polygon([(x * 2, y * 2) for x, y in poly], fill=255)
    f = np.asarray(big.filter(ImageFilter.GaussianBlur(7)).resize((W, H), Image.BILINEAR)).astype(float)
    n1 = vnoise(W, H, 9, seed)
    T = (f + (n1 - 0.5) * 60) > 128
    C = np.zeros_like(T)
    for k in range(1, cliff + 1):
        C[k:, :] |= T[:-k, :]
    C &= ~T
    base = T | C
    n2 = vnoise(W, H, 22, seed + 1)
    dob = dist_out(base, 12)
    sw = sandw[0] + n2 * (sandw[1] - sandw[0])
    Sd = (~base) & (dob <= sw) & (sw > 3.2)
    solid = base | Sd
    dw = dist_out(solid, 40)
    n3 = vnoise(W, H, 13, seed + 2)
    n4 = vnoise(W, H, 5, seed + 3)
    img = Image.new('RGBA', (W, H))
    px = img.load()
    din = dist_out(~T, 6)  # distance inside the top surface from its edge
    # paths
    pm = Image.new('L', (W * 2, H * 2), 0)
    pd = ImageDraw.Draw(pm)
    for pts, wd in paths:
        pp = [(x * 2, y * 2) for x, y in pts]
        wd = wd * 1.7
        pd.line(pp, fill=255, width=int(wd * 2), joint='curve')
        for x, y in pp:
            pd.ellipse([x - wd, y - wd, x + wd, y + wd], fill=255)
    for (cx, cy, rx, ry) in plazas:
        pd.ellipse([(cx - rx) * 2, (cy - ry) * 2, (cx + rx) * 2, (cy + ry) * 2], fill=255)
    pf = np.asarray(pm.filter(ImageFilter.GaussianBlur(2)).resize((W, H), Image.BILINEAR)).astype(float)
    P = ((pf + (n4 - 0.5) * 46) > 118) & T & (din > 2)
    dP = dist_out(~P, 3)
    dPo = dist_out(P, 2)
    # biome map
    bio = np.empty((H, W), dtype=object)
    for y in range(H):
        for x in range(W):
            if not T[y, x]:
                continue
            wx = x + (n3[y, x] - 0.5) * 26 + (h2(x, y, 5) - 0.5) * 3
            wy = y + (n1[y, x] - 0.5) * 26 + (h2(x, y, 6) - 0.5) * 3
            best, bd = None, 1e9
            for name, sx, sy, wgt in biome_seeds:
                d = math.hypot(wx - sx, wy - sy) / wgt
                if d < bd:
                    bd, best = d, name
            bio[y, x] = best
    for y in range(H):
        for x in range(W):
            if T[y, x]:
                b = bio[y, x]
                rp = R[b]
                v = n2[y, x] * 0.6 + n3[y, x] * 0.4 + (h2(x, y, 9) - 0.5) * 0.10
                i = 3
                if v > 0.60: i = 4
                if v < 0.40: i = 2
                if b == 'wheat':
                    row = (y + int((n3[y, x]) * 3)) % 4
                    i = 3 if row < 2 else 2
                    if row == 0 and h2(x, y, 3) < 0.5: i = 4
                    if row == 3 and h2(x, y, 4) < 0.3: i = 1
                if b == 'petal':
                    q = n4[y, x] * 0.5 + n3[y, x] * 0.5 + (h2(x, y, 2) - 0.5) * 0.25
                    if q < 0.47:
                        rp = R['home']; i = 3 if v > 0.45 else 2
                    else:
                        i = 3 if q < 0.62 else 4
                        if h2(x, y, 8) < 0.06: i = 5
                c = rp[i]
                # rim lighting on the plateau edge
                if not T[max(y - 1, 0), x] or (x > 0 and not T[y, x - 1]):
                    c = rp[5]
                elif din[y, x] <= 2 and (not T[max(y - 2, 0), x] or not T[y, max(x - 2, 0)]):
                    c = rp[4]
                if y + 1 < H and not T[y + 1, x]:
                    c = rp[1]
                elif x + 1 < W and not T[y, x + 1]:
                    c = rp[2]
                if P[y, x]:
                    pr = R['path']
                    c = pr[3]
                    if dP[y, x] <= 1: c = pr[2]
                    if not P[max(0, y - 1), x]: c = pr[1]
                    elif not P[max(0, y - 2), x] and h2(x, y, 14) < 0.6: c = pr[2]
                    if y + 1 < H and not P[y + 1, x]: c = pr[4]
                    if dP[y, x] >= 2 and h2(x, y, 11) < 0.10: c = pr[4]
                    if h2(x, y, 12) < 0.035: c = pr[1]
                elif dPo[y, x] == 1 and h2(x, y, 13) < 0.75:
                    c = rp[1] if (y > 0 and P[y - 1, x]) or h2(x, y, 15) < 0.4 else rp[2]
                px[x, y] = c
            elif C[y, x]:
                k = 0
                while y - k - 1 >= 0 and not T[y - k - 1, x]:
                    k += 1
                er = R['earth']
                col = int(x + n4[y, x] * 6)
                v = h2(col // 3, (y + (col // 3) * 2) // 4, 21)
                c = er[2] if v < 0.5 else er[3]
                if v > 0.85: c = er[4]
                if k <= 1: c = er[0]
                elif k == 2: c = er[1]
                if k >= cliff - 2 and h2(x, y, 4) < 0.5: c = er[1]
                if y + 1 < H and not base[y + 1, x]: c = er[0]
                if h2(col // 3, 0, 22) < 0.3 and k > 2 and col % 3 == 0: c = er[1]
                px[x, y] = c
            elif Sd[y, x]:
                sr = R['sand']
                c = sr[3]
                if h2(x, y, 31) < 0.08: c = sr[2]
                if h2(x, y, 32) < 0.05: c = sr[4]
                if dw[y, x] == 0 and dist1(solid, x, y): c = sr[1]
                if y > 0 and base[y - 1, x]: c = sr[1]
                px[x, y] = c
            else:
                d = dw[y, x] + (n3[y, x] - 0.5) * 6 + (h2(x, y, 41) - 0.5) * 0.8
                if dw[y, x] <= 1:
                    c = SEA[7] if h2(x // 2, y, 42) < 0.8 else SEA[6]
                elif d <= 3.5: c = SEA[6]
                elif d <= 6: c = SEA[5]
                elif d <= 10: c = SEA[4]
                elif d <= 16: c = SEA[3]
                elif d <= 25: c = SEA[2]
                elif d <= 36: c = SEA[1]
                else: c = SEA[0]
                dd = dw[y, x]
                if 7 <= dd <= 8 and n4[y, x] > 0.55 and h2(x // 3, y, 43) < 0.75: c = SEA[6]
                if 13 <= dd <= 13 and n4[y, x] > 0.6 and h2(x // 3, y, 44) < 0.6: c = SEA[4]
                px[x, y] = c
    # wave dashes + sparkles in open water
    d = ImageDraw.Draw(img)
    for i in range(260):
        x = int(h2(i, 1, seed) * W); y = int(h2(i, 2, seed) * H)
        if 0 <= x < W - 6 and dw[y, x] > 16:
            L = 3 + int(h2(i, 3, seed) * 4)
            lighter = SEA[3] if dw[y, x] > 36 else SEA[4]
            d.line([x, y, x + L, y], fill=lighter)
            if h2(i, 4, seed) < 0.4:
                d.line([x + 2, y + 2, x + L + 1, y + 2], fill=SEA[2] if dw[y, x] > 36 else SEA[3])
            if h2(i, 5, seed) < 0.18:
                d.point([x + 1, y - 1], fill=SEA[7])
    # ponds
    for (cx, cy, rx, ry) in ponds:
        for y in range(cy - ry - 2, cy + ry + 4):
            for x in range(cx - rx - 2, cx + rx + 3):
                e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (n4[y, x] - 0.5) * 0.25
                e2 = ((x - cx) / rx) ** 2 + ((y - 2 - cy) / ry) ** 2 + (n4[y, x] - 0.5) * 0.25
                if e <= 1:
                    c = SEA[4]
                    if e > 0.72: c = SEA[5]
                    if e < 0.35: c = SEA[3]
                    e0 = ((x - cx) / rx) ** 2 + ((y - 3 - cy) / ry) ** 2
                    if e0 > 0.95 and y < cy: c = SEA[1]
                    px[x, y] = c
                elif e2 <= 1:
                    px[x, y] = R['earth'][2] if h2(x, y, 3) < 0.6 else R['earth'][3]
                elif e <= 1.35 and y < cy + 2:
                    px[x, y] = R['sand'][3] if h2(x, y, 7) < 0.8 else R['sand'][2]
        d.line([cx - rx // 2, cy - ry // 3, cx - rx // 2 + 4, cy - ry // 3], fill=SEA[7])
        d.line([cx - rx // 2 + 2, cy - ry // 3 + 2, cx - rx // 2 + 7, cy - ry // 3 + 2], fill=SEA[6])
    # tufts + flowers
    fl = {'meadow': 0.022, 'grass': 0.006, 'home': 0.008, 'petal': 0.004, 'wheat': 0}
    fcols = [hx('ffffff'), hx('ffe596'), hx('f48fb1'), hx('d9c8ee'), hx('ff9e7a')]
    for y in range(2, H - 2):
        for x in range(2, W - 2):
            if not T[y, x] or P[y, x] or din[y, x] < 3 or px[x, y][:3] in [c[:3] for c in SEA]:
                continue
            b = bio[y, x]
            r = h2(x, y, 77)
            if b == 'wheat':
                if r < 0.03:
                    px[x, y] = R['wheat'][5]; px[x, y - 1] = R['wheat'][4]
                continue
            rp = R[b] if b != 'petal' else R['home']
            if r < 0.014:
                px[x, y] = rp[1]; px[x - 1, y - 1] = rp[1]; px[x + 1, y - 1] = rp[1]
            elif r < 0.024:
                px[x, y] = rp[5]; px[x + 1, y - 1] = rp[5]
            elif r < 0.024 + fl.get(b, 0):
                fc = fcols[int(h2(x, y, 78) * len(fcols))]
                px[x, y] = fc
                if h2(x, y, 79) < 0.5:
                    px[x, y + 1] = rp[1]
                else:
                    px[x + 1, y] = fc; px[x, y + 1] = rp[1]
    return img, dict(T=T, P=P, bio=bio, solid=solid, dw=dw)


def dist1(mask, x, y):
    hh, ww = mask.shape
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        xx, yy = x + dx, y + dy
        if 0 <= xx < ww and 0 <= yy < hh and not mask[yy, xx]:
            return True
    return False


# ---------------------------------------------------------------- sprite kit --------
class Spr:
    def __init__(self, w, h):
        self.im = Image.new('RGBA', (int(w), int(h)))
        self.d = ImageDraw.Draw(self.im)
        self.w, self.h = int(w), int(h)
        self.base = int(h) - 2      # ground line (y) inside sprite
        self.cx = int(w) // 2
        self.shadow = 'cast'        # 'cast' | 'blob' | None
        self.sh_h = None
        self.sh_k = 0.17; self.sh_dx = 0

    def rect(self, x0, y0, x1, y1, c):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        if x1 < x0 or y1 < y0: return
        self.d.rectangle([x0, y0, x1, y1], fill=c)

    def pt(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.im.putpixel((int(x), int(y)), c)

    def line(self, x0, y0, x1, y1, c, w=1):
        self.d.line([int(x0), int(y0), int(x1), int(y1)], fill=c, width=w)

    def poly(self, pts, c):
        self.d.polygon([(int(x), int(y)) for x, y in pts], fill=c)

    def ell(self, x0, y0, x1, y1, c):
        if int(x1) < int(x0) or int(y1) < int(y0): return
        self.d.ellipse([int(x0), int(y0), int(x1), int(y1)], fill=c)

    def ball(self, cx, cy, rx, ry, rp, seed=0, lo=-0.75, hi=0.95, dith=0.16):
        n = len(rp)
        for y in range(int(cy - ry), int(cy + ry) + 1):
            for x in range(int(cx - rx), int(cx + rx) + 1):
                dx = (x - cx) / rx; dy = (y - cy) / ry
                r2 = dx * dx + dy * dy
                if r2 > 1: continue
                nz = math.sqrt(1 - r2)
                l = dx * -0.55 + dy * -0.62 + nz * 0.55 + (h2(x, y, seed) - 0.5) * dith
                i = int((l - lo) / (hi - lo) * n)
                self.pt(x, y, rp[max(0, min(n - 1, i))])

    def shingles(self, x0, y0, x1, y1, inset, rp, rh=3, tw=5):
        """front roof slope: trapezoid narrower at the top, rows of tiles, lit from top-left"""
        for y in range(int(y0), int(y1) + 1):
            t = (y - y0) / max(1, (y1 - y0))
            xa = x0 + inset * (1 - t); xb = x1 - inset * (1 - t)
            row = int((y - y0) // rh); ry = int((y - y0) % rh)
            for x in range(int(round(xa)), int(round(xb)) + 1):
                u = (x - xa) / max(1, (xb - xa))
                b = 3
                if u < 0.30 + (h2(x, row, 1) - 0.5) * 0.08: b = 4
                if u > 0.78 + (h2(x, row, 2) - 0.5) * 0.08: b = 2
                c = b
                if ry == rh - 1: c = b - 1
                elif (x + (row % 2) * (tw // 2)) % tw == 0: c = b - 1
                elif ry == 0 and b >= 3 and (x + (row % 2) * (tw // 2)) % tw == 1: c = b + 1
                if y == int(y0): c = 5 if u < 0.6 else 4
                if y >= int(y1) - 1: c = 1 if y == int(y1) else b - 1
                if x == int(round(xa)): c = max(c, 4)
                if x == int(round(xb)): c = 1
                self.pt(x, y, rp[max(0, min(5, c))])

    def planks(self, x0, y0, x1, y1, rp, step=4, vertical=True, eave=2):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        wd = x1 - x0
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                u = (x - x0) / max(1, wd)
                b = 4
                if u > 0.72: b = 3
                if u < 0.05: b = 5
                k = (x - x0) if vertical else (y - y0)
                if k % step == step - 1: b -= 1
                elif h2(x // (1 if vertical else 5), y // (5 if vertical else 1), 5) < 0.06: b -= 1
                if y - y0 < eave: b -= 2
                elif y - y0 == eave and h2(x, y, 3) < 0.5: b -= 1
                self.pt(x, y, rp[max(0, min(5, b))])

    def stones(self, x0, y0, x1, y1, rp, bh=3, bw=5):
        for y in range(int(y0), int(y1) + 1):
            row = (y - int(y0)) // bh
            for x in range(int(x0), int(x1) + 1):
                u = (x - x0) / max(1, (x1 - x0))
                b = 3 if u < 0.7 else 2
                if u < 0.2: b = 4
                if (y - int(y0)) % bh == bh - 1 or (x + row * (bw // 2)) % bw == 0: b -= 1
                elif h2((x + row * (bw // 2)) // bw, row, 9) < 0.3: b += 1
                self.pt(x, y, rp[max(0, min(5, b))])

    def window(self, x0, y0, w, h, frame=None, glass=None, lit=False):
        frame = frame or R['cream']
        g = R['butter'] if lit else (glass or R['blue'])
        x0, y0, w, h = int(x0), int(y0), int(w), int(h)
        self.rect(x0 - 1, y0 - 1, x0 + w, y0 + h, R['wood'][1])
        self.rect(x0, y0, x0 + w - 1, y0 + h - 1, frame[5])
        self.rect(x0 + 1, y0 + 1, x0 + w - 2, y0 + h - 2, g[3] if not lit else g[4])
        # glass shading: darker top-left (eave), reflection streak
        self.rect(x0 + 1, y0 + 1, x0 + w - 2, y0 + 1, g[2] if not lit else g[3])
        for k in range(min(w, h) - 3):
            self.pt(x0 + 2 + k, y0 + h - 3 - k, g[5])
            if w > 7: self.pt(x0 + 3 + k, y0 + h - 3 - k, g[4] if not lit else g[5])
        self.line(x0 + w // 2, y0, x0 + w // 2, y0 + h - 1, frame[5])
        if h > 7: self.line(x0, y0 + h // 2, x0 + w - 1, y0 + h // 2, frame[5])
        self.rect(x0 - 1, y0 + h, x0 + w, y0 + h, frame[3])       # sill

    def flowerbox(self, x0, y, w):
        x0, y, w = int(x0), int(y), int(w)
        self.rect(x0, y, x0 + w - 1, y + 1, R['wood'][2])
        self.rect(x0, y, x0 + w - 1, y, R['wood'][3])
        for i in range(w):
            c = [R['leaf'][3], R['rose'][4], R['leaf'][4], R['butter'][4], R['rose'][3]][int(h2(i, x0, y) * 5)]
            self.pt(x0 + i, y - 1, c)
            if h2(i, x0, 7) < 0.5: self.pt(x0 + i, y - 2, R['leaf'][3] if i % 2 else R['rose'][4])

    def door(self, x0, y1, w, h, rp=None, arch=True):
        rp = rp or R['wood']
        x0, y1, w, h = int(x0), int(y1), int(w), int(h)
        y0 = y1 - h + 1
        self.rect(x0 - 1, y0 + (2 if arch else 0) - 1, x0 + w, y1, R['wood'][0])
        if arch: self.rect(x0 + 1, y0 - 1, x0 + w - 2, y0, R['wood'][0])
        self.rect(x0, y0 + (2 if arch else 0), x0 + w - 1, y1, rp[3])
        if arch:
            self.rect(x0 + 1, y0, x0 + w - 2, y0 + 1, rp[3])
        self.rect(x0, y0 + 2, x0, y1, rp[4])
        self.rect(x0 + w - 1, y0 + 2, x0 + w - 1, y1, rp[2])
        for k in range(2, w - 1, 3):
            self.line(x0 + k, y0 + 1, x0 + k, y1, rp[2])
        self.pt(x0 + w - 3, y1 - h // 2 + 1, R['butter'][4])
        self.pt(x0 + w - 3, y1 - h // 2 + 2, R['butter'][2])

    def finish(self):
        """selective outline: ink on the shadow side (bottom/right), tinted dark on the lit side"""
        src = self.im.copy(); sp = src.load(); op = self.im.load()
        for y in range(self.h):
            for x in range(self.w):
                if sp[x, y][3] > 0: continue
                nb = []
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < self.w and 0 <= yy < self.h and sp[xx, yy][3] > 0:
                        nb.append((dx, dy, sp[xx, yy]))
                if not nb: continue
                lit = any(dx == 1 or dy == 1 for dx, dy, _ in nb) and not any(dx == -1 or dy == -1 for dx, dy, _ in nb)
                c = nb[0][2]
                if lit:
                    op[x, y] = mix(mix(c, INK, 0.62), PLUM, 0.25)
                else:
                    op[x, y] = mix(c, INK, 0.9)
        return self


def paste(scene, spr, x, y, shadow_layer=None):
    """x = centre, y = ground line"""
    ox, oy = int(x - spr.cx), int(y - spr.base)
    if shadow_layer is not None and spr.shadow:
        a = np.asarray(spr.im)[:, :, 3] > 0
        sp = shadow_layer.load()
        if spr.shadow == 'cast':
            for yy in range(spr.h):
                hh = spr.base - yy
                if hh < 0: continue
                if spr.sh_h and hh > spr.sh_h: continue
                for xx in range(spr.w):
                    if a[yy, xx]:
                        tx = ox + xx + int(hh * 0.42) + 1; ty = oy + spr.base - int(hh * 0.22) + 1
                        if 0 <= tx < W and 0 <= ty < H: sp[tx, ty] = 255
        else:
            xs = np.where(a.any(axis=0))[0]
            if len(xs):
                x0, x1 = ox + xs[0], ox + xs[-1]
                ry = max(2, int((x1 - x0) * spr.sh_k))
                ImageDraw.Draw(shadow_layer).ellipse([x0 + 1 + spr.sh_dx, oy + spr.base - ry + 1, x1 + 3 + spr.sh_dx * 2, oy + spr.base + ry], fill=255)
    return (y, spr, ox, oy)


def compose(terrain, items, info=None, extra_shadow=None):
    sh = Image.new('L', (W, H), 0)
    placed = [paste(terrain, s, x, y, sh) for (s, x, y) in items]
    if extra_shadow: extra_shadow(sh)
    out = terrain.copy()
    px = out.load(); sp = sh.load()
    T = info['T'] if info else None
    for y in range(H):
        for x in range(W):
            if sp[x, y] and (T is None or T[y, x]):
                c = px[x, y]
                px[x, y] = (int(c[0] * 0.60 + 10), int(c[1] * 0.64 + 12), int(c[2] * 0.72 + 36), 255)
    for (y, s, ox, oy) in sorted(placed, key=lambda t: t[0]):
        out.alpha_composite(s.im, (ox, oy)) if ox >= 0 and oy >= 0 else paste_clip(out, s.im, ox, oy)
    return out


def paste_clip(out, im, ox, oy):
    cx0, cy0 = max(0, -ox), max(0, -oy)
    if cx0 >= im.width or cy0 >= im.height: return
    out.alpha_composite(im.crop((cx0, cy0, im.width, im.height)), (max(0, ox), max(0, oy)))


# ---------------------------------------------------------------- buildings --------
def house(s=1, roof='rose', wallc='cream', lit=False, chimney=True, variant='home'):
    S = lambda v: int(round(v * s))
    w = S(46); rh = S(19); wh = S(17)
    sp = Spr(w + 4, rh + wh + S(12) + 4)
    x0 = 2; yr = S(10) + 1; yw = yr + rh; yb = yw + wh
    sp.base = yb + 1
    # chimney (behind roof)
    if chimney:
        cx = x0 + w - S(14)
        sp.stones(cx, yr - S(6), cx + S(5), yr + S(6), R['stone'], bh=3, bw=4)
        sp.rect(cx - 1, yr - S(6) - 2, cx + S(5) + 1, yr - S(6), R['stone'][4])
        sp.rect(cx - 1, yr - S(6), cx + S(5) + 1, yr - S(6), R['stone'][2])
        for i, (dx, dy, r) in enumerate([(2, -6, 2), (5, -10, 3), (3, -15, 2)]):
            if yr - S(6) + S(dy) - S(r) >= 0:
                sp.ball(cx + S(dx), yr - S(6) + S(dy) * 0.6 - 1, max(1.6, S(r) * 0.8), max(1.4, S(r) * 0.7), R['cloud'][2:], seed=i)
    # wall
    wx0 = x0 + S(3); wx1 = x0 + w - S(3) - 1
    sp.planks(wx0, yw - 1, wx1, yb, R[wallc], step=S(4) if s == 1 else 6, vertical=False, eave=S(2) + 1)
    sp.stones(wx0, yb - S(2), wx1, yb, R['stone'], bh=max(2, S(1.5)), bw=5)
    # timber corner posts
    for xx in (wx0, wx1 - S(1.2) + 1):
        sp.rect(xx, yw + S(2), xx + max(1, S(1.2)) - 1, yb - S(2) - 1, R['wood'][3])
        sp.rect(xx, yw + S(2), xx, yb - S(2) - 1, R['wood'][4])
    # door
    dw_ = S(8); dh = S(12)
    dx = x0 + w // 2 - dw_ // 2
    drp = R['wood'] if variant == 'home' else R['blue']
    sp.door(dx, yb, dw_, dh, drp)
    sp.rect(dx - 2, yb + 1, dx + dw_ + 1, yb + 1, R['stone'][4])
    sp.rect(dx - 3, yb + 2, dx + dw_ + 2, yb + 2, R['stone'][3])
    sp.base = yb + 2
    # windows + flower boxes
    ww = S(7); wh_ = S(7)
    for wx in (wx0 + S(4), wx1 - S(4) - ww + 1):
        sp.window(wx, yw + S(4), ww, wh_, lit=lit)
        sp.flowerbox(wx - 1, yw + S(4) + wh_ + 1, ww + 2)
        if s >= 2:  # shutters
            for sx in (wx - S(2) - 1, wx + ww + 1):
                sp.rect(sx, yw + S(4) - 1, sx + S(1.5), yw + S(4) + wh_, R[roof][3])
                sp.rect(sx, yw + S(4) - 1, sx, yw + S(4) + wh_, R[roof][4])
                for k in range(yw + S(4) + 1, yw + S(4) + wh_, 3):
                    sp.line(sx, k, sx + S(1.5), k, R[roof][2])
    # roof
    sp.shingles(x0, yr, x0 + w - 1, yw + 1, S(5), R[roof], rh=S(3) if s == 1 else 5, tw=S(5) if s == 1 else 8)
    # ridge cap
    sp.rect(x0 + S(5) - 1, yr - 2, x0 + w - S(5), yr - 1, R[roof][4])
    sp.rect(x0 + S(5) - 1, yr - 2, x0 + w // 2, yr - 2, R[roof][5])
    sp.rect(x0 + S(5) - 1, yr, x0 + w - S(5), yr, R[roof][2])
    # eave board
    sp.rect(x0, yw + 2, x0 + w - 1, yw + 2 + max(0, S(1) - 1), R['cream'][4] if variant == 'home' else R['cream'][5])
    sp.rect(x0 + w * 2 // 3, yw + 2, x0 + w - 1, yw + 2 + max(0, S(1) - 1), R['cream'][2])
    # dormer / gable
    gx = x0 + w // 2; gw = S(7); gy1 = yw - S(2); gy0 = gy1 - S(9)
    for k in range(gy1 - gy0 + 1):
        half = int(gw * k / (gy1 - gy0))
        sp.rect(gx - half, gy0 + k, gx + half, gy0 + k, R[wallc][4])
        sp.pt(gx + half, gy0 + k, R[wallc][2])
    for k in range(gy1 - gy0 + 1):
        half = int(gw * k / (gy1 - gy0))
        for t in range(S(2)):
            sp.pt(gx - half - 1 - t, gy0 + k + (1 if t else 0), R[roof][5] if t == 0 else R[roof][4])
            sp.pt(gx + half + 1 + t, gy0 + k + (1 if t else 0), R[roof][2] if t == 0 else R[roof][1])
    sp.rect(gx - 1, gy0 - 1, gx + 1, gy0, R[roof][5])
    r = max(1, S(2))
    if variant == 'home':
        sp.ell(gx - r - 1, gy1 - 2 * r - S(1) - 2, gx + r + 1, gy1 - S(1), R['wood'][1])
        sp.ell(gx - r, gy1 - 2 * r - S(1) - 1, gx + r, gy1 - S(1) - 1, R['butter'][4] if lit else R['blue'][3])
        sp.pt(gx - r + 1, gy1 - r - S(1) - 2, R['blue'][5])
    else:  # heart
        hy = gy1 - S(4)
        for (dx_, dy_) in [(-1, 0), (1, 0), (-2, 1), (-1, 1), (0, 1), (1, 1), (2, 1), (-1, 2), (0, 2), (1, 2), (0, 3)]:
            sp.pt(gx + dx_, hy + dy_, R['rose'][3])
        sp.pt(gx - 1, hy, R['rose'][5])
    # lantern by the door
    lx = dx + dw_ + S(2)
    sp.rect(lx, yb - dh + S(2), lx + 1, yb - dh + S(2) + 2, R['butter'][4])
    sp.pt(lx, yb - dh + S(2) - 1, R['wood'][1]); sp.pt(lx + 1, yb - dh + S(2) - 1, R['wood'][1])
    sp.cx = x0 + w // 2
    return sp.finish()


def workshop(s=1):
    S = lambda v: int(round(v * s))
    w = S(42); rh = S(17); wh = S(17)
    sp = Spr(w + 4 + S(8), rh + wh + S(8) + 6)
    x0 = 2; yr = S(6) + 2; yw = yr + rh; yb = yw + wh
    wx0 = x0 + S(3); wx1 = x0 + w - S(3) - 1
    sp.planks(wx0, yw - 1, wx1, yb, R['wood'], step=S(3) if s == 1 else 5, vertical=True, eave=S(2) + 1)
    sp.stones(wx0, yb - S(1.5), wx1, yb, R['stone'], bh=2, bw=5)
    # double barn door with cross braces
    dw_ = S(15); dh = S(13); dx = wx0 + S(4)
    sp.rect(dx - 1, yb - dh - 1, dx + dw_, yb, R['wood'][0])
    sp.rect(dx, yb - dh, dx + dw_ - 1, yb, R['butter'][2])
    for k in range(dx, dx + dw_, max(2, S(2.5))):
        sp.line(k, yb - dh, k, yb, R['butter'][1])
    mid = dx + dw_ // 2
    for (a, b) in ((dx, mid - 1), (mid + 1, dx + dw_ - 1)):
        sp.rect(a, yb - dh, b, yb - dh + max(0, S(1) - 1), R['cream'][4])
        sp.rect(a, yb - max(0, S(1) - 1), b, yb, R['cream'][3])
        sp.rect(a, yb - dh, a + max(0, S(1) - 1), yb, R['cream'][4])
        sp.rect(b - max(0, S(1) - 1), yb - dh, b, yb, R['cream'][3])
        sp.line(a, yb - dh, b, yb, R['cream'][4], w=max(1, S(1)))
        sp.line(a, yb, b, yb - dh, R['cream'][4], w=max(1, S(1)))
    sp.line(mid, yb - dh, mid, yb, R['wood'][0])
    sp.pt(mid - 2, yb - dh // 2, R['stone'][1]); sp.pt(mid + 2, yb - dh // 2, R['stone'][1])
    # window, warm glow
    ww = S(7)
    sp.window(wx1 - S(3) - ww, yw + S(5), ww, S(6), lit=True)
    # hanging tool rack under window at s2
    if s >= 2:
        yy = yw + S(5) + S(6) + 4
        sp.rect(wx1 - S(3) - ww - 1, yy, wx1 - S(3), yy + 1, R['wood'][1])
        sp.line(wx1 - S(3) - ww + 1, yy + 2, wx1 - S(3) - ww + 1, yy + 8, R['stone'][3])
        sp.rect(wx1 - S(3) - ww, yy + 8, wx1 - S(3) - ww + 2, yy + 10, R['stone'][4])
        sp.line(wx1 - S(3) - 5, yy + 2, wx1 - S(3) - 5, yy + 9, R['wood'][4])
        sp.rect(wx1 - S(3) - 7, yy + 2, wx1 - S(3) - 3, yy + 4, R['stone'][3])
    # roof: slate, steeper
    sp.shingles(x0, yr, x0 + w - 1, yw + 1, S(7), R['slate'], rh=S(3) if s == 1 else 5, tw=S(4) if s == 1 else 7)
    sp.rect(x0 + S(7) - 1, yr - 2, x0 + w - S(7), yr - 1, R['slate'][4])
    sp.rect(x0 + S(7) - 1, yr - 2, x0 + w // 2, yr - 2, R['slate'][5])
    sp.rect(x0, yw + 2, x0 + w - 1, yw + 2 + max(0, S(1) - 1), R['wood'][4])
    sp.rect(x0 + w * 2 // 3, yw + 2, x0 + w - 1, yw + 2 + max(0, S(1) - 1), R['wood'][2])
    # round sign with hammer above the door
    scx = dx + dw_ // 2; scy = yw - S(3); r = S(5)
    sp.ell(scx - r - 1, scy - r - 1, scx + r + 1, scy + r + 1, R['wood'][1])
    sp.ball(scx, scy, r, r, R['butter'][2:], dith=0.05)
    hr = max(2, S(2.4))
    sp.line(scx - hr + 1, scy + hr, scx + hr - 1, scy - hr + 2, R['wood'][1], w=max(1, S(0.9)))
    sp.rect(scx - 1, scy - hr - 1 + 1, scx + hr, scy - hr + max(1, S(1.2)), R['stone'][1])
    sp.rect(scx - 1, scy - hr, scx + hr, scy - hr, R['stone'][3])
    # stovepipe
    px_ = x0 + w - S(11)
    sp.rect(px_, yr - S(5), px_ + S(2), yr + S(3), R['stone'][2])
    sp.rect(px_, yr - S(5), px_, yr + S(3), R['stone'][4])
    sp.rect(px_ - 1, yr - S(5) - 1, px_ + S(2) + 1, yr - S(5), R['stone'][1])
    # lean-to: log pile on the right
    lx = wx1 + 3
    for row in range(3 if s >= 2 else 0):
        for i in range(3 - row):
            cxl = lx + S(2) + i * S(4) + row * S(2); cyl = yb - S(1.6) - row * S(3.2)
            rr = max(1.5, S(1.8))
            sp.ell(cxl - rr, cyl - rr, cxl + rr, cyl + rr, R['wood'][2])
            sp.ell(cxl - rr + 1, cyl - rr + 1, cxl + rr - 1, cyl + rr - 1, R['wood'][5])
            sp.pt(cxl, cyl, R['wood'][3])
    sp.base = yb + 1
    sp.cx = x0 + w // 2
    return sp.finish()


def skep(s=1):
    """woven straw beehive on a little wooden stand"""
    S = lambda v: int(round(v * s))
    rx = S(7); ry = S(8)
    sp = Spr(rx * 2 + S(6) + 4, ry * 2 + S(8) + 4)
    cx = sp.w // 2; top = 2
    cy = top + ry
    # stand
    yb = cy + ry + S(5)
    sp.rect(cx - rx - S(2), cy + ry - S(2), cx + rx + S(2), cy + ry - S(2) + max(1, S(1.5)), R['wood'][4])
    sp.rect(cx - rx - S(2), cy + ry - S(2) + max(1, S(1.5)), cx + rx + S(2), cy + ry - S(2) + max(1, S(1.5)) + max(0, S(1) - 1), R['wood'][2])
    sp.rect(cx - rx - S(2), cy + ry - S(2), cx + rx + S(2), cy + ry - S(2), R['wood'][5])
    for lx in (cx - rx - S(1), cx + rx + S(1) - max(1, S(1.5)) + 1):
        sp.rect(lx, cy + ry, lx + max(1, S(1.5)) - 1, yb, R['wood'][2])
        sp.rect(lx, cy + ry, lx, yb, R['wood'][3])
    # dome (flattened bottom)
    tmp = Spr(sp.w, sp.h)
    tmp.ball(cx, cy + S(1), rx, ry + S(1), R['butter'][1:], seed=3, dith=0.10)
    a = tmp.im.crop((0, 0, sp.w, cy + ry - S(2)))
    sp.im.alpha_composite(a, (0, 0))
    sp.d = ImageDraw.Draw(sp.im)
    # woven bands
    step = max(2, S(2.4))
    for y in range(top + step, cy + ry - S(2), step):
        for x in range(sp.w):
            c = sp.im.getpixel((x, y))
            if c[3]:
                i = R['butter'].index(c) if c in R['butter'] else 3
                sp.pt(x, y, R['butter'][max(0, i - 1)])
                if s >= 2 and (x + y) % 4 == 0 and y + 1 < cy + ry - S(2):
                    sp.pt(x, y - 1, R['butter'][max(0, i - 1)])
    # knob on top
    sp.rect(cx - 1, top - 1, cx + 1, top, R['butter'][3]); sp.pt(cx - 1, top - 1, R['butter'][5])
    # entrance
    ew = max(2, S(2.2)); eh = max(2, S(3))
    sp.ell(cx - ew, cy + ry - S(2) - eh - 1, cx + ew, cy + ry - S(2) + eh - 2, R['wood'][0])
    sp.rect(cx - ew - 1, cy + ry - S(2) - 1, cx + ew + 1, cy + ry - S(2) - 1, R['butter'][2])
    im2 = sp.im.crop((0, 0, sp.w, sp.h))
    # clear anything of the entrance ellipse that fell below the board top
    sp.rect(cx - rx - S(2), cy + ry - S(2), cx + rx + S(2), cy + ry - S(2), R['wood'][5])
    sp.base = yb
    sp.cx = cx
    return sp.finish()


def perch(s=1, bird=True):
    """Percy's perch: post with a little birdhouse on top, a crossbar, a seed dish and the bird"""
    S = lambda v: int(round(v * s))
    sp = Spr(S(24) + 4, S(36) + 6)
    cx = sp.w // 2; yb = sp.h - 3; top = S(14)
    pw = max(2, S(2))
    sp.rect(cx - pw // 2, top, cx - pw // 2 + pw - 1, yb, R['wood'][3])
    sp.rect(cx - pw // 2, top, cx - pw // 2, yb, R['wood'][5])
    sp.rect(cx - pw // 2 + pw - 1, top, cx - pw // 2 + pw - 1, yb, R['wood'][2])
    sp.rect(cx - pw // 2 - 1, yb - 1, cx - pw // 2 + pw, yb, R['wood'][2])
    # crossbar
    by0 = top + S(5); bt = max(1, S(1.4))
    sp.rect(cx - S(10), by0, cx + S(9), by0 + bt - 1, R['wood'][4])
    sp.rect(cx - S(10), by0, cx + S(9), by0, R['wood'][5])
    sp.rect(cx - S(10), by0 + bt, cx + S(9), by0 + bt, R['wood'][2])
    # seed dish hanging on the right
    sp.line(cx + S(7), by0 + bt, cx + S(7), by0 + S(5), R['cream'][2])
    sp.rect(cx + S(5), by0 + S(5), cx + S(9), by0 + S(6), R['rose'][3])
    sp.rect(cx + S(5), by0 + S(5), cx + S(9), by0 + S(5), R['butter'][4])
    # birdhouse
    hw = S(5); hh = S(8)
    sp.rect(cx - hw, top - hh + S(3), cx + hw - 1, top + S(1), R['cream'][4])
    sp.rect(cx + hw - max(1, S(1.5)), top - hh + S(3), cx + hw - 1, top + S(1), R['cream'][2])
    sp.rect(cx - hw, top - hh + S(3), cx + hw - 1, top - hh + S(3) + max(0, S(1) - 1), R['cream'][2])
    sp.rect(cx - hw - 1, top + S(1), cx + hw, top + S(1) + max(0, S(1) - 1), R['wood'][3])
    r = max(1, S(1.4))
    sp.ell(cx - r - 1, top - S(3) - r, cx + r - 1, top - S(3) + r, R['wood'][0])
    for k in range(S(5) + 1):
        half = int((hw + S(2)) * k / S(5))
        sp.rect(cx - half - 1, top - hh - S(2) + k + S(1), cx + half, top - hh - S(2) + k + S(1), R['rose'][3])
        sp.pt(cx - half - 1, top - hh - S(2) + k + S(1), R['rose'][5])
        sp.pt(cx + half, top - hh - S(2) + k + S(1), R['rose'][1])
        if k and k % 2 == 0: sp.rect(cx - half + 1, top - hh - S(2) + k + S(1), cx - 1, top - hh - S(2) + k + S(1), R['rose'][4])
    sp.rect(cx - hw - S(2) - 1, top - hh + S(4) - 1, cx + hw + S(2), top - hh + S(4) - 1, R['rose'][1])
    # bird (Percy) on the left of the bar
    if bird:
        r = max(2.4, S(3.2))
        bx = cx - S(7); by = by0 - r
        sp.rect(bx - int(r) - S(2), by + 1, bx - int(r) + 1, by + max(1, S(1)), R['blue'][1])       # tail
        sp.ball(bx, by, r, r, R['blue'][1:], seed=4, dith=0.03)
        sp.ball(bx + r * 0.25, by + r * 0.4, r * 0.62, r * 0.5, R['cream'][3:], dith=0.0)
        ex = bx + int(r * 0.45); ey = by - int(r * 0.3)
        sp.pt(ex, ey, INK)
        if s >= 2: sp.pt(ex, ey + 1, INK); sp.pt(ex, ey - 1, R['cream'][5])
        sp.rect(bx + int(r) + 1, by, bx + int(r) + max(1, S(1)), by + max(0, S(0.6)), R['butter'][3])
        sp.rect(bx - 1, by - int(r) - max(1, S(1)), bx, by - int(r), R['blue'][4])               # crest
    # flowers at base
    for i, dx in enumerate((-5, -3, 3, 5)):
        sp.pt(cx + S(dx * 0.6), yb - (i % 2), R['leaf'][3]); sp.pt(cx + S(dx * 0.6), yb - 1 - (i % 2), [R['rose'][4], R['butter'][4]][i % 2])
    sp.base = yb; sp.cx = cx; sp.shadow = 'blob'; sp.sh_k = 0.12
    return sp.finish()


def bed(s=1, state='carrot', w=26, hgt=13):
    """raised garden bed: soil top + lit front board"""
    S = lambda v: int(round(v * s))
    w = S(w); hh = S(hgt); fb = max(3, S(3.5))
    sp = Spr(w + 4, hh + fb + S(8) + 4)
    x0 = 2; y0 = S(8); y1 = y0 + hh; yb = y1 + fb
    soil = R['drysoil'] if state == 'dry' else R['soil']
    # back + side boards (top faces)
    sp.rect(x0, y0, x0 + w - 1, y1, R['wood'][4])
    sp.rect(x0, y0, x0 + w - 1, y0, R['wood'][5])
    sp.rect(x0 + 2, y0 + 2, x0 + w - 3, y1 - 1, soil[1])
    sp.rect(x0 + 2, y0 + 2, x0 + w - 3, y0 + 2, soil[0])       # shadow from back board
    sp.rect(x0 + 2, y0 + 2, x0 + 2, y1 - 1, soil[0])
    rows = max(2, hh // max(4, S(4)))
    rstep = (hh - 3) / rows
    for r in range(rows):
        ry = int(y0 + 3 + r * rstep + rstep / 2)
        for x in range(x0 + 3, x0 + w - 3):
            sp.pt(x, ry, soil[2] if h2(x, r, 1) < 0.8 else soil[3])
            if h2(x, r, 2) < 0.25: sp.pt(x, ry - 1, soil[2])
            if state == 'dry' and h2(x, r, 6) < 0.12: sp.pt(x, ry + 1, soil[0])
        n = max(3, (w - 6) // max(4, S(4.6)))
        for i in range(n):
            px_ = x0 + 4 + int((i + 0.5) * (w - 8) / n)
            if state == 'carrot' and s >= 2:
                sp.rect(px_ - 2, ry - 1, px_ + 1, ry + 1, R['orange'][2])
                sp.rect(px_ - 2, ry - 1, px_ - 1, ry - 1, R['orange'][4]); sp.rect(px_ - 2, ry + 1, px_ + 1, ry + 1, R['orange'][1])
                for (dx, dy, k) in ((-1, -2, 3), (0, -2, 2), (-1, -3, 4), (0, -3, 3), (-3, -4, 4), (-2, -4, 4), (1, -4, 3), (2, -4, 2), (-1, -5, 5), (0, -5, 4), (-4, -5, 4), (3, -5, 3), (-2, -6, 5), (1, -6, 4), (-1, -7, 5)):
                    sp.pt(px_ + dx, ry + dy, R['leaf'][k])
            elif state == 'carrot':
                sp.rect(px_ - 1, ry, px_, ry, R['orange'][2])
                sp.pt(px_ - 1, ry, R['orange'][3])
                for (dx, dy, k) in ((0, -1, 3), (-1, -2, 4), (1, -2, 3), (0, -3, 4), (-2, -3, 3), (2, -3, 2)):
                    sp.pt(px_ + dx, ry + dy, R['leaf'][k])
            elif state == 'sprout':
                sp.pt(px_, ry - 1, R['leaf'][3]); sp.pt(px_ - 1, ry - 2, R['leaf'][4]); sp.pt(px_ + 1, ry - 2, R['leaf'][3])
                if s >= 2:
                    sp.pt(px_, ry, R['leaf'][2]); sp.pt(px_, ry - 2, R['leaf'][3])
                    sp.rect(px_ - 3, ry - 4, px_ - 1, ry - 3, R['leaf'][4]); sp.rect(px_ + 1, ry - 4, px_ + 3, ry - 3, R['leaf'][3]); sp.pt(px_ - 3, ry - 4, R['leaf'][5])
            elif state == 'dry':
                sp.pt(px_, ry - 1, R['meadow'][1]); sp.pt(px_ + 1, ry - 2, R['wheat'][2])
                if s >= 2: sp.pt(px_ + 2, ry - 2, R['wheat'][2]); sp.pt(px_, ry - 2, R['meadow'][1])
            elif state == 'leafy':
                for (dx, dy, k) in ((0, 0, 2), (-1, -1, 4), (1, -1, 3), (0, -1, 3), (0, -2, 5), (-2, 0, 3), (2, 0, 2)):
                    sp.pt(px_ + dx, ry + dy, R['leaf'][k])
                if s >= 2:
                    sp.ball(px_, ry - 2, 3.4, 3, R['leaf'][2:], seed=i, dith=0.2)
                    sp.pt(px_, ry - 3, R['cream'][5]); sp.pt(px_ - 1, ry - 2, R['leaf'][5])
    # front board
    sp.rect(x0, y1, x0 + w - 1, yb, R['wood'][3])
    sp.rect(x0, y1, x0 + w - 1, y1, R['wood'][5])
    sp.rect(x0, y1 + 1, x0 + w * 2 // 5, y1 + 1, R['wood'][4])
    sp.rect(x0, yb, x0 + w - 1, yb, R['wood'][2])
    if fb >= 5: sp.rect(x0, y1 + fb // 2 + 1, x0 + w - 1, y1 + fb // 2 + 1, R['wood'][2])
    for xx in (x0, x0 + w - max(2, S(1.5))):
        sp.rect(xx, y1 - 1, xx + max(2, S(1.5)) - 1, yb, R['wood'][4])
        sp.rect(xx, y1 - 1, xx + max(2, S(1.5)) - 1, y1 - 1, R['wood'][5])
    sp.rect(x0 + w - 1, y1, x0 + w - 1, yb, R['wood'][2])
    # side boards on top
    sp.rect(x0, y0, x0 + 1, y1, R['wood'][5]); sp.rect(x0 + w - 2, y0, x0 + w - 1, y1, R['wood'][3])
    sp.base = yb; sp.cx = x0 + w // 2; sp.shadow = 'cast'
    return sp.finish()


def well(s=1):
    S = lambda v: int(round(v * s))
    w = S(16)
    sp = Spr(w + 6, S(26) + 6)
    cx = sp.w // 2; yb = sp.h - 3
    bh = S(7); ty = yb - bh
    # posts
    for px_ in (cx - w // 2 + 1, cx + w // 2 - max(1, S(1.3))):
        sp.rect(px_, ty - S(11), px_ + max(1, S(1.3)) - 1, ty, R['wood'][3])
        sp.rect(px_, ty - S(11), px_, ty, R['wood'][5])
    # rope + bucket
    sp.line(cx, ty - S(10), cx, ty - S(4), R['cream'][2])
    sp.rect(cx - max(1, S(1.3)), ty - S(4), cx + max(1, S(1.3)), ty - S(1.5), R['wood'][4])
    sp.rect(cx - max(1, S(1.3)), ty - S(4), cx + max(1, S(1.3)), ty - S(4), R['stone'][4])
    # stone body
    sp.stones(cx - w // 2, ty, cx + w // 2, yb, R['stone'], bh=max(2, S(2.4)), bw=max(4, S(4)))
    sp.ell(cx - w // 2, ty - S(3), cx + w // 2, ty + S(3), R['stone'][4])
    sp.ell(cx - w // 2 + 2, ty - S(3) + 1, cx + w // 2 - 2, ty + S(3) - 1, R['blue'][1])
    sp.ell(cx - w // 2 + 3, ty - S(1), cx + w // 2 - 2, ty + S(3) - 1, R['blue'][2])
    sp.rect(cx - 2, ty + 1, cx, ty + 1, R['blue'][4])
    # roof
    sp.shingles(cx - w // 2 - S(2), ty - S(17), cx + w // 2 + S(2), ty - S(10), S(4), R['rose'], rh=max(2, S(2.5)), tw=max(3, S(4)))
    sp.rect(cx - w // 2 + S(2), ty - S(17) - 1, cx + w // 2 - S(2), ty - S(17) - 1, R['rose'][5])
    sp.base = yb; sp.cx = cx
    return sp.finish()


def windmill(s=1):
    S = lambda v: int(round(v * s))
    sp = Spr(S(56), S(64))
    cx = sp.w // 2; yb = sp.h - 3
    th = S(30); ty = yb - th; bw = S(10); tw = S(6)
    for y in range(ty, yb + 1):
        t = (y - ty) / th
        half = tw + (bw - tw) * t
        for x in range(int(cx - half), int(cx + half) + 1):
            u = (x - (cx - half)) / (2 * half)
            b = 4
            if u < 0.25: b = 5
            if u > 0.62: b = 3
            if u > 0.85: b = 2
            if (y - ty) % max(4, S(5)) == 0: b -= 1
            if y - ty < 3: b -= 2
            sp.pt(x, y, R['cream'][max(0, b)])
    sp.stones(cx - bw, yb - S(3), cx + bw, yb, R['stone'], bh=2, bw=5)
    sp.door(cx - S(3), yb, S(6), S(9), R['wood'])
    sp.window(cx - S(2), ty + S(9), S(4), S(4))
    # cap
    for k in range(S(8)):
        half = int((tw + S(2)) * (k + 1) / S(8))
        for x in range(cx - half, cx + half + 1):
            u = (x - (cx - half)) / max(1, 2 * half)
            sp.pt(x, ty - S(8) + k + 1, R['rose'][4 if u < 0.35 else (3 if u < 0.75 else 2)])
    sp.rect(cx - tw - S(2), ty + 1, cx + tw + S(2), ty + 1, R['rose'][1])
    # sails
    hx_, hy_ = cx, ty - S(1)
    L = S(22)
    for k in range(4):
        ang = math.radians(28 + k * 90)
        ex, ey = hx_ + math.cos(ang) * L, hy_ + math.sin(ang) * L
        nx, ny = -math.sin(ang), math.cos(ang)
        sw_ = S(5)
        p0 = (hx_ + math.cos(ang) * S(5), hy_ + math.sin(ang) * S(5))
        quad = [p0, (ex, ey), (ex + nx * sw_, ey + ny * sw_), (p0[0] + nx * sw_, p0[1] + ny * sw_)]
        sp.poly(quad, R['cream'][4] if k in (2, 3) else R['cream'][3])
        for j in range(1, 5):
            t = j / 5
            a = (p0[0] + (ex - p0[0]) * t, p0[1] + (ey - p0[1]) * t)
            sp.line(a[0], a[1], a[0] + nx * sw_, a[1] + ny * sw_, R['wood'][3])
        sp.line(quad[3][0], quad[3][1], quad[2][0], quad[2][1], R['wood'][3])
        sp.line(hx_, hy_, ex, ey, R['wood'][2], w=max(1, S(1.2)))
    sp.ell(hx_ - 2, hy_ - 2, hx_ + 2, hy_ + 2, R['butter'][3])
    sp.pt(hx_ - 1, hy_ - 1, R['butter'][5])
    sp.base = yb; sp.cx = cx; sp.sh_h = S(34)
    return sp.finish()


def tree(r=9, kind='leaf', seed=0, s=1):
    rp = R[kind]
    sp = Spr(r * 3 + 6, int(r * 3.2) + 8)
    cx = sp.w // 2; yb = sp.h - 3
    tw = max(2, r // 3)
    th = int(r * 0.9)
    sp.rect(cx - tw // 2, yb - th, cx - tw // 2 + tw - 1, yb, R['wood'][2])
    sp.rect(cx - tw // 2, yb - th, cx - tw // 2, yb, R['wood'][3])
    sp.rect(cx - tw // 2 + tw - 1, yb - th, cx - tw // 2 + tw - 1, yb, R['wood'][1])
    sp.pt(cx - tw // 2 - 1, yb, R['wood'][2]); sp.pt(cx - tw // 2 + tw, yb, R['wood'][1])
    cy = yb - th - int(r * 0.75)
    blobs = [(0.55, 0.35, 0.62), (-0.55, 0.4, 0.6), (0.0, 0.5, 0.7), (0.5, -0.15, 0.66), (-0.5, -0.1, 0.68), (0.05, -0.5, 0.72), (-0.1, 0.0, 0.75)]
    # overall dark underlayer for unity
    for i, (bx, by, br) in enumerate(blobs):
        sp.ball(cx + bx * r, cy + by * r + 1, br * r + 1, br * r * 0.9 + 1, rp[:2], seed=seed + i)
    for i, (bx, by, br) in enumerate(blobs):
        lo = -0.9 + (by + 0.5) * 0.5 + max(0, bx) * 0.35
        sp.ball(cx + bx * r, cy + by * r, br * r, br * r * 0.9, rp, seed=seed + i, lo=lo, hi=lo + 1.75, dith=0.3)
    # blossoms / fruit specks
    for i in range(int(r * 1.2)):
        x = int(cx + (h2(i, 1, seed) - 0.5) * r * 2.2); y = int(cy + (h2(i, 2, seed) - 0.5) * r * 1.8)
        if sp.im.getpixel((x, y))[3]:
            sp.pt(x, y, rp[5] if kind != 'leaf' or i % 3 else R['butter'][4])
    sp.base = yb; sp.cx = cx; sp.shadow = 'blob'; sp.sh_k = 0.2; sp.sh_dx = max(1, r // 4)
    return sp.finish()


def bush(r=5, kind='leaf', seed=0, berries=None):
    sp = Spr(r * 3 + 4, r * 2 + 5)
    cx = sp.w // 2; yb = sp.h - 3
    for i, (bx, br) in enumerate([(-0.6, 0.7), (0.6, 0.72), (0, 0.95)]):
        sp.ball(cx + bx * r, yb - br * r * 0.8, br * r, br * r * 0.85, R[kind], seed=seed + i, dith=0.3)
    if berries:
        for i in range(r):
            x = int(cx + (h2(i, 1, seed) - 0.5) * r * 2); y = int(yb - h2(i, 2, seed) * r * 1.3)
            if sp.im.getpixel((x, y))[3]: sp.pt(x, y, berries)
    # flatten bottom
    sp.base = yb; sp.cx = cx; sp.shadow = 'blob'
    return sp.finish()


def rock(r=4, seed=0, moss=False):
    sp = Spr(r * 3 + 4, r * 2 + 4)
    cx = sp.w // 2; yb = sp.h - 3
    sp.ball(cx - r * 0.3, yb - r * 0.6, r, r * 0.75, R['stone'][1:], seed=seed, dith=0.1)
    sp.ball(cx + r * 0.6, yb - r * 0.4, r * 0.6, r * 0.5, R['stone'][1:], seed=seed + 1, dith=0.1)
    sp.im.paste((0, 0, 0, 0), (0, yb + 1, sp.w, sp.h))
    if moss:
        for x in range(sp.w):
            for y in range(sp.h):
                if sp.im.getpixel((x, y))[3] and y < yb - r * 0.9 and h2(x, y, seed) < 0.7:
                    sp.pt(x, y, R['leaf'][4]); break
    sp.base = yb; sp.cx = cx; sp.shadow = 'blob'
    return sp.finish()


def haystack(r=5, seed=0):
    sp = Spr(r * 2 + 6, r * 2 + 5)
    cx = sp.w // 2; yb = sp.h - 3
    sp.ball(cx, yb - r * 0.75, r, r * 0.95, R['butter'][1:], seed=seed, dith=0.25)
    sp.im.paste((0, 0, 0, 0), (0, yb + 1, sp.w, sp.h))
    for i in range(r):
        x = int(cx + (h2(i, 1, seed) - 0.5) * r * 1.5); y = int(yb - h2(i, 2, seed) * r * 1.4)
        if sp.im.getpixel((x, y))[3]: sp.line(x, y, x + 1, y + 2, R['butter'][2])
    sp.base = yb; sp.cx = cx; sp.shadow = 'blob'
    return sp.finish()


def fence(length, s=1, gate=False):
    S = lambda v: int(round(v * s))
    ph = S(7)
    sp = Spr(length + 4, ph + 6)
    yb = sp.h - 3; x0 = 2
    for ry in (yb - ph + S(2), yb - ph + S(4.5)):
        sp.rect(x0, ry, x0 + length - 1, ry + max(0, S(1) - 1), R['wood'][4])
        sp.rect(x0, ry, x0 + length - 1, ry, R['wood'][5])
        sp.rect(x0, ry + max(1, S(1)), x0 + length - 1, ry + max(1, S(1)), R['wood'][2])
    step = S(7)
    n = max(1, round((length - 2) / step))
    for i in range(n + 1):
        px_ = x0 + int(i * (length - max(2, S(1.6))) / n)
        pw = max(2, S(1.6))
        sp.rect(px_, yb - ph, px_ + pw - 1, yb, R['wood'][3])
        sp.rect(px_, yb - ph, px_, yb, R['wood'][5])
        sp.rect(px_, yb - ph, px_ + pw - 1, yb - ph, R['wood'][5])
        sp.rect(px_ + pw - 1, yb - ph + 1, px_ + pw - 1, yb, R['wood'][2])
    sp.base = yb; sp.cx = sp.w // 2
    return sp.finish()


def lamp(s=1, lit=False):
    S = lambda v: int(round(v * s))
    sp = Spr(S(7) + 4, S(16) + 5)
    cx = sp.w // 2; yb = sp.h - 3
    sp.rect(cx, yb - S(12), cx + max(0, S(1) - 1), yb, R['slate'][2])
    sp.rect(cx, yb - S(12), cx, yb, R['slate'][4])
    sp.rect(cx - 1, yb, cx + max(1, S(1)), yb, R['slate'][1])
    sp.rect(cx - S(1.5), yb - S(15), cx + S(1.5) + max(0, S(1) - 1), yb - S(11), R['butter'][4])
    sp.rect(cx - S(1.5), yb - S(15), cx - S(1.5), yb - S(11), R['butter'][5])
    sp.rect(cx - S(2), yb - S(16), cx + S(2) + max(0, S(1) - 1), yb - S(15), R['slate'][2])
    sp.rect(cx - S(2), yb - S(11), cx + S(2) + max(0, S(1) - 1), yb - S(11), R['slate'][1])
    sp.base = yb; sp.cx = cx
    return sp.finish()


def mailbox(s=1):
    S = lambda v: int(round(v * s))
    sp = Spr(S(8) + 4, S(11) + 5)
    cx = sp.w // 2; yb = sp.h - 3
    sp.rect(cx, yb - S(6), cx + max(0, S(1) - 1), yb, R['wood'][3])
    sp.rect(cx - S(3), yb - S(10), cx + S(3), yb - S(6), R['rose'][3])
    sp.rect(cx - S(3), yb - S(10), cx + S(3), yb - S(10), R['rose'][5])
    sp.rect(cx - S(3), yb - S(6), cx + S(3), yb - S(6), R['rose'][1])
    sp.rect(cx + S(3) - 1, yb - S(12), cx + S(3), yb - S(9), R['butter'][4])
    sp.base = yb; sp.cx = cx
    return sp.finish()


def bench(s=1):
    S = lambda v: int(round(v * s))
    w = S(14)
    sp = Spr(w + 4, S(9) + 5)
    yb = sp.h - 3; x0 = 2
    sp.rect(x0, yb - S(8), x0 + w - 1, yb - S(5), R['wood'][4])
    sp.rect(x0, yb - S(8), x0 + w - 1, yb - S(8), R['wood'][5])
    sp.rect(x0, yb - S(6), x0 + w - 1, yb - S(6), R['wood'][2])
    sp.rect(x0, yb - S(4), x0 + w - 1, yb - S(3), R['wood'][5])
    sp.rect(x0, yb - S(3) + 1, x0 + w - 1, yb - S(3) + 1, R['wood'][3])
    for lx in (x0 + 1, x0 + w - 3):
        sp.rect(lx, yb - S(3) + 2, lx + 1, yb, R['wood'][2])
    sp.base = yb; sp.cx = sp.w // 2
    return sp.finish()


def barrel(s=1, water=False):
    S = lambda v: int(round(v * s))
    w = S(7); h = S(9)
    sp = Spr(w + 4, h + 5)
    yb = sp.h - 3; x0 = 2
    for y in range(yb - h, yb + 1):
        t = (y - (yb - h)) / h
        bulge = 1 if 0.15 < t < 0.85 else 0
        for x in range(x0 - bulge + 1, x0 + w + bulge):
            u = (x - x0) / w
            sp.pt(x, y, R['wood'][5 if u < 0.2 else (4 if u < 0.6 else 3)])
    for yy in (yb - h + S(2), yb - S(2)):
        sp.rect(x0, yy, x0 + w, yy, R['stone'][2]); sp.pt(x0 + 1, yy, R['stone'][4])
    sp.ell(x0 + 1, yb - h - 1, x0 + w - 1, yb - h + S(1.5), R['blue'][3] if water else R['wood'][2])
    if water: sp.pt(x0 + 2, yb - h, R['blue'][5])
    sp.base = yb; sp.cx = sp.w // 2
    return sp.finish()


def wateringcan(s=1):
    S = lambda v: int(round(v * s))
    sp = Spr(S(11) + 4, S(8) + 5)
    yb = sp.h - 3; x0 = 2 + S(2)
    sp.rect(x0, yb - S(5), x0 + S(5), yb, R['blue'][3])
    sp.rect(x0, yb - S(5), x0, yb, R['blue'][5]); sp.rect(x0 + S(5), yb - S(5), x0 + S(5), yb, R['blue'][2])
    sp.rect(x0, yb - S(5), x0 + S(5), yb - S(5), R['blue'][5])
    sp.line(x0 + S(5), yb - S(2), x0 + S(8), yb - S(6), R['blue'][3], w=max(1, S(1)))
    sp.rect(x0 + S(8) - 1, yb - S(7), x0 + S(8) + 1, yb - S(6), R['blue'][4])
    sp.line(x0 - S(2), yb - S(4), x0 - S(2), yb - S(1), R['blue'][2])
    sp.line(x0 - S(2), yb - S(4), x0, yb - S(4), R['blue'][2]); sp.line(x0 - S(2), yb - S(1), x0, yb - S(1), R['blue'][2])
    sp.base = yb; sp.cx = sp.w // 2; sp.shadow = 'blob'
    return sp.finish()


def crate(s=1, fill='carrot'):
    S = lambda v: int(round(v * s))
    w = S(8)
    sp = Spr(w + 4, S(8) + 5)
    yb = sp.h - 3; x0 = 2
    sp.rect(x0, yb - S(5), x0 + w - 1, yb, R['wood'][4])
    sp.rect(x0, yb - S(5), x0 + w - 1, yb - S(5), R['wood'][5])
    for yy in range(yb - S(5) + 2, yb, 3): sp.rect(x0, yy, x0 + w - 1, yy, R['wood'][3])
    sp.rect(x0, yb - S(5), x0, yb, R['wood'][5]); sp.rect(x0 + w - 1, yb - S(5), x0 + w - 1, yb, R['wood'][2])
    for i in range(1, w - 1):
        c = R['orange'][2 + int(h2(i, 3, 1) * 2)] if fill == 'carrot' else R['honey'][2 + int(h2(i, 3, 1) * 2)]
        sp.pt(x0 + i, yb - S(5) - 1, c)
        if i % 2: sp.pt(x0 + i, yb - S(5) - 2, R['leaf'][3] if fill == 'carrot' else c)
    sp.base = yb; sp.cx = sp.w // 2
    return sp.finish()


def flowers(n=5, spread=8, seed=0, cols=('rose', 'butter', 'cherry')):
    sp = Spr(spread * 2 + 4, spread + 6)
    yb = sp.h - 3
    for i in range(n):
        x = 2 + int(h2(i, 1, seed) * spread * 2); y = yb - int(h2(i, 2, seed) * spread * 0.8)
        c = R[cols[i % len(cols)]]
        sp.pt(x, y, R['leaf'][2]); sp.pt(x, y - 1, R['leaf'][3])
        sp.pt(x, y - 2, c[4]); sp.pt(x - 1, y - 2, c[3]); sp.pt(x + 1, y - 2, c[3]); sp.pt(x, y - 3, c[4]); sp.pt(x, y - 1, c[3])
        sp.pt(x, y - 2, R['butter'][5])
    sp.base = yb; sp.cx = sp.w // 2; sp.shadow = None
    return sp


def reeds(seed=0):
    sp = Spr(10, 12)
    for i in range(4):
        x = 1 + i * 2 + int(h2(i, seed, 1) * 2); hh = 5 + int(h2(i, seed, 2) * 4)
        sp.line(x, 10, x, 10 - hh, R['leaf'][3])
        if i % 2 == 0: sp.rect(x, 10 - hh - 2, x, 10 - hh, R['wood'][2])
    sp.base = 10; sp.cx = 5; sp.shadow = None
    return sp


def lily(seed=0):
    sp = Spr(7, 5)
    sp.rect(1, 1, 4, 2, R['leaf'][4]); sp.rect(2, 3, 3, 3, R['leaf'][3]); sp.pt(4, 1, R['leaf'][2])
    if seed % 2: sp.pt(2, 1, R['cherry'][4]); sp.pt(2, 0, R['cream'][5])
    sp.base = 3; sp.cx = 3; sp.shadow = None
    return sp


def dock(length=30, w=11):
    sp = Spr(w + 8, length + 8)
    x0 = 4
    for y in range(2, 2 + length):
        for x in range(x0, x0 + w):
            u = (x - x0) / w
            b = 4 if u < 0.7 else 3
            if u < 0.12: b = 5
            if (y - 2) % 4 == 3: b -= 2
            elif h2(x // 3, y // 4, 1) < 0.2: b -= 1
            sp.pt(x, y, R['wood'][b])
    for py in range(6, length, 9):
        for pxx in (x0 - 2, x0 + w):
            sp.rect(pxx, py - 3, pxx + 1, py + 4, R['wood'][2])
            sp.rect(pxx, py - 3, pxx + 1, py - 3, R['wood'][4])
    sp.rect(x0, 2 + length, x0 + w - 1, 2 + length + 2, R['wood'][1])
    sp.base = 2; sp.cx = sp.w // 2; sp.shadow = None
    return sp.finish()


def boat():
    sp = Spr(40, 40)
    cx = 20; yb = 34
    # hull
    for k in range(6):
        half = 14 - k * 1.2 - (2 if k == 5 else 0)
        for x in range(int(cx - half), int(cx + half) + 1):
            u = (x - (cx - half)) / (2 * half)
            c = R['wood'][4 if u < 0.3 else (3 if u < 0.75 else 2)]
            if k == 0: c = R['cream'][4] if u < 0.7 else R['cream'][3]
            if k == 1: c = R['rose'][3] if u < 0.7 else R['rose'][2]
            sp.pt(x, yb - 6 + k, c)
    # mast + sails
    sp.rect(cx, yb - 31, cx + 1, yb - 6, R['wood'][2])
    sp.rect(cx, yb - 31, cx, yb - 6, R['wood'][4])
    for y in range(yb - 29, yb - 8):
        t = (y - (yb - 29)) / 21
        Lr = int(2 + t * 13)
        for x in range(cx + 3, cx + 3 + Lr):
            u = (x - cx - 3) / max(1, Lr)
            c = R['cream'][5 if u < 0.45 else 4]
            if (y - yb) % 6 == 0: c = R['cream'][3]
            sp.pt(x, y, c)
        Ll = int(1 + t * 8)
        for x in range(cx - 2 - Ll, cx - 1):
            sp.pt(x, y, R['rose'][4] if (y // 3) % 2 else R['cream'][5])
    sp.poly([(cx + 2, yb - 34), (cx + 8, yb - 32), (cx + 2, yb - 30)], R['rose'][3])
    sp.base = yb; sp.cx = cx; sp.shadow = None
    sp.finish()
    # water ripples under the hull
    for (x0, x1, y, c) in ((4, 14, yb + 1, SEA[6]), (20, 36, yb + 1, SEA[5]), (8, 30, yb + 3, SEA[4]), (0, 6, yb + 2, SEA[5])):
        sp.line(x0, y, x1, y, c)
    return sp


def cloud(wd=40, seed=0):
    sp = Spr(wd + 8, int(wd * 0.5) + 10)
    cx = sp.w // 2; yb = sp.h - 4
    n = max(3, wd // 9)
    for i in range(n):
        t = i / (n - 1)
        r = wd * (0.16 + 0.12 * math.sin(t * math.pi)) * (0.85 + h2(i, seed, 1) * 0.3)
        sp.ball(4 + r + t * (wd - 2 * r), yb - r * 0.8, r, r * 0.85, R['cloud'][1:], seed=seed + i, lo=-0.95, hi=0.75, dith=0.12)
    sp.im.paste((0, 0, 0, 0), (0, yb + 1, sp.w, sp.h))
    sp.base = yb; sp.cx = cx; sp.shadow = None
    # soft lilac outline instead of ink
    src = sp.im.copy(); spx = src.load()
    for y in range(sp.h):
        for x in range(sp.w):
            if spx[x, y][3] == 0 and any(0 <= x + dx < sp.w and 0 <= y + dy < sp.h and spx[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                sp.pt(x, y, hx('8f7bb5'))
    return sp


def searock(r=4, seed=0):
    sp = rock(r, seed)
    d = sp.d
    d.line([1, sp.base + 1, sp.w - 2, sp.base + 1], fill=SEA[6])
    d.line([3, sp.base + 2, sp.w - 5, sp.base + 2], fill=SEA[5])
    sp.shadow = None
    return sp


def bee(seed=0):
    sp = Spr(4, 4)
    sp.pt(1, 2, R['butter'][3]); sp.pt(2, 2, INK); sp.pt(1, 1, R['cream'][5]); sp.pt(2, 1, R['cream'][5])
    sp.base = 3; sp.cx = 2; sp.shadow = None
    return sp


def table(s=1):
    """workbench with tools"""
    S = lambda v: int(round(v * s))
    w = S(13)
    sp = Spr(w + 4, S(9) + 6)
    yb = sp.h - 3; x0 = 2
    sp.rect(x0, yb - S(6), x0 + w - 1, yb - S(4), R['wood'][4])
    sp.rect(x0, yb - S(6), x0 + w - 1, yb - S(6), R['wood'][5])
    sp.rect(x0, yb - S(4), x0 + w - 1, yb - S(4), R['wood'][2])
    for lx in (x0 + 1, x0 + w - 3):
        sp.rect(lx, yb - S(4) + 1, lx + 1, yb, R['wood'][2]); sp.rect(lx, yb - S(4) + 1, lx, yb, R['wood'][3])
    sp.rect(x0 + 3, yb - S(2), x0 + w - 4, yb - S(2), R['wood'][2])
    # saw + plank on top
    sp.rect(x0 + 2, yb - S(7), x0 + S(6), yb - S(7), R['stone'][4])
    sp.rect(x0 + S(6), yb - S(8), x0 + S(7), yb - S(7), R['rose'][3])
    sp.rect(x0 + S(8), yb - S(8), x0 + w - 2, yb - S(7), R['butter'][3])
    sp.base = yb; sp.cx = sp.w // 2
    return sp.finish()


def signpost(s=1):
    S = lambda v: int(round(v * s))
    sp = Spr(S(10) + 4, S(11) + 5)
    cx = sp.w // 2; yb = sp.h - 3
    sp.rect(cx, yb - S(9), cx + max(0, S(1) - 1), yb, R['wood'][3])
    sp.poly([(cx - S(4), yb - S(9)), (cx + S(3), yb - S(9)), (cx + S(5), yb - S(7.5)), (cx + S(3), yb - S(6)), (cx - S(4), yb - S(6))], R['wood'][4])
    sp.line(cx - S(4), yb - S(9), cx + S(3), yb - S(9), R['wood'][5])
    sp.base = yb; sp.cx = cx
    return sp.finish()


def stump(s=1):
    S = lambda v: int(round(v * s))
    w = S(7)
    sp = Spr(w + 6 + S(5), S(10) + 5)
    yb = sp.h - 3; x0 = 3
    sp.rect(x0, yb - S(4), x0 + w, yb, R['wood'][3])
    sp.rect(x0, yb - S(4), x0 + 1, yb, R['wood'][4]); sp.rect(x0 + w - 1, yb - S(4), x0 + w, yb, R['wood'][2])
    sp.ell(x0, yb - S(6), x0 + w, yb - S(3), R['wood'][5])
    sp.ell(x0 + 2, yb - S(5.5), x0 + w - 2, yb - S(3.5), R['wood'][4])
    sp.rect(x0 - 1, yb, x0, yb, R['wood'][3]); sp.rect(x0 + w, yb, x0 + w + 1, yb, R['wood'][2])
    # axe stuck in it
    sp.line(x0 + w // 2, yb - S(5), x0 + w + S(3), yb - S(9), R['wood'][4], w=max(1, S(0.8)))
    sp.rect(x0 + w // 2 - S(1), yb - S(6.5), x0 + w // 2 + S(1), yb - S(4.5), R['stone'][4])
    sp.rect(x0 + w // 2 - S(1), yb - S(4.5), x0 + w // 2 + S(1), yb - S(4.5), R['stone'][2])
    sp.base = yb; sp.cx = sp.w // 2; sp.shadow = 'blob'
    return sp.finish()


def stepping(n=4, seed=0):
    sp = Spr(n * 6 + 4, 8)
    for i in range(n):
        x = 2 + i * 6; y = 2 + int(h2(i, seed, 1) * 2)
        sp.rect(x, y, x + 3, y + 2, R['stone'][4]); sp.rect(x, y, x + 3, y, R['stone'][5]); sp.rect(x, y + 2, x + 3, y + 2, R['stone'][3])
    sp.base = 5; sp.cx = sp.w // 2; sp.shadow = None
    return sp


def pet(s=1):
    """tiny green bun as the 'you are here' marker (stand-in for the real pet sprite)"""
    S = lambda v: int(round(v * s))
    sp = Spr(S(11) + 4, S(13) + 5)
    cx = sp.w // 2; yb = sp.h - 3
    r = S(4.2)
    g = [hx('3f8a6a'), hx('8fd6a8'), hx('b9efcb'), hx('d8f8dd'), hx('f0fff0')]
    for sx in (-1, 1):
        ex = cx + sx * r * 0.5
        sp.rect(ex - max(1, S(0.8)), yb - r * 2 - S(3), ex + max(0, S(0.8)) - (0 if s > 1 else 1), yb - r * 1.2, g[2] if sx < 0 else g[1])
        sp.rect(ex - max(1, S(0.8)), yb - r * 2 - S(3), ex - max(1, S(0.8)), yb - r * 1.2, g[3] if sx < 0 else g[2])
        if s >= 2: sp.rect(ex, yb - r * 2 - S(2), ex, yb - r * 1.4, hx('f7a8b8'))
    for y in range(int(yb - 2 * r), yb + 1):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            dx = (x - cx) / (r + 0.6); dy = (y - (yb - r)) / (r + 0.3)
            if dx * dx + dy * dy <= 1:
                l = -dx * 0.6 - dy * 0.7
                sp.pt(x, y, g[3] if l > 0.45 else (g[2] if l > -0.35 else g[1]))
    e = max(1, int(r * 0.42))
    for sx in (-1, 1):
        sp.pt(cx + sx * e, yb - r, INK)
        if s >= 2: sp.pt(cx + sx * e, yb - r - 1, INK)
        sp.pt(cx + sx * (e + 1 + (s >= 2)), yb - r + 1 + (s >= 2), hx('f7a8b8'))
    if s >= 2: sp.pt(cx, yb - r + 1, hx('3f7d62'))
    sp.base = yb; sp.cx = cx; sp.shadow = 'blob'
    return sp.finish()


# ---------------------------------------------------------------- scenes -----------
ISLAND_POLY = [(22, 104), (44, 80), (74, 72), (97, 84), (112, 68), (140, 60), (166, 68), (180, 96), (186, 132),
               (184, 170), (189, 208), (184, 250), (170, 286), (142, 306), (112, 316), (82, 312), (52, 306),
               (28, 282), (11, 248), (8, 214), (14, 186), (7, 160), (10, 128)]


# Where everything stands: layout.json, which the map editor exports
# (paths, plazas, ponds, clouds, every prop, and each area's tap-shape
# seed, bubble and pet spot). x is a prop's middle, y the line it stands on.
LAYOUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'layout.json')


def layout(name):
    import json
    with open(LAYOUT_FILE) as f: return json.load(f)[name]


def terrain_bits(name):
    lay = layout(name)
    paths = [([tuple(p) for p in pa['points']], pa['width']) for pa in lay['paths']]
    return paths, [tuple(p) for p in lay['plazas']], [tuple(p) for p in lay['ponds']]


def items_of(name, ws=False, hive=False, perch_=None, lit=False):
    """The props of a map from layout.json: the workshop, the hives and the
    perch only once they exist in the game (the game lays them over the
    picture)."""
    have = {'workshop': ws, 'hive': hive, 'perch': bool(perch_)}
    env = dict(globals(), lit=lit, bird=perch_ == 'home')
    it = []
    for e in layout(name)['items']:
        if e.get('hidden'): continue
        w = e.get('when')
        if w:
            on = have[w.lstrip('!')]
            if w.startswith('!'): on = not on
            if not on: continue
        it.append((eval(e['make'], env), e['x'], e['y']))
    return it


def island_terrain():
    seeds = [('meadow', 46, 124, 1.0), ('grass', 150, 112, 1.0), ('home', 97, 186, 0.85), ('wheat', 44, 262, 1.05), ('petal', 152, 258, 1.0)]
    paths, plazas, ponds = terrain_bits('island')
    return build_terrain(ISLAND_POLY, seeds, paths, seed=7, ponds=ponds, plazas=plazas)


def island_items(ws=False, hive=False, perch_=None, lit=False):
    return items_of('island', ws, hive, perch_, lit)


def island_clouds():
    lay = Image.new('RGBA', (W, H))
    for (wd, x, y, sd) in layout('island')['clouds']:
        c = cloud(wd, sd)
        paste_clip(lay, c.im, x - c.cx, y - c.base)
    return lay


BACKYARD_POLY = [(-30, 132), (20, 104), (70, 96), (112, 80), (150, 84), (176, 104), (186, 150), (182, 210),
                 (190, 268), (184, 330), (192, 380), (200, 460), (-30, 460)]


def backyard_terrain():
    seeds = [('grass', 100, 200, 1.0), ('home', -20, 430, 0.55), ('meadow', -30, 120, 0.45)]
    paths, plazas, ponds = terrain_bits('backyard')
    return build_terrain(BACKYARD_POLY, seeds, paths, seed=23, cliff=10, ponds=ponds, plazas=plazas)


def backyard_items(ws=False, hive=False, perch_=None):
    return items_of('backyard', ws, hive, perch_)


# Kept for the mockup page (compose*.html): the full scenes.
def island_scene(ws=True, name='island_scene'):
    ter, info = island_terrain()
    scene = compose(ter, island_items(ws, True, 'home'), info)
    scene.save(os.path.join(OUT, name + '.png'))
    island_clouds().save(os.path.join(OUT, 'island_clouds.png'))
    return scene


def backyard_scene(percy=True, name='backyard_scene'):
    ter, info = backyard_terrain()
    scene = compose(ter, backyard_items(True, True, 'home' if percy else 'away'), info)
    scene.save(os.path.join(OUT, name + '.png'))
    return scene


# ---------------------------------------------------------------- UI sprites -------
def ui():
    def save(sp, name):
        im = sp.im if isinstance(sp, Spr) else sp
        im.save(os.path.join(OUT, name + '.png'))

    # wooden sign 9-slice (24x18, slice 7) with bottom lip
    def board(name, face, w=25, h=19, lip=3, nails=True, rad=2):
        sp = Spr(w, h)
        sp.rect(1, 1, w - 2, h - 2, face[1])                        # lip colour
        sp.rect(1, 1, w - 2, h - 2 - lip, face[3])
        sp.rect(2, 1, w - 3, 1, face[5]); sp.rect(1, 2, 1, h - 3 - lip, face[4])
        sp.rect(2, 2, w - 3, 2, face[4])
        sp.rect(w - 2, 2, w - 2, h - 2 - lip, face[2]); sp.rect(2, h - 2 - lip, w - 2, h - 2 - lip, face[2])
        if nails:
            for (nx, ny) in ((3, 4), (w - 4, 4), (3, h - 5 - lip), (w - 4, h - 5 - lip)):
                sp.pt(nx, ny, face[1]); sp.pt(nx, ny - 1, face[5])
        m = Image.new('L', (w, h), 0)
        ImageDraw.Draw(m).rounded_rectangle([1, 1, w - 2, h - 2], radius=rad, fill=255)
        o = Image.new('L', (w, h), 0)
        ImageDraw.Draw(o).rounded_rectangle([0, 0, w - 1, h - 1], radius=rad + 1, fill=255)
        out = Image.new('RGBA', (w, h))
        out.paste(Image.new('RGBA', (w, h), INK), (0, 0), o)
        out.paste(sp.im, (0, 0), m)
        if rad >= 3:   # re-light the rounded top-left corner
            for (x, y) in ((rad, 1), (rad - 1, 2), (1, rad), (2, rad - 1)):
                if m.getpixel((x, y)): out.putpixel((x, y), face[5])
        save(out, name)

    board('ui_sign', R['wood'][0:1] + [hx('7a4a38')] + R['wood'][2:], lip=3)
    board('ui_sign_pick', R['butter'], lip=3)
    board('ui_sign_lock', R['stone'], lip=3)
    board('ui_btn_blue', [hx('24386e'), hx('2f4f94'), hx('4a78c6'), hx('6a9fe0'), hx('8fc0f2'), hx('c6e6fb')], h=23, lip=4, nails=False, rad=4)
    board('ui_btn_pink', R['rose'][0:1] + [hx('a8405f'), hx('e05a7a'), hx('f48fb1'), hx('ffb3c8'), hx('ffe0e8')], h=23, lip=4, nails=False, rad=4)
    board('ui_btn_green', [hx('1f4a40'), hx('2f6b5a'), hx('4a9a78'), hx('6cc19a'), hx('9be0b8'), hx('d8f8dd')], h=23, lip=4, nails=False, rad=4)
    board('ui_btn_cream', [hx('5b3f6e'), hx('b99aa0'), hx('f3e0cf'), hx('fff7ec'), hx('ffffff'), hx('ffffff')], h=21, lip=3, nails=False, rad=4)
    # parchment panel 9-slice with wooden frame
    sp = Spr(27, 27)
    sp.rect(1, 0, 25, 26, INK); sp.rect(0, 1, 26, 25, INK)
    sp.rect(1, 1, 25, 25, R['wood'][3]); sp.rect(1, 1, 25, 1, R['wood'][5]); sp.rect(1, 1, 1, 22, R['wood'][4])
    sp.rect(1, 23, 25, 25, R['wood'][1]); sp.rect(25, 2, 25, 22, R['wood'][2])
    sp.rect(3, 3, 23, 21, R['wood'][1])
    sp.rect(4, 4, 22, 20, R['cream'][4]); sp.rect(4, 4, 22, 4, R['cream'][2]); sp.rect(4, 4, 4, 20, R['cream'][3])
    for c in ((2, 2), (24, 2), (2, 22), (24, 22)): sp.pt(c[0], c[1], R['butter'][4])
    save(sp, 'ui_panel')

    # icon bubble 26x30 with tail + drop shadow
    def bubble(name, face, ring):
        sp = Spr(28, 32)
        cx, cy, r = 13, 13, 11
        # shadow
        for y in range(32):
            for x in range(28):
                if (x - cx - 1) ** 2 + (y - cy - 3) ** 2 <= (r + 1.4) ** 2: sp.pt(x, y, (43, 33, 64, 70))
        t = Spr(28, 32)
        for y in range(32):
            for x in range(28):
                d2 = (x - cx) ** 2 + (y - cy) ** 2
                if d2 <= (r + 0.4) ** 2:
                    c = face[1]
                    if d2 > (r - 1.6) ** 2: c = ring[1] if (x - cx) + (y - cy) > 0 else ring[0]
                    elif (x - cx) + (y - cy) > r * 0.95: c = face[2]
                    elif (x - cx + 4) ** 2 + (y - cy + 5) ** 2 < 5: c = face[0]
                    t.pt(x, y, c)
        for k in range(5):
            t.rect(cx - 3 + k, cy + r + k - 1, cx + 3 - k, cy + r + k - 1, ring[1])
        t.rect(cx - 1, cy + r - 2, cx + 1, cy + r - 1, face[2])
        t.finish()
        sp.im.alpha_composite(t.im)
        save(sp, name)

    bubble('ui_bubble', [hx('ffffff'), R['cream'][4], R['cream'][3]], [R['butter'][4], R['butter'][3]])
    bubble('ui_bubble_blue', [hx('ffffff'), hx('eaf7fe'), hx('c9ecfb')], [R['blue'][4], R['blue'][3]])

    # icons 14x14
    def icon(name, fn, w=14, h=14):
        sp = Spr(w, h); fn(sp); sp.finish(); save(sp, name)

    def hammer(sp):
        sp.line(4, 11, 9, 5, R['wood'][3], w=2); sp.line(4, 10, 8, 5, R['wood'][5])
        sp.rect(5, 2, 11, 5, R['stone'][3]); sp.rect(5, 2, 11, 2, R['stone'][5]); sp.rect(5, 5, 11, 5, R['stone'][2])
        sp.rect(3, 3, 4, 4, R['stone'][3]); sp.rect(11, 3, 12, 4, R['stone'][2])

    def honey(sp):
        sp.rect(3, 5, 10, 11, R['honey'][2]); sp.rect(4, 12, 9, 12, R['honey'][1])
        sp.rect(3, 5, 4, 11, R['honey'][4]); sp.rect(9, 6, 10, 11, R['honey'][1]); sp.rect(5, 6, 5, 9, R['honey'][3])
        sp.rect(3, 2, 10, 4, R['cream'][4]); sp.rect(3, 2, 10, 2, R['cream'][5]); sp.rect(3, 4, 10, 4, R['rose'][3])
        sp.rect(5, 8, 8, 10, R['cream'][4]); sp.pt(6, 9, R['honey'][1]); sp.pt(7, 9, R['honey'][1])

    def carrot(sp):
        for i, (x, y, w_) in enumerate([(7, 5, 4), (6, 6, 5), (5, 7, 5), (4, 8, 5), (3, 9, 4), (2, 10, 4), (2, 11, 2)]):
            sp.rect(x, y, x + w_ - 1, y, R['orange'][2])
            sp.pt(x, y, R['orange'][4]); sp.pt(x + w_ - 1, y, R['orange'][1])
        sp.pt(6, 8, R['orange'][1]); sp.pt(4, 10, R['orange'][1])
        for (x, y, k) in ((10, 4, 3), (11, 3, 4), (12, 2, 4), (9, 3, 3), (9, 2, 4), (11, 5, 2), (12, 5, 3), (12, 4, 3), (10, 2, 5)):
            sp.pt(x, y, R['leaf'][k])

    def drop(sp):
        for (y, x0, x1) in ((1, 6, 7), (2, 6, 7), (3, 5, 8), (4, 5, 8), (5, 4, 9), (6, 3, 10), (7, 3, 10), (8, 3, 10), (9, 3, 10), (10, 4, 9), (11, 5, 8)):
            sp.rect(x0, y, x1, y, R['blue'][3])
            sp.pt(x1, y, R['blue'][2])
        sp.rect(4, 10, 9, 10, R['blue'][2]); sp.rect(5, 11, 8, 11, R['blue'][2])
        sp.rect(5, 6, 5, 8, R['blue'][5]); sp.pt(6, 4, R['blue'][5])

    def lock(sp):
        sp.rect(3, 6, 10, 11, R['butter'][3]); sp.rect(3, 6, 10, 6, R['butter'][5]); sp.rect(3, 11, 10, 11, R['butter'][1])
        sp.rect(4, 2, 5, 5, R['stone'][3]); sp.rect(8, 2, 9, 5, R['stone'][3]); sp.rect(5, 1, 8, 2, R['stone'][4])
        sp.rect(6, 8, 7, 9, R['wood'][1])

    def homei(sp):
        sp.rect(3, 7, 10, 12, R['cream'][4]); sp.rect(9, 7, 10, 12, R['cream'][2])
        for k in range(6):
            sp.rect(6 - k, 2 + k, 7 + k, 2 + k, R['rose'][3]); sp.pt(6 - k, 2 + k, R['rose'][5])
        sp.rect(6, 9, 7, 12, R['wood'][3])

    def arrow(sp):
        for k in range(5):
            sp.rect(2 + k, 6 - k, 3 + k, 7 + k, R['cream'][5])
        sp.rect(6, 5, 11, 8, R['cream'][5])

    def coin(sp):
        sp.ball(6.5, 6.5, 5.5, 5.5, R['butter'][2:], dith=0)
        sp.rect(6, 4, 7, 9, R['butter'][2]); sp.pt(6, 4, R['butter'][5])

    def xmark(sp):
        for k in range(7):
            sp.rect(3 + k, 3 + k, 4 + k, 3 + k, R['cream'][5]); sp.rect(9 - k, 3 + k, 10 - k, 3 + k, R['cream'][5])

    def mapi(sp):
        sp.poly([(1, 3), (5, 2), (9, 3), (12, 2), (12, 11), (9, 12), (5, 11), (1, 12)], R['cream'][4])
        sp.line(5, 2, 5, 11, R['cream'][2]); sp.line(9, 3, 9, 12, R['cream'][2])
        sp.rect(2, 5, 4, 7, R['grass'][3]); sp.rect(6, 7, 8, 9, R['blue'][3]); sp.rect(10, 4, 11, 6, R['rose'][3])

    def fish(sp):
        sp.ell(2, 4, 9, 10, R['orange'][2]); sp.rect(4, 5, 7, 5, R['orange'][4]); sp.rect(4, 9, 7, 9, R['orange'][1])
        sp.poly([(9, 7), (12, 4), (12, 10)], R['orange'][1]); sp.pt(4, 6, INK); sp.pt(4, 5, R['cream'][5])

    icon('ic_fish', fish)
    for n, f in (('ic_hammer', hammer), ('ic_honey', honey), ('ic_carrot', carrot), ('ic_drop', drop), ('ic_lock', lock),
                 ('ic_home', homei), ('ic_arrow', arrow), ('ic_coin', coin), ('ic_x', xmark), ('ic_map', mapi)):
        icon(n, f)
    board('ui_tip', R['slate'], w=25, h=17, lip=2, nails=False, rad=3)
    bubble('ui_bubble_grey', [hx('ffffff'), R['stone'][5], R['stone'][4]], [R['stone'][4], R['stone'][3]])

    def star(sp):
        for (y, x0, x1) in ((1, 6, 7), (2, 6, 7), (3, 5, 8), (4, 1, 12), (5, 2, 11), (6, 3, 10), (7, 4, 9), (8, 3, 10), (9, 3, 10), (10, 2, 5), (10, 8, 11)):
            sp.rect(x0, y, x1, y, R['butter'][3])
        sp.rect(6, 2, 6, 5, R['butter'][5]); sp.rect(3, 5, 6, 5, R['butter'][5]); sp.rect(8, 8, 9, 9, R['butter'][2])

    def quest(sp):
        for (x, y) in ((5, 2), (6, 2), (7, 2), (8, 2), (4, 3), (5, 3), (8, 3), (9, 3), (8, 4), (9, 4), (7, 5), (8, 5), (6, 6), (7, 6), (6, 7), (7, 7), (6, 10), (7, 10), (6, 11), (7, 11)):
            sp.pt(x, y, R['stone'][2])

    icon('ic_star', star); icon('ic_question', quest)
    for nm, n_ in (('fx_sparkle', 4), ('fx_sparkle_s', 2)):
        sp = Spr(n_ * 2 + 3, n_ * 2 + 3); c = n_ + 1
        for k in range(-n_, n_ + 1):
            sp.pt(c + k, c, R['butter'][4] if abs(k) > n_ // 2 else hx('ffffff')); sp.pt(c, c + k, R['butter'][4] if abs(k) > n_ // 2 else hx('ffffff'))
        if n_ > 2:
            for (dx, dy) in ((1, 1), (-1, 1), (1, -1), (-1, -1)): sp.pt(c + dx, c + dy, R['butter'][5])
        save(sp, nm)
    for i, wd in enumerate((26, 18)):
        sp = Spr(wd + 8, wd // 2 + 10); yb = sp.h - 4; n_ = 4
        dr = [hx('c9a57e'), hx('e3c9a0'), hx('f3e2c0'), hx('fdf4dc')]
        for k in range(n_):
            t = k / (n_ - 1); r = wd * (0.17 + 0.1 * math.sin(t * math.pi))
            sp.ball(4 + r + t * (wd - 2 * r), yb - r * 0.8, r, r * 0.85, dr, seed=k + i, lo=-0.95, hi=0.8, dith=0.12)
        sp.im.paste((0, 0, 0, 0), (0, yb + 1, sp.w, sp.h))
        src = sp.im.copy()
        for y in range(sp.h):
            for x in range(sp.w):
                if src.getpixel((x, y))[3] == 0 and any(0 <= x + dx < sp.w and 0 <= y + dy < sp.h and src.getpixel((x + dx, y + dy))[3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    sp.pt(x, y, hx('a9794f'))
        save(sp, 'fx_dust%d' % i)
    sp = Spr(30, 30)
    for y in range(30):
        for x in range(30):
            d = math.hypot(x - 14.5, y - 14.5)
            if 10.5 <= d <= 13: sp.pt(x, y, R['butter'][5] if (x + y) < 26 else R['butter'][3])
    sp.finish(); save(sp, 'ui_ring')
    sp = Spr(13, 8)
    for k in range(6):
        sp.rect(6 - k, 1 + k, 6 + k, 1 + k, R['wood'][3]); sp.pt(6 - k, 1 + k, R['wood'][5]); sp.pt(6 + k, 1 + k, R['wood'][2])
    sp.finish(); sp.im.paste((0, 0, 0, 0), (0, 7, 13, 8)); save(sp, 'ui_tail')
    # count badge
    sp = Spr(11, 11)
    sp.ball(5, 5, 4.4, 4.4, [R['rose'][2], R['rose'][3], R['rose'][3], R['rose'][4]], dith=0)
    sp.finish(); save(sp, 'ui_badge')
    # "you are here" arrow
    sp = Spr(11, 9)
    for k in range(4): sp.rect(2 + k, 2 + k, 8 - k, 2 + k, R['butter'][4] if k < 2 else R['butter'][3])
    sp.finish(); save(sp, 'ui_here')


# ---------------------------------------------------------------- game export ------
# `python3 draw.py game` writes the map pictures and tap shapes the game
# reads into public/sprites/map/ (see docs/MAP_GUIDE.md):
#   <map>.png                the picture
#   <map>-night.png          lights drawn bright over the dimmed picture at night
#   <map>-locked-<area>.png  clouds over an area while it's locked
#   <map>-x-<extra>.png      a building laid over the picture once it exists
#   <map>.json               size, areas (tap shape, bubble spot, pet spot), extras
GAME = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'public', 'sprites', 'map'))


def diff_layer(full, base):
    a = np.asarray(full).astype(np.int16); b = np.asarray(base).astype(np.int16)
    m = (np.abs(a - b).sum(axis=2) > 0)
    out = np.zeros_like(np.asarray(full))
    out[m] = np.asarray(full)[m]
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def inside(poly, x, y):
    c = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c


def shape_of(mask):
    """A tap shape as an SVG path: one rectangle per run of pixels."""
    d = []; ys, xs = np.where(mask)
    for y in range(mask.shape[0]):
        row = mask[y]; x = 0
        while x < mask.shape[1]:
            if row[x]:
                x0 = x
                while x < mask.shape[1] and row[x]: x += 1
                d.append(f'M{x0} {y}h{x - x0}v1h-{x - x0}z')
            else: x += 1
    box = [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]
    return ''.join(d), box


def areas_by_seeds(land, seeds, extra=None):
    """Splits the land between the areas: each pixel goes to the nearest seed
    (a seed can have a reach, and `extra` claims pixels first)."""
    masks = {k: np.zeros((H, W), bool) for k in seeds}
    for y in range(H):
        for x in range(W):
            if extra:
                k = extra(x, y)
                if k: masks[k][y, x] = True; continue
            if not land[y, x]: continue
            best, bd = None, 1e9
            for k, (sx, sy, reach) in seeds.items():
                d = math.hypot(x - sx, y - sy)
                if reach and d > reach: continue
                if d < bd: best, bd = k, d
            if best: masks[best][y, x] = True
    return masks


def write_map(name, base, extras, lights, covers, masks, spots, night):
    import json
    base.save(os.path.join(GAME, name + '.png'))
    if lights is not None: lights.save(os.path.join(GAME, name + '-night.png'))
    for k, im in covers.items(): im.save(os.path.join(GAME, f'{name}-locked-{k}.png'))
    for k, (im, when) in extras.items(): im.save(os.path.join(GAME, f'{name}-x-{k}.png'))
    areas = {}
    for k, m in masks.items():
        d, box = shape_of(m)
        label, pin = spots[k]
        areas[k] = {'shape': d, 'box': box, 'label': list(label), 'pin': list(pin)}
    out = {'width': W, 'height': H, 'night': night, 'locked': sorted(covers), 'areas': areas,
           'extras': [{'id': k, 'when': when} for k, (im, when) in extras.items()]}
    with open(os.path.join(GAME, name + '.json'), 'w') as f: json.dump(out, f, separators=(',', ':'))


def area_bits(name):
    """Each area's tap-shape seed (x, y, reach: 0 for no limit), and where
    its bubble points (bottom tip) and where the pet stands."""
    areas = layout(name)['areas']
    return ({k: tuple(a['seed']) for k, a in areas.items()},
            {k: (tuple(a['bubble']), tuple(a['pet'])) for k, a in areas.items()})


def game():
    os.makedirs(GAME, exist_ok=True)
    # ---- the island
    ter, info = island_terrain()
    base = compose(ter, island_items(), info)
    lit = compose(ter, island_items(lit=True), info)
    extras = {
        'workshop': (diff_layer(compose(ter, island_items(ws=True), info), base), 'workbench'),
        'hive': (diff_layer(compose(ter, island_items(hive=True), info), base), 'hive'),
        'perch': (diff_layer(compose(ter, island_items(perch_='home'), info), base), 'perch'),
        'perchAway': (diff_layer(compose(ter, island_items(perch_='away'), info), base), 'perchAway'),
    }
    land = np.zeros((H, W), bool)
    for y in range(H):
        for x in range(W): land[y, x] = inside(ISLAND_POLY, x, y)
    ship = lambda x, y: 'ship' if (math.hypot(x - 120, y - 352) < 30 or (92 <= x <= 108 and 304 <= y <= 344)) else None
    seeds, spots = area_bits('island')
    masks = areas_by_seeds(land, seeds, ship)
    write_map('island', base, extras, diff_layer(lit, base), {'fields': island_clouds()}, masks, spots, True)
    # ---- the Backyard, close up
    ter, info = backyard_terrain()
    base = compose(ter, backyard_items(), info)
    extras = {
        'workshop': (diff_layer(compose(ter, backyard_items(ws=True), info), base), 'workbench'),
        'hive': (diff_layer(compose(ter, backyard_items(hive=True), info), base), 'hive'),
        'perch': (diff_layer(compose(ter, backyard_items(perch_='home'), info), base), 'perch'),
        'perchAway': (diff_layer(compose(ter, backyard_items(perch_='away'), info), base), 'perchAway'),
    }
    land = np.zeros((H, W), bool)
    for y in range(H):
        for x in range(W): land[y, x] = inside(BACKYARD_POLY, x, y) and y > 100
    seeds, spots = area_bits('backyard')
    masks = areas_by_seeds(land, seeds)
    write_map('backyard', base, extras, None, {}, masks, spots, False)


def editor_pieces():
    """Everything the map editor needs, as data: each map's bare ground,
    its clouds, and every prop as its own picture with its shadow."""
    import base64, io, json
    def url(im):
        b = io.BytesIO(); im.save(b, 'PNG')
        return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
    out = {}
    for name, terrain in (('island', island_terrain), ('backyard', backyard_terrain)):
        ter, info = terrain()
        env = dict(globals(), lit=False, bird=True)
        pieces = {}
        for e in layout(name)['items']:
            spr = eval(e['make'], env)
            sh = Image.new('L', (W * 2, H * 2), 0)
            paste_big(sh, spr, W, H)
            box = sh.getbbox()
            shadow = None
            if box:
                a = sh.crop(box)
                im = Image.new('RGBA', a.size, (24, 30, 86, 0))
                im.putalpha(a.point(lambda v: 92 if v else 0))
                shadow = {'src': url(im), 'dx': box[0] - W, 'dy': box[1] - H}
            pieces[e['id']] = {'src': url(spr.im), 'cx': spr.cx, 'base': spr.base, 'w': spr.w, 'h': spr.h, 'shadow': shadow}
        m = {'width': W, 'height': H, 'ground': url(ter), 'pieces': pieces}
        if name == 'island': m['clouds'] = url(island_clouds())
        out[name] = m
    return out


def paste_big(layer, spr, x, y):
    """paste()'s shadow on a layer twice the map's size, so nothing is cut."""
    global W, H
    w0, h0 = W, H
    W, H = layer.size
    try: paste(None, spr, x, y, layer)
    finally: W, H = w0, h0


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if what == 'game': game(); sys.exit()
    if what == 'editor':
        # The map editor page: python3 draw.py editor <out.html>
        import json
        data = json.dumps({'pieces': editor_pieces(), 'layout': json.load(open(LAYOUT_FILE))})
        tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'editor-template.html')).read()
        with open(sys.argv[2], 'w') as f: f.write(tpl.replace('__DATA__', data))
        sys.exit()
    if what in ('all', 'ui'): ui()
    if what in ('all', 'island'):
        island_scene(False, 'island_scene_nows')
        island_scene().resize((W * 4, H * 4), Image.NEAREST).save(os.path.join(OUT, 'island_x4.png'))
    if what in ('all', 'backyard'):
        backyard_scene(False, 'backyard_scene_away')
        backyard_scene().resize((W * 4, H * 4), Image.NEAREST).save(os.path.join(OUT, 'backyard_x4.png'))
