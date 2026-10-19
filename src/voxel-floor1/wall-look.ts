import { ROUGH_MATTE } from '../voxel-lab/constants';
import type { VolumeFromPixels } from '../voxel-lab/classify';
import type { FaceId } from '../voxel-lab/faces';
import { WALL_BULGE_FRAC } from './constants';
import floor1DecorJson from '../../levels/floor1_decor.json';
import { onceSlotFor, strongBaseFile, type OnceSlot } from './wall-once';

export type WallKind = 'ashlar' | 'brick' | 'banded' | 'soot' | 'etched';
export type WallVariant = 'clean' | 'damp' | 'cracked' | 'patched';
export type Seepage = 'wet_sheen' | 'matte_dark' | null;

function isWallKind(value: string | undefined): value is WallKind {
  return value === 'ashlar' || value === 'brick' || value === 'banded' || value === 'soot' || value === 'etched';
}

type DecorZone = {
  id: string;
  wallFamily?: string;
  viewerSquares: number[][];
};

export const floor1DecorZones = (floor1DecorJson as { zones: DecorZone[] }).zones;

/** One stone family per room / corridor. Matches Levie's zone `wallFamily`. */
export const ZONE_FAMILY: Record<string, WallKind> = Object.fromEntries(
  floor1DecorZones.map((z) => [z.id, isWallKind(z.wallFamily) ? z.wallFamily : 'brick'])
);

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
  /** Strong-feature repeat slot; omitted on family-base faces. */
  once?: OnceSlot;
  baseFile?: string;
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
  ashlar_damp: 'walls_floor1/ashlar_damp.png',
  brick_missing: 'walls_floor1/brick_missing.png',
  brick_patched: 'walls_floor1/brick_patched.png',
  banded_2: 'walls_floor1/banded_2.png',
  etched_2: 'walls_floor1/etched_2.png'
} as const;

export const SOOT_2 = 'walls_floor1/soot_brick_2.png';

/** Family base tile. Brick and soot zones share `brick_base`. */
export const FAMILY_BASE: Record<WallKind, string> = {
  ashlar: 'walls_floor1/ashlar_clean.png',
  banded: 'walls_floor1/banded_1.png',
  brick: 'walls_floor1/brick_base.png',
  soot: 'walls_floor1/brick_base.png',
  etched: 'walls_floor1/etched_1.png'
};

const KNOWN_WALL_FILES = new Set<string>(FLOOR1_WALL_FILES);

export function familyBaseFile(kind: WallKind): string {
  return FAMILY_BASE[kind];
}

export function wallFileExists(file: string): boolean {
  return KNOWN_WALL_FILES.has(file);
}

export function warnMissingWallTexture(file: string, fallback: string, at: string): void {
  console.warn(`[voxel-floor1] missing wall texture ${file} at ${at}; using ${fallback}`);
}

export const floor1DecorFaces = (floor1DecorJson as { faces: DecorFace[] }).faces;

const FACE_INDEX = new Map(floor1DecorFaces.map((f) => [`${f.x},${f.y},${f.face}`, f]));

export function decorFace(x: number, y: number, face: string): DecorFace | undefined {
  return FACE_INDEX.get(`${x},${y},${face}`);
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

export function resolveWallFile(f: DecorFace): string {
  const requested = ARTIE_FILE.get(faceKey(f)) ?? textureFile(f);
  if (wallFileExists(requested)) return requested;
  const fallback = familyBaseFile(wallKind(f));
  warnMissingWallTexture(requested, fallback, `${f.x},${f.y},${f.face}`);
  return fallback;
}

export function lookFromDecor(f: DecorFace): WallLook {
  const kind = wallKind(f);
  const requested = ARTIE_FILE.get(faceKey(f)) ?? textureFile(f);
  const file = resolveWallFile(f);
  const missing = file !== requested;
  const matte = isMatteLook(kind, f.seepage, f.zone);
  const baseFile = missing ? undefined : strongBaseFile(file);
  const once = baseFile ? onceSlotFor(f.x, f.y, f.face) : undefined;
  const parts = [file];
  if (once) parts.push(`once:${once.v},${once.h}`);
  if (matte) parts.push('matte');
  return {
    key: parts.join(':'),
    file,
    kind,
    variant: missing ? 'clean' : f.variant,
    seepage: f.seepage,
    zone: f.zone,
    bulge: f.bulge ? WALL_BULGE_FRAC : 0,
    once,
    baseFile
  };
}

export function lookForWall(x: number, y: number, face: string): WallLook | undefined {
  const f = decorFace(x, y, face);
  return f ? lookFromDecor(f) : undefined;
}

export function familyBaseLook(kind: WallKind, zone: string, seepage: Seepage = null): WallLook {
  const file = familyBaseFile(kind);
  const matte = isMatteLook(kind, seepage, zone);
  return {
    key: matte ? `${file}:matte` : file,
    file,
    kind,
    variant: 'clean',
    seepage,
    zone,
    bulge: 0
  };
}

export function zoneAt(x: number, y: number): string | undefined {
  for (const z of floor1DecorZones) {
    for (const rect of z.viewerSquares) {
      const [x0, y0, x1, y1] = rect;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return z.id;
    }
  }
  return undefined;
}

/** Family-base look for a viewer square — nooks, door surrounds, missing decor. */
export function lookForZoneBase(x: number, y: number): WallLook {
  const zone = zoneAt(x, y);
  const kind = (zone && ZONE_FAMILY[zone]) || 'brick';
  const seepage = zone && DARK_ZONES.has(zone) ? 'matte_dark' : null;
  return familyBaseLook(kind, zone ?? 'antechamber', seepage);
}

/** Integer U run so neighbouring faces continue; corners share the wrap edge. */
export function faceUOffset(face: string, tx: number, tz: number): number {
  if (face === 'N' || face === 'S') return tx;
  if (face === 'E' || face === 'W') return tz;
  return 0;
}

export function applyUOffset(uvs: number[], offset: number): void {
  if (!offset) return;
  for (let i = 0; i < uvs.length; i += 2) uvs[i] += offset;
}

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
  return lookForZoneBase(viewerX, viewerY);
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
