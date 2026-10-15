#!/usr/bin/env python3
"""Build hand-quality 64x64 and 32x32 mip levels for the 128px wall-face textures.

Per level, from the 128 source (never chained):
  1. area-downscale (box average; alpha-weighted, opaque if >=50% of block is opaque)
  2. snap to the texture's own existing colours (no new colours, no dithering)
  3. 1px dark seams: a block crossed edge-to-edge by a dark run becomes a seam pixel,
     so a 1px mortar line maps to exactly one output row/column (never vanishes/doubles)
  4. merge isolated single pixels (wraparound neighbours, so tiling stays seamless)
  5. nudge to mean luminance within 0.98-1.02 of the 128 by swapping cheapest
     pixels to their next-nearest palette colour (seam pixels untouched)
Writes <name>_64.png / <name>_32.png next to the source and wall_mips.json.
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TEX = ROOT / 'public/proto3d/tex3d'
NAMES = ['wall_plain', 'wall_plain_2', 'wall_plain_3', 'wall_plain_4', 'wall_pilaster',
         'wall_knot', 'wall_knot_2', 'wall_knot_3', 'wall_knot_4',
         'door_locked', 'door_open', 'door_panel', 'secret_closed', 'secret_open']
LEVELS = [64, 32]
LW = np.array([0.299, 0.587, 0.114])

def luma(a): return a[..., :3] @ LW

def build(src, size):
    a = np.asarray(src.convert('RGBA')).astype(float)
    n = a.shape[0]; f = n // size
    op = a[..., 3] > 127
    pal = np.unique(a[op][:, :3].astype(int), axis=0).astype(float)
    pl = pal @ LW
    L = luma(a)
    # mortar / edge lines: dark bands with long straight runs, thinned to a 1px centre line
    dk = op & (L < 35)
    def runlen(m, axis):
        # length of the straight run each pixel belongs to (no wrap for simplicity, then wrap via tiling 3x)
        t = np.concatenate([m, m, m], axis)
        n = m.shape[axis]
        out = np.zeros(t.shape, int)
        t2 = np.moveaxis(t, axis, 0); o2 = np.moveaxis(out, axis, 0)
        for j in range(t2.shape[1]):
            col = t2[:, j]; i = 0
            while i < len(col):
                if col[i]:
                    k = i
                    while k < len(col) and col[k]: k += 1
                    o2[i:k, j] = k - i; i = k
                else: i += 1
        return np.take(out, range(n, 2 * n), axis)
    hband = dk & (runlen(dk, 1) >= 6)
    vband = dk & (runlen(dk, 0) >= 6) & ~hband
    def centre(band, axis):
        rl = runlen(band, axis)
        c = np.zeros_like(band)
        n = band.shape[axis]
        bt = np.moveaxis(band, axis, 0); ct = np.moveaxis(c, axis, 0); rt = np.moveaxis(rl, axis, 0)
        for j in range(bt.shape[1]):
            i = 0
            while i < n:
                if bt[i, j] and (i == 0 or not bt[i - 1, j]):
                    ln = rt[i, j]
                    if ln <= 5: ct[(i + (ln - 1) // 2) % n, j] = True
                    i += max(ln, 1)
                else: i += 1
        return c
    hseam, vseam = centre(hband, 0), centre(vband, 1)
    band = hband | vband
    dark = hseam | vseam
    seam_col = None
    if dark.any():
        cols, cn = np.unique(a[band][:, :3].astype(int), axis=0, return_counts=True)
        seam_col = cols[np.argmax(cn)].astype(float)
    blk = lambda x: x.reshape(size, f, size, f, *x.shape[2:]).swapaxes(1, 2)
    A, O, B, DH, DV = blk(a), blk(op), blk(band), blk(hseam), blk(vseam)
    w = (O & ~B).astype(float)
    w = np.where(w.sum((2, 3), keepdims=True) > 0, w, O.astype(float))[..., None]
    cnt = w.sum((2, 3))
    mean = (A[..., :3] * w).sum((2, 3)) / np.maximum(cnt, 1)
    alpha = O.mean((2, 3)) >= 0.5
    # restore carved detail lost to averaging: wraparound local-contrast boost before snapping
    k = 0.6 if f <= 2 else 1.0
    bl = sum(np.roll(np.roll(mean, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9
    mean = np.clip(mean + k * (mean - bl), 0, 255)
    d = ((mean[:, :, None, :] - pal[None, None]) ** 2 * [3, 4, 2]).sum(-1)
    order = np.argsort(d, axis=-1)
    idx = order[..., 0].copy()
    out = pal[idx].copy()
    # seams: full horizontal row or full vertical column of dark pixels inside the block
    seam = (DH.any((2, 3)) | DV.any((2, 3))) & alpha if seam_col is not None else np.zeros((size, size), bool)
    if seam_col is not None:
        # at coarse levels a seam pixel stands for ~1/f of mortar and the rest stone: lighten it
        tgt = seam_col if f <= 2 else seam_col * 0.55 + mean[alpha & ~seam].mean(0) * 0.45
        si = int(np.argmin(((pal - tgt) ** 2).sum(1)))
        idx[seam] = si; out[seam] = pal[si]
    # isolated pixels
    for _ in range(2):
        ch = False
        for y in range(size):
            for x in range(size):
                if seam[y, x] or not alpha[y, x]: continue
                nb = [(y + dy) % size for dy in (-1, 1)]
                n4 = [idx[(y-1) % size, x], idx[(y+1) % size, x], idx[y, (x-1) % size], idx[y, (x+1) % size]]
                if idx[y, x] not in n4:
                    vals = [idx[(y+dy) % size, (x+dx) % size] for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                            if (dy or dx) and alpha[(y+dy) % size, (x+dx) % size]]
                    if not vals: continue
                    u, c = np.unique(vals, return_counts=True)
                    if c.max() >= 3:
                        idx[y, x] = u[np.argmax(c)]; ch = True
        out = pal[idx]
        if not ch: break
    ref = L[op].mean()
    def ratio(): return (pl[idx][alpha]).mean() / ref
    # brightness nudge: swap cheapest pixels to next-nearest palette colour in the needed direction
    for _ in range(size * size * 2):
        r = ratio()
        if 0.99 <= r <= 1.01: break
        up = r < 0.99
        cur = pl[idx]
        cand = pl[order[..., 1:12]]
        ok = (cand > cur[..., None]) if up else (cand < cur[..., None])
        ok &= (alpha & ~seam)[..., None]
        if not ok.any(): break
        first = np.where(ok.any(-1), ok.argmax(-1), 0)
        k = np.take_along_axis(order[..., 1:12], first[..., None], -1)[..., 0]
        cost = np.take_along_axis(d, k[..., None], -1)[..., 0] - np.take_along_axis(d, idx[..., None], -1)[..., 0]
        cost[~ok.any(-1)] = np.inf
        y, x = np.unravel_index(np.argmin(cost), cost.shape)
        idx[y, x] = k[y, x]
    rgba = np.zeros((size, size, 4), np.uint8)
    rgba[..., :3] = pal[idx]; rgba[..., 3] = np.where(alpha, 255, 0)
    rgba[~alpha, :3] = 0
    return Image.fromarray(rgba, 'RGBA'), ratio(), int(seam.sum())

def main():
    manifest = {}; report = []
    for name in NAMES:
        src = Image.open(TEX / f'{name}.png')
        has_a = src.convert('RGBA').getextrema()[3][0] < 255
        entry = {'128': f'{name}.png'}
        for s in LEVELS:
            im, r, ns = build(src, s)
            if not has_a: im = im.convert('RGB')
            fn = f'{name}_{s}.png'; im.save(TEX / fn, optimize=True)
            entry[str(s)] = fn; report.append(f'{name:14s} {s:3d}  brightness {r:.3f}  seam px {ns}')
        manifest[f'{name}.png'] = entry
    (TEX / 'wall_mips.json').write_text(json.dumps({'filter': 'nearest', 'levels': [128, 64, 32], 'textures': manifest}, indent=2) + '\n')
    print('\n'.join(report))

if __name__ == '__main__':
    main()
