import { ROUGH_MATTE } from '../voxel-lab/constants';
import type { VolumeFromPixels } from '../voxel-lab/classify';
import type { FaceId } from '../voxel-lab/faces';
import { WALL_BULGE_FRAC } from './constants';
import { faceHash } from './variants';
import floor1DecorJson from '../../levels/floor1_decor.json';

export type WallKind = 'ashlar' | 'brick' | 'banded' | 'plaster' | 'soot' | 'etched';
export type WallVariant = 'clean' | 'damp' | 'cracked' | 'patched';
export type Seepage = 'wet_sheen' | 'matte_dark' | null;

export type DecorFace = {
  x: number;
  y: number;
  face: string;
  zone: string;
  material: string;
  variant: WallVariant;
  outerShell: boolean;
  seepage: Seepage;
  bulge: boolean;
};

export type WallLook = {
  key: string;
  file: string;
  kind: WallKind;
  variant: WallVariant;
  seepage: Seepage;
  zone: string;
  bulge: number;
};

const DARK_ZONES = new Set(['pell', 'hook_corridor', 'lair', 'stair_room']);

export const FLOOR1_WALL_DIR = 'walls_floor1';

export const FLOOR1_WALL_FILES = [
  'walls_floor1/ashlar_clean.png',
  'walls_floor1/ashlar_cracked.png',
  'walls_floor1/ashlar_patched.png',
  'walls_floor1/ashlar_damp.png',
  'walls_floor1/brick_base.png',
  'walls_floor1/brick_cracked.png',
  'walls_floor1/brick_patched.png',
  'walls_floor1/brick_missing.png',
  'walls_floor1/plaster_flaking_1.png',
  'walls_floor1/plaster_flaking_2.png',
  'walls_floor1/soot_brick_1.png',
  'walls_floor1/soot_brick_2.png',
  'walls_floor1/etched_1.png',
  'walls_floor1/etched_2.png',
  'walls_floor1/banded_1.png',
  'walls_floor1/banded_2.png'
] as const;

const STRONG = {
  ashlar_patched: 'walls_floor1/ashlar_patched.png',
  brick_missing: 'walls_floor1/brick_missing.png',
  plaster_flaking_2: 'walls_floor1/plaster_flaking_2.png'
} as const;

export const floor1DecorFaces = (floor1DecorJson as { faces: DecorFace[] }).faces;

const FACE_INDEX = new Map(floor1DecorFaces.map((f) => [`${f.x},${f.y},${f.face}`, f]));

export function decorFace(x: number, y: number, face: string): DecorFace | undefined {
  return FACE_INDEX.get(`${x},${y},${face}`);
}

export function wallKind(f: DecorFace): WallKind {
  if (f.material === 'brick_banded') return 'banded';
  if (f.material === 'plaster') return 'plaster';
  if (f.material === 'soot') return 'soot';
  if (f.material === 'etched') return 'etched';
  if (f.material === 'brick' && f.outerShell) return 'ashlar';
  return 'brick';
}

function faceKey(f: Pick<DecorFace, 'x' | 'y' | 'face'>): string {
  return `${f.x},${f.y},${f.face}`;
}

const ALONG: Record<string, Array<[number, number]>> = {
  N: [
    [-1, 0],
    [1, 0]
  ],
  S: [
    [-1, 0],
    [1, 0]
  ],
  E: [
    [0, -1],
    [0, 1]
  ],
  W: [
    [0, -1],
    [0, 1]
  ]
};

function alongKeys(f: DecorFace): string[] {
  return (ALONG[f.face] ?? []).map(([dx, dy]) => `${f.x + dx},${f.y + dy},${f.face}`);
}

function pairFile(kind: 'etched' | 'banded', f: DecorFace): string {
  const i = faceHash(f.x, f.y, f.face, kind === 'etched' ? 5 : 7) % 2;
  return kind === 'etched'
    ? i === 0
      ? 'walls_floor1/etched_1.png'
      : 'walls_floor1/etched_2.png'
    : i === 0
      ? 'walls_floor1/banded_1.png'
      : 'walls_floor1/banded_2.png';
}

function defaultFile(kind: WallKind, f: DecorFace): string {
  if (kind === 'ashlar') {
    if (f.variant === 'cracked') return 'walls_floor1/ashlar_cracked.png';
    if (f.variant === 'damp') return 'walls_floor1/ashlar_damp.png';
    return 'walls_floor1/ashlar_clean.png';
  }
  if (kind === 'brick') {
    if (f.variant === 'cracked') return 'walls_floor1/brick_cracked.png';
    if (f.variant === 'patched') return 'walls_floor1/brick_patched.png';
    return 'walls_floor1/brick_base.png';
  }
  if (kind === 'plaster') return 'walls_floor1/plaster_flaking_1.png';
  if (kind === 'soot') return 'walls_floor1/soot_brick_2.png';
  if (kind === 'etched') return pairFile('etched', f);
  return pairFile('banded', f);
}

