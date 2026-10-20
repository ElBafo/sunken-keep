# Floor 1 floor + ceiling variant map (Levie + Artie r2 floor / r3 ceiling).
# Run from the repo root: python3 levels/tools/floor1_floorceil.py
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'public' / 'levels' / 'floor1.ts'
DECOR = ROOT / 'levels' / 'floor1_decor.json'
OUT = ROOT / 'levels' / 'floor1_floorceil.json'

src = SRC.read_text()
blk = src.split('tiles: [')[1].split('\n  ]')[0]
T = [re.findall(r'\{[^{}]*\}', l) for l in blk.splitlines() if l.strip().startswith('[')]
H, W = len(T), len(T[0])


def kind(c):
    if 'wall: true' in c:
        return 'wall'
    if 'deepWater' in c or 'shallowWater' in c:
        return 'water'
    return 'floor'  # floor, door, secret (once opened), stairs


K = {(x, y): kind(T[y][x]) for y in range(H) for x in range(W)}
sq = [p for p, k in K.items() if k != 'wall']
N4 = lambda x, y: [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
hv = lambda *a: int(hashlib.md5(repr(a).encode()).hexdigest(), 16)
water = {p for p in sq if K[p] == 'water'}
edge = {p for p in sq if p not in water and any(q in water for q in N4(*p))}
doors = {(x, y) for y in range(H) for x in range(W) if 'door: true' in T[y][x]}

# Sconce wall cells → room square (face points into the room).
FACE = {'N': (0, -1), 'E': (1, 0), 'S': (0, 1), 'W': (-1, 0)}
lamps = []
sconce_m = re.search(r'sconces:\s*\[(.*?)\]', src, re.S)
if sconce_m:
    for m in re.finditer(r"x:\s*(\d+),\s*y:\s*(\d+),\s*face:\s*'([NESW])'", sconce_m.group(1)):
        x, y, face = int(m.group(1)), int(m.group(2)), m.group(3)
        dx, dy = FACE[face]
        lamps.append((x + dx, y + dy))
# Pell's hanging lamp: wall (14,9)W → room (13,9)
lamps.append((13, 9))
lamps = [p for p in lamps if p in sq and p not in water]

decor = json.loads(DECOR.read_text())
ZONES = decor['zones']


def zone_at(x, y):
    for z in ZONES:
        for x0, y0, x1, y1 in z['viewerSquares']:
            if x0 <= x <= x1 and y0 <= y <= y1:
                return z['id']
    return None


# Planks stay only in these rooms. Beams run E–W there, so boards rotate 90° onto Z.
# Rubble elsewhere is isotropic — no UV rotation.
PLANK_ZONES = {'pantry', 'guard_hall'}
ROT90 = set(PLANK_ZONES)

# --- floor ---
W_F = {'floor_stone': 2, 'floor_stone_2': 3, 'floor_stone_4': 2}
FEATURE = 'floor_stone_3'
FEATURE_N = 4
floor = {}
for p in water:
    floor[p] = 'floor_water'
for p in edge:
    floor[p] = 'floor_stone'
cnt = {'floor_stone': len(edge)}

feat_cands = []
seen = set()
for p in lamps:
    if p not in floor and p not in seen:
        feat_cands.append(p)
        seen.add(p)
for d in sorted(doors):
    for q in N4(*d):
        if q in sq and q not in floor and q not in seen:
            feat_cands.append(q)
            seen.add(q)
feat_cands.sort(key=lambda p: (0 if p in lamps else 1, hv('feat', p)))
picked = []
for p in feat_cands:
    if len(picked) >= FEATURE_N:
        break
    if any(abs(p[0] - q[0]) + abs(p[1] - q[1]) <= 1 for q in picked):
        continue
    picked.append(p)
    floor[p] = FEATURE
    cnt[FEATURE] = cnt.get(FEATURE, 0) + 1

for p in sorted([p for p in sq if p not in floor], key=lambda p: hv('f', p)):
    nb = {floor.get(q) for q in N4(*p)}
    opts = [t for t in W_F if t not in nb] or list(W_F)
    t = min(opts, key=lambda t: (cnt.get(t, 0) / W_F[t], hv('t', p, t)))
    floor[p] = t
    cnt[t] = cnt.get(t, 0) + 1

# --- ceiling ---
C_RUBBLE = {'ceiling_rubble_1': 1, 'ceiling_rubble_2': 1, 'ceiling_rubble_3': 1}
C_PLANKS = {'ceiling_planks_1': 1, 'ceiling_planks_2': 1, 'ceiling_planks_3': 1}
ceil = {}
ceil_rot = {}
for p in sorted(sq, key=lambda p: (p[1], p[0])):
    zid = zone_at(*p)
    pool = C_PLANKS if zid in PLANK_ZONES else C_RUBBLE
    nb = {ceil.get(q) for q in N4(*p)}
    opts = [t for t in pool if t not in nb] or list(pool)
    t = min(opts, key=lambda t: (sum(1 for v in ceil.values() if v == t), hv('ct', p, t)))
    ceil[p] = t
    ceil_rot[p] = 90 if zid in ROT90 else 0

fm = sum(
    1
    for p in sq
    for q in N4(*p)
    if q in floor
    and floor[q] == floor[p]
    and floor[p] not in ('floor_water',)
    and not (p in edge and q in edge)
)
cm = sum(1 for p in sq for q in N4(*p) if q in ceil and ceil[q] == ceil[p])

out = {
    'version': 2,
    'floor': 'floor1',
    'for': 'PR #63 Artie ceiling r3 — rubble + planks in pantry/guard hall',
    'rules': {
        'floor': 'floor_water locked on cistern and cellar pool squares; floor_stone locked on squares that touch water. Spread is floor_stone / _2 / _4. floor_stone_3 is a rare feature (at most 4, under a lamp or by a door, never adjacent). Tiles share edge bands so joints run through any mix; no per-cell flip or rotation.',
        'ceiling': 'ceiling_rubble_1/_2/_3 replace planks everywhere except pantry and guard_hall, which keep ceiling_planks_1/_2/_3. Rubble is edge-matched and isotropic (no UV rotation). Plank boards still run along tile x and take a zone-wide 90° UV turn in pantry/guard_hall so they cross the E–W beams. Overlays sit on top: sunbeam crack at daylight (11,2), roots at (1,2), copper pipes along y=1 (1-3, 9-13) and y=6 (8-11).',
    },
    'squares': [
        {
            'x': x,
            'y': y,
            'floor': floor[(x, y)],
            'ceiling': ceil[(x, y)],
            'ceilingRot': ceil_rot[(x, y)],
        }
        for (x, y) in sorted(sq, key=lambda p: (p[1], p[0]))
    ],
}
OUT.write_text(json.dumps(out, indent=1) + '\n')
print(len(sq), 'squares', len(water), 'water', len(edge), 'edge')
print(Counter(floor.values()))
print(Counter(ceil.values()))
print('floor_stone_3', picked)
print('floor matches (excl. locked water/edge runs)', fm, 'ceiling matches', cm)
print('ceilingRot 90', sum(1 for r in ceil_rot.values() if r == 90), 'of', len(ceil_rot))
for y in range(H):
    print(
        ''.join(
            {
                'floor_water': '~',
                'floor_stone': '1',
                'floor_stone_2': '2',
                'floor_stone_3': '3',
                'floor_stone_4': '4',
            }.get(floor.get((x, y)), '#')
            for x in range(W)
        )
    )
