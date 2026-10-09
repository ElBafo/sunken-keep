import * as THREE from 'three';

/** Tileable surfaces that pick up `_2`, `_3`, … files automatically. */
export const VARIANT_SURFACES = [
  'wall_plain',
  'wall_pilaster',
  'wall_knot',
  'floor_stone',
  'floor_water',
  'ceiling'
] as const;

export type VariantSurface = (typeof VARIANT_SURFACES)[number];

const BASE_FILES = [
  'wall_plain.png',
  'wall_pilaster.png',
  'wall_knot.png',
  'door_locked.png',
  'door_open.png',
  'door_panel.png',
  'secret_closed.png',
  'secret_open.png',
  'floor_stone.png',
  'floor_water.png',
  'ceiling.png',
  'sconce_dead.png',
  'sconce_lit_1.png',
  'sconce_lit_2.png',
  'sconce_lit_3.png'
];

export function listedTex3dFiles(): string[] {
  const baked =
    typeof __TEX3D_FILES__ !== 'undefined' && Array.isArray(__TEX3D_FILES__)
      ? __TEX3D_FILES__
      : [];
  const names = baked.length > 0 ? baked : BASE_FILES;
  return names.filter((f) => f.endsWith('.png'));
}

/** `wall_plain.png` plus `wall_plain_2.png`, `wall_plain_3.png`, … in numeric order. */
export function variantFilenames(surface: VariantSurface, files: readonly string[]): string[] {
  const base = `${surface}.png`;
  const extras = files
    .map((f) => {
      const m = f.match(new RegExp(`^${surface}_(\\d+)\\.png$`));
      return m ? { file: f, n: Number(m[1]) } : null;
    })
    .filter((x): x is { file: string; n: number } => x !== null && x.n >= 2)
    .sort((a, b) => a.n - b.n)
    .map((x) => x.file);
  return files.includes(base) ? [base, ...extras] : extras;
}

export function faceHash(x: number, y: number, face: string, salt: number): number {
  const s = `${x},${y},${face},${salt}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickVariantIndex(count: number, x: number, y: number, face: string): number {
  if (count <= 1) return 0;
  return faceHash(x, y, face, 1) % count;
}

/** Floor/ceiling only — walls must not flip (frieze and brick rows have to line up). */
export function floorFlipX(x: number, y: number, face: string): boolean {
  return (faceHash(x, y, face, 2) & 1) === 1;
}

export function floorQuarterTurns(x: number, y: number, face: string): number {
  return faceHash(x, y, face, 3) % 4;
}

export function flipUVsX(geo: THREE.BufferGeometry) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, 1 - uv.getX(i));
  }
  uv.needsUpdate = true;
}

/** Rotate UVs in 90° steps around the tile centre. */
export function rotateUVs(geo: THREE.BufferGeometry, quarterTurns: number) {
  const k = ((quarterTurns % 4) + 4) % 4;
  if (k === 0) return;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i) - 0.5;
    let v = uv.getY(i) - 0.5;
    for (let t = 0; t < k; t++) {
      const nu = -v;
      const nv = u;
      u = nu;
      v = nv;
    }
    uv.setXY(i, u + 0.5, v + 0.5);
  }
  uv.needsUpdate = true;
}