/** Strong-feature tiles: about 1 in 5 of that material, never neighbours along a run. */
function placeSparse(
  assigned: Map<string, string>,
  faces: DecorFace[],
  file: string,
  prefer?: (f: DecorFace) => boolean
): void {
  const target = Math.max(1, Math.round(faces.length / 5));
  const ranked = [...faces].sort((a, b) => {
    const pa = prefer?.(a) ? 0 : 1;
    const pb = prefer?.(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return faceHash(a.x, a.y, a.face, 21) - faceHash(b.x, b.y, b.face, 21);
  });
  let n = 0;
  for (const f of ranked) {
    if (n >= target) break;
    if (alongKeys(f).some((k) => assigned.get(k) === file)) continue;
    assigned.set(faceKey(f), file);
    n += 1;
  }
}

function assignArtieFiles(): Map<string, string> {
  const assigned = new Map<string, string>();
  const byKind = new Map<WallKind, DecorFace[]>();
  for (const f of floor1DecorFaces) {
    const kind = wallKind(f);
    const list = byKind.get(kind) ?? [];
    list.push(f);
    byKind.set(kind, list);
    assigned.set(faceKey(f), defaultFile(kind, f));
  }

  placeSparse(assigned, byKind.get('ashlar') ?? [], STRONG.ashlar_patched, (f) => f.variant === 'patched');
  placeSparse(assigned, byKind.get('brick') ?? [], STRONG.brick_missing);
  placeSparse(assigned, byKind.get('plaster') ?? [], STRONG.plaster_flaking_2);

  const soot = byKind.get('soot') ?? [];
  const yCount = new Map<number, number>();
  for (const f of soot) yCount.set(f.y, (yCount.get(f.y) ?? 0) + 1);
  let sootRow: number | null = null;
  let best = -1;
  for (const [y, n] of yCount) {
    if (n > best) {
      best = n;
      sootRow = y;
    }
  }
  for (const f of soot) {
    assigned.set(
      faceKey(f),
      f.y === sootRow ? 'walls_floor1/soot_brick_1.png' : 'walls_floor1/soot_brick_2.png'
    );
  }

  return assigned;
}

const ARTIE_FILE = assignArtieFiles();

function isMatteLook(kind: WallKind, seepage: Seepage, zone: string): boolean {
  return seepage === 'matte_dark' || DARK_ZONES.has(zone) || kind === 'etched';
}

export function lookFromDecor(f: DecorFace): WallLook {
  const kind = wallKind(f);
  const file = ARTIE_FILE.get(faceKey(f)) ?? defaultFile(kind, f);
  const matte = isMatteLook(kind, f.seepage, f.zone);
  return {
    key: matte ? `${file}:matte` : file,
    file,
    kind,
    variant: f.variant,
    seepage: f.seepage,
    zone: f.zone,
    bulge: f.bulge ? WALL_BULGE_FRAC : 0
  };
}

export function lookForWall(x: number, y: number, face: string): WallLook | undefined {
  const f = decorFace(x, y, face);
  return f ? lookFromDecor(f) : undefined;
}

const FACE_DELTA: Record<string, [number, number]> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0]
};

const FALLBACK_LOOK: WallLook = {
  key: 'walls_floor1/brick_base.png',
  file: 'walls_floor1/brick_base.png',
  kind: 'brick',
  variant: 'clean',
  seepage: null,
  zone: 'antechamber',
  bulge: 0
};

/** Secret faces copy a neighbour so they match the run, aside from the tell brick. */
export function lookForSecret(wallX: number, wallY: number, wallFace: string, viewerX: number, viewerY: number): WallLook {
  const along: Array<[number, number]> =
    wallFace === 'N' || wallFace === 'S'
      ? [
          [-1, 0],
          [1, 0]
        ]
      : [
          [0, -1],
          [0, 1]
        ];
  for (const [dx, dy] of along) {
    const hit = lookForWall(wallX + dx, wallY + dy, wallFace);
    if (hit) return { ...hit, bulge: 0 };
  }
  for (const [face, [dx, dy]] of Object.entries(FACE_DELTA)) {
    if (face === wallFace) continue;
    const hit = lookForWall(viewerX - dx, viewerY - dy, face);
    if (hit) return { ...hit, bulge: 0 };
  }
  const nearby = floor1DecorFaces.find((row) => {
    const [dx, dy] = FACE_DELTA[row.face] ?? [0, 0];
    return row.x + dx === viewerX && row.y + dy === viewerY;
  });
  if (nearby) return { ...lookFromDecor(nearby), bulge: 0 };
  return { ...FALLBACK_LOOK };
}

export function uniqueLooks(): WallLook[] {
  const map = new Map<string, WallLook>();
  for (const f of floor1DecorFaces) {
    const look = lookFromDecor(f);
    if (!map.has(look.key)) map.set(look.key, look);
  }
  return [...map.values()];
}

export function artieFileFor(x: number, y: number, face: string): string | undefined {
  return ARTIE_FILE.get(`${x},${y},${face}`);
}

export function finishVolume(vol: VolumeFromPixels, look: WallLook): void {
  if (isMatteLook(look.kind, look.seepage, look.zone)) vol.roughness.fill(ROUGH_MATTE);
}

export function bulgeWorld(
  face: FaceId,
  toWorld: (u: number, v: number, d: number) => [number, number, number],
  frac: number,
  cell: number
): (u: number, v: number, d: number) => [number, number, number] {
  if (!frac) return toWorld;
  const d = frac * cell;
  return (u, v, depth) => {
    const p = toWorld(u, v, depth);
    if (face === 'N') return [p[0], p[1], p[2] + d];
    if (face === 'S') return [p[0], p[1], p[2] - d];
    if (face === 'W') return [p[0] + d, p[1], p[2]];
    if (face === 'E') return [p[0] - d, p[1], p[2]];
    return p;
  };
}

export function bulgePose<T extends { x: number; z: number }>(face: FaceId, pose: T, frac: number, cell: number): T {
  if (!frac) return pose;
  const d = frac * cell;
  if (face === 'N') return { ...pose, z: pose.z + d };
  if (face === 'S') return { ...pose, z: pose.z - d };
  if (face === 'W') return { ...pose, x: pose.x + d };
  if (face === 'E') return { ...pose, x: pose.x - d };
  return pose;
}

export { DARK_ZONES, STRONG };
