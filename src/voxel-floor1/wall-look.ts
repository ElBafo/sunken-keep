import * as THREE from 'three';
import { ROUGH_MATTE } from '../voxel-lab/constants';
import type { VolumeFromPixels } from '../voxel-lab/classify';
import type { FaceId } from '../voxel-lab/faces';
import { WALL_BULGE_FRAC, WALL_VARIANTS } from './constants';
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

export type PixelImage = { width: number; height: number; data: Uint8ClampedArray };

export type WallLook = {
  key: string;
  file: (typeof WALL_VARIANTS)[number];
  kind: WallKind;
  variant: WallVariant;
  seepage: Seepage;
  zone: string;
  bulge: number;
};

const DARK_ZONES = new Set(['pell', 'hook_corridor', 'lair', 'stair_room']);
const VARIANTS: WallVariant[] = ['clean', 'damp', 'cracked', 'patched'];

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

export function baseWallFile(variant: WallVariant): (typeof WALL_VARIANTS)[number] {
  const i = VARIANTS.indexOf(variant);
  return WALL_VARIANTS[i] ?? WALL_VARIANTS[0];
}

export function wallBatchKey(f: DecorFace): string {
  return `wall:${wallKind(f)}:${f.variant}:${f.seepage ?? 'dry'}`;
}

