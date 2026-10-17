import { ROUGH_MATTE } from '../voxel-lab/constants';
import type { VolumeFromPixels } from '../voxel-lab/classify';
import type { FaceId } from '../voxel-lab/faces';
import { WALL_BULGE_FRAC } from './constants';
import floor1DecorJson from '../../levels/floor1_decor.json';

export type WallKind = 'ashlar' | 'brick' | 'banded' | 'soot' | 'etched';
export type WallVariant = 'clean' | 'damp' | 'cracked' | 'patched';
export type Seepage = 'wet_sheen' | 'matte_dark' | null;

/** One stone family per room / corridor. Matches Levie's zone `wallFamily`. */
export const ZONE_FAMILY: Record<string, WallKind> = {
  entry_gate: 'ashlar',
  water_hall: 'ashlar',
  muster_hall: 'ashlar',
  antechamber: 'banded',
  guard_hall: 'banded',
  pantry: 'brick',
  hook_corridor: 'brick',
  pell: 'soot',
  cellar: 'brick',
  slime_trail: 'etched',
  lair: 'etched',
  stair_room: 'brick'
};

export const ASHLAR_ZONES = new Set(
  Object.entries(ZONE_FAMILY)
    .filter(([, kind]) => kind === 'ashlar')
    .map(([zone]) => zone)
);

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
  wallFamily?: string;
  texture?: string;
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
  'walls_floor1/soot_brick_2.png',
  'walls_floor1/etched_1.png',
  'walls_floor1/etched_2.png',
  'walls_floor1/banded_1.png',
  'walls_floor1/banded_2.png'
] as const;

const STRONG = {
  ashlar_patched: 'walls_floor1/ashlar_patched.png',
  brick_missing: 'walls_floor1/brick_missing.png'
} as const;

export const SOOT_2 = 'walls_floor1/soot_brick_2.png';

export const floor1DecorFaces = (floor1DecorJson as { faces: DecorFace[] }).faces;

const FACE_INDEX = new Map(floor1DecorFaces.map((f) => [`${f.x},${f.y},${f.face}`, f]));

export function decorFace(x: number, y: number, face: string): DecorFace | undefined {
  return FACE_INDEX.get(`${x},${y},${face}`);
}

function isWallKind(value: string | undefined): value is WallKind {
  return value === 'ashlar' || value === 'brick' || value === 'banded' || value === 'soot' || value === 'etched';
}

export function wallKind(f: DecorFace): WallKind {
  if (isWallKind(f.wallFamily)) return f.wallFamily;
  if (ZONE_FAMILY[f.zone]) return ZONE_FAMILY[f.zone];
  return 'brick';
}

function faceKey(f: Pick<DecorFace, 'x' | 'y' | 'face'>): string {
  return `${f.x},${f.y},${f.face}`;
}

const FACE_DELTA: Record<string, [number, number]> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0]
};

/** Levie's `texture` field is the source of truth — Artie's stem, no extra mapping. */
export function textureFile(f: DecorFace): string {
  const raw = f.texture?.trim();
  if (!raw) return 'walls_floor1/brick_base.png';
  const name = raw.replace(/^.*\//, '').replace(/\.png$/i, '');
  return `walls_floor1/${name}.png`;
}

function assignArtieFiles(): Map<string, string> {
  const assigned = new Map<string, string>();
  for (const f of floor1DecorFaces) assigned.set(faceKey(f), textureFile(f));
  return assigned;
}

const ARTIE_FILE = assignArtieFiles();

function isMatteLook(kind: WallKind, seepage: Seepage, zone: string): boolean {
  return seepage === 'matte_dark' || DARK_ZONES.has(zone) || kind === 'etched';
}

export function lookFromDecor(f: DecorFace): WallLook {
  const kind = wallKind(f);
  const file = ARTIE_FILE.get(faceKey(f)) ?? textureFile(f);
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