export function lookFromDecor(f: DecorFace): WallLook {
  return {
    key: wallBatchKey(f),
    file: baseWallFile(f.variant),
    kind: wallKind(f),
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
  return {
    key: 'wall:brick:clean:dry',
    file: WALL_VARIANTS[0],
    kind: 'brick',
    variant: 'clean',
    seepage: null,
    zone: 'antechamber',
    bulge: 0
  };
}

export function uniqueLooks(): WallLook[] {
  const map = new Map<string, WallLook>();
  for (const f of floor1DecorFaces) {
    const look = lookFromDecor(f);
    if (!map.has(look.key)) map.set(look.key, look);
  }
  return [...map.values()];
}

function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function setRgb(data: Uint8ClampedArray, i: number, r: number, g: number, b: number): void {
  data[i] = Math.max(0, Math.min(255, r + 0.5)) | 0;
  data[i + 1] = Math.max(0, Math.min(255, g + 0.5)) | 0;
  data[i + 2] = Math.max(0, Math.min(255, b + 0.5)) | 0;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function noise(u: number, v: number, salt: number): number {
  const n = Math.imul(u + 1, 374761393) ^ Math.imul(v + 3, 668265263) ^ Math.imul(salt + 7, 1274126177);
  return ((n >>> 0) % 1000) / 1000;
}

/**
 * Recolour a wall-texel PNG for a zone material + variant + seepage.
 * No tide lines or floor-line stains — the keep stays dry inside.
 */
export function applyWallLook(image: { width: number; height: number; data: ArrayLike<number> }, look: WallLook): PixelImage {
  const W = image.width;
  const H = image.height;
  const data = new Uint8ClampedArray(image.data);
  const kind = look.kind;
  const block = 16;

  if (kind === 'ashlar') {
    for (let by = 0; by < H; by += block) {
      for (let bx = 0; bx < W; bx += block) {
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        for (let y = by; y < Math.min(H, by + block); y++) {
          for (let x = bx; x < Math.min(W, bx + block); x++) {
            const i = (y * W + x) * 4;
            if (luma(data[i], data[i + 1], data[i + 2]) < 0.32) continue;
            sr += data[i];
            sg += data[i + 1];
            sb += data[i + 2];
            n += 1;
          }
        }
        const ar = n ? sr / n : 96;
        const ag = n ? sg / n : 94;
        const ab = n ? sb / n : 90;
        for (let y = by; y < Math.min(H, by + block); y++) {
          for (let x = bx; x < Math.min(W, bx + block); x++) {
            const i = (y * W + x) * 4;
            const edge = x === bx || y === by || x === bx + block - 1 || y === by + block - 1;
            if (edge) {
              setRgb(data, i, data[i] * 0.55, data[i + 1] * 0.55, data[i + 2] * 0.52);
              continue;
            }
            const j = noise(x, y, 3) * 8 - 4;
            setRgb(data, i, ar * 0.92 + j, ag * 0.94 + j, ab * 0.9 + j);
          }
        }
      }
    }
  } else if (kind === 'banded') {
    for (let y = 0; y < H; y++) {
      const t = y / (H - 1);
      const k = t < 0.58 ? 0 : Math.min(1, (t - 0.58) / 0.14);
      if (k <= 0) continue;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        setRgb(data, i, data[i] * (1 - 0.2 * k), data[i + 1] * (1 - 0.18 * k), data[i + 2] * (1 - 0.12 * k));
      }
    }
  } else if (kind === 'plaster') {
    for (let i = 0; i < data.length; i += 4) {
      const L = luma(data[i], data[i + 1], data[i + 2]);
      const flake = L < 0.34 ? 0.35 : 0.78;
      setRgb(
        data,
        i,
        mix(data[i], 148, flake),
        mix(data[i + 1], 144, flake),
        mix(data[i + 2], 138, flake)
      );
    }
  } else if (kind === 'soot') {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const streak = 0.78 + 0.22 * noise(x, 0, 11) + 0.08 * Math.sin(x * 0.4);
        setRgb(data, i, data[i] * 0.42 * streak, data[i + 1] * 0.4 * streak, data[i + 2] * 0.38 * streak);
      }
    }
  } else if (kind === 'etched') {
    for (let i = 0; i < data.length; i += 4) {
      const L = luma(data[i], data[i + 1], data[i + 2]);
      const g = mix(L * 255, 118, 0.55);
      setRgb(data, i, g * 0.96, g, g * 0.92);
    }
  }

  if (look.variant === 'damp') {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const m = 0.9 + 0.06 * noise(x, y, 5);
        setRgb(data, i, data[i] * m, data[i + 1] * m, data[i + 2] * (m + 0.03));
      }
    }
  } else if (look.variant === 'cracked') {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const line = noise(x + y * 3, y, 17);
        if (line > 0.93 || (x + Math.floor(y / 9) * 3) % 23 === 0) {
          setRgb(data, i, data[i] * 0.45, data[i + 1] * 0.44, data[i + 2] * 0.42);
        }
      }
    }
  } else if (look.variant === 'patched') {
    const patches = [
      [18, 40, 36, 22],
      [70, 88, 28, 18],
      [96, 24, 22, 26]
    ];
    for (const [px, py, pw, ph] of patches) {
      for (let y = py; y < py + ph && y < H; y++) {
        for (let x = px; x < px + pw && x < W; x++) {
          const i = (y * W + x) * 4;
          setRgb(data, i, mix(data[i], 120, 0.35), mix(data[i + 1], 108, 0.35), mix(data[i + 2], 92, 0.35));
        }
      }
    }
  }

  if (look.seepage === 'wet_sheen') {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const L = luma(data[i], data[i + 1], data[i + 2]);
        if (L < 0.34 || L > 0.62) continue;
        if (noise(x, y, 29) < 0.55) continue;
        const lift = 28;
        setRgb(data, i, data[i] + lift, data[i + 1] + lift * 0.92, data[i + 2] + lift * 0.8);
      }
    }
  } else if (look.seepage === 'matte_dark' || DARK_ZONES.has(look.zone)) {
    const k = look.seepage === 'matte_dark' ? 0.68 : 0.82;
    for (let i = 0; i < data.length; i += 4) {
      setRgb(data, i, data[i] * k, data[i + 1] * k, data[i + 2] * k);
    }
  }

  return { width: W, height: H, data };
}

export function finishVolume(vol: VolumeFromPixels, look: WallLook): void {
  const matte = look.seepage === 'matte_dark' || DARK_ZONES.has(look.zone) || look.kind === 'etched';
  if (matte) vol.roughness.fill(ROUGH_MATTE);
}

export function textureFromPixels(image: PixelImage): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context');
  const put = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  ctx.putImageData(put, 0, 0);
  const tex = new THREE.Texture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
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

export { DARK_ZONES };
