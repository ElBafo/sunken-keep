import * as THREE from 'three';
import { greedyMesh, type MeshArrays } from './mesher';

export type PaletteGroup = 'goo' | 'glint' | 'bone' | 'rust';

export interface PaletteEntry {
  id: number;
  name: string;
  hex: string;
  group: PaletteGroup;
}

export interface LobeSpec {
  x: number;
  z: number;
  rx: number;
  rz: number;
  h: number;
  falloff: number;
}

export interface DripSpec {
  x: number;
  z: number;
  top: number;
  radius: number;
  jitter: number;
}

export interface SplatterSpec {
  x: number;
  z: number;
  r: number;
}

export interface StampSpec {
  type: 'skull' | 'bone' | 'hilt';
  palette: string;
  stain?: string;
  dark?: string;
  x: number;
  y: number;
  z: number;
  rotY?: number;
  rotZ?: number;
  scale?: number;
  length?: number;
  axis?: 'x' | 'z';
}

export interface MonsterDef {
  id: string;
  title: string;
  note?: string;
  resolutions: number[];
  defaultResolution: number;
  palette: PaletteEntry[];
  body: {
    acrossMeters: number;
    spreadMeters: number;
    heightMeters: number;
    noiseSeed: number;
    noiseAmplitude: number;
    noiseFrequency: number;
    floorLeak: number;
    glintChance: number;
    lobes: LobeSpec[];
    drips: DripSpec[];
    splatters: SplatterSpec[];
  };
  stamps: StampSpec[];
  compareSprite: {
    folder: string;
    filePattern: string;
    fallbackPattern: string;
    sizesKey: string;
    worldHeight: number;
  };
  animations: Record<string, Record<string, number>>;
}

export interface BuiltVolume {
  volume: Uint8Array;
  dims: [number, number, number];
  voxelSize: number;
  origin: [number, number, number];
  voxelCount: number;
  counts: Record<PaletteGroup | 'total', number>;
  surfacePoints: Array<[number, number, number]>;
  peakHeight: number;
  width: number;
  depth: number;
}

export interface GroupGeometry {
  group: PaletteGroup | 'core';
  geometry: THREE.BufferGeometry;
  triangles: number;
  voxels: number;
}

export interface MeshedMonster {
  groups: GroupGeometry[];
  triangles: number;
  voxels: number;
}

function hash2(ix: number, iz: number, seed: number): number {
  let n = Math.imul(ix + seed * 17, 374761393) ^ Math.imul(iz + seed * 13, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const n00 = hash2(x0, z0, seed);
  const n10 = hash2(x0 + 1, z0, seed);
  const n01 = hash2(x0, z0 + 1, seed);
  const n11 = hash2(x0 + 1, z0 + 1, seed);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sz;
}

function fbm(x: number, z: number, seed: number, octaves = 3): number {
  let v = 0;
  let a = 1;
  let f = 1;
  let s = 0;
  for (let i = 0; i < octaves; i++) {
    v += a * valueNoise(x * f, z * f, seed + i * 19);
    s += a;
    a *= 0.5;
    f *= 2;
  }
  return v / s;
}

export function srgbHexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const lin = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return [lin(r), lin(g), lin(b)];
}

export function parseMonsterDef(raw: unknown): MonsterDef {
  const d = raw as MonsterDef;
  if (!d || typeof d !== 'object') throw new Error('monster def is not an object');
  if (!Array.isArray(d.palette) || d.palette.length < 2) throw new Error('palette required');
  if (!d.body || !Array.isArray(d.body.lobes)) throw new Error('body.lobes required');
  if (!Array.isArray(d.resolutions) || d.resolutions.length < 1) throw new Error('resolutions required');
  return d;
}

function palByName(def: MonsterDef): Map<string, PaletteEntry> {
  const m = new Map<string, PaletteEntry>();
  for (const p of def.palette) m.set(p.name, p);
  return m;
}

function palById(def: MonsterDef): Map<number, PaletteEntry> {
  const m = new Map<number, PaletteEntry>();
  for (const p of def.palette) m.set(p.id, p);
  return m;
}

function lobeHeight(px: number, pz: number, lobe: LobeSpec, n: number): number {
  const dx = (px - lobe.x) / Math.max(0.04, lobe.rx);
  const dz = (pz - lobe.z) / Math.max(0.04, lobe.rz);
  const e = dx * dx + dz * dz;
  if (e >= 1) return 0;
  return lobe.h * Math.pow(1 - e, lobe.falloff) * (0.7 + 0.3 * n);
}

function pileHeight(px: number, pz: number, def: MonsterDef): number {
  const { noiseSeed, noiseFrequency, noiseAmplitude } = def.body;
  const n = fbm(px * noiseFrequency, pz * noiseFrequency, noiseSeed);
  const n2 = fbm(px * noiseFrequency * 1.7 + 4, pz * noiseFrequency * 1.7, noiseSeed + 3);
  let h = 0;
  for (const lobe of def.body.lobes) {
    const lh = lobeHeight(px, pz, lobe, n);
    if (lh > h) h = lh;
  }
  const r = Math.hypot(px, pz);
  const ang = Math.atan2(pz, px);
  const bite = n2 > 0.72 && r > 0.18 ? 0.45 : 1;
  const ridge = 0.82 + 0.18 * Math.abs(Math.sin(ang * 2.4 + n * 5));
  return h * bite * ridge * (1 + (n - 0.5) * noiseAmplitude * 0.5);
}

export function buildMonsterVolume(def: MonsterDef, resolution: number): BuiltVolume {
  const { acrossMeters, spreadMeters, heightMeters, noiseSeed, noiseFrequency, floorLeak, glintChance } =
    def.body;
  const voxelSize = acrossMeters / resolution;
  const pad = 3;
  const sx = Math.ceil(spreadMeters / voxelSize) + pad;
  const sz = Math.ceil(spreadMeters / voxelSize) + pad;
  const sy = Math.ceil((heightMeters + 0.1) / voxelSize) + pad;
  const dims: [number, number, number] = [sx, sy, sz];
  const origin: [number, number, number] = [(-sx * voxelSize) / 2, 0, (-sz * voxelSize) / 2];
  const volume = new Uint8Array(sx * sy * sz);
  const names = palByName(def);
  const gooDark = names.get('goo_dark')?.id ?? 2;
  const gooMid = names.get('goo_mid')?.id ?? 3;
  const gooLit = names.get('goo_lit')?.id ?? 4;
  const gooShadow = names.get('goo_shadow')?.id ?? 1;
  const gooFilm = names.get('goo_film')?.id ?? 5;
  const glint = names.get('goo_glint')?.id ?? 6;

  const idx = (x: number, y: number, z: number): number => x + y * sx + z * sx * sy;
  const inB = (x: number, y: number, z: number): boolean =>
    x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz;
  const set = (x: number, y: number, z: number, id: number): void => {
    if (inB(x, y, z) && id) volume[idx(x, y, z)] = id;
  };

  let peakHeight = 0;
  let minX = sx;
  let maxX = 0;
  let minZ = sz;
  let maxZ = 0;

  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const px = origin[0] + (x + 0.5) * voxelSize;
      const pz = origin[2] + (z + 0.5) * voxelSize;
      const n = fbm(px * noiseFrequency, pz * noiseFrequency, noiseSeed);
      const nEdge = fbm(px * noiseFrequency * 2.4 + 9, pz * noiseFrequency * 2.4, noiseSeed + 5);
      const h = pileHeight(px, pz, def);
      if (h > peakHeight) peakHeight = h;

      const r = Math.hypot(px, pz);
      const ang = Math.atan2(pz, px);
      const outline = 1 + def.body.noiseAmplitude * Math.sin(ang * 3.1 + nEdge * 7);
      const leakR =
        (spreadMeters * 0.5) * (0.62 + floorLeak + 0.28 * n) * (0.78 + 0.22 * outline);
      const leak = r < leakR && nEdge > 0.16;

      for (let y = 0; y < sy; y++) {
        const py = (y + 0.5) * voxelSize;
        let id = 0;
        if (py <= h && h > voxelSize * 0.35) {
          const hf = h > 0 ? py / h : 0;
          if (hf < 0.18) id = gooShadow;
          else if (hf > 0.78 && n > 0.55) id = gooLit;
          else if (n < 0.32) id = gooDark;
          else if (n > 0.78) id = gooFilm;
          else id = gooMid;
        } else if (py < voxelSize * 1.6 && leak) {
          id = n < 0.4 ? gooShadow : gooDark;
        }
        if (id) {
          volume[idx(x, y, z)] = id;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
      }
    }
  }

  for (const drip of def.body.drips) {
    const top = drip.top;
    const steps = Math.max(2, Math.ceil(top / voxelSize));
    for (let i = 0; i < steps; i++) {
      const py = (i + 0.5) * (top / steps);
      const jx = (hash2(i, 3, noiseSeed) - 0.5) * 2 * drip.jitter;
      const jz = (hash2(i, 7, noiseSeed + 2) - 0.5) * 2 * drip.jitter;
      const rad = drip.radius * (0.7 + 0.5 * hash2(i, 11, noiseSeed + 4));
      const rVox = Math.max(0, Math.ceil(rad / voxelSize));
      const cx = Math.floor((drip.x + jx - origin[0]) / voxelSize);
      const cz = Math.floor((drip.z + jz - origin[2]) / voxelSize);
      const cy = Math.floor(py / voxelSize);
      for (let dz = -rVox; dz <= rVox; dz++) {
        for (let dx = -rVox; dx <= rVox; dx++) {
          if (dx * dx + dz * dz <= rVox * rVox + 0.2) {
            set(cx + dx, cy, cz + dz, i < 2 ? gooShadow : gooDark);
          }
        }
      }
    }
  }

  for (const splat of def.body.splatters) {
    const rVox = Math.max(1, Math.ceil(splat.r / voxelSize));
    const cx = Math.floor((splat.x - origin[0]) / voxelSize);
    const cz = Math.floor((splat.z - origin[2]) / voxelSize);
    for (let dz = -rVox; dz <= rVox; dz++) {
      for (let dx = -rVox; dx <= rVox; dx++) {
        const d = Math.hypot(dx, dz) * voxelSize;
        if (d <= splat.r * (0.75 + 0.4 * hash2(cx + dx, cz + dz, noiseSeed + 8))) {
          set(cx + dx, 0, cz + dz, gooShadow);
          if (hash2(dx, dz, noiseSeed + 9) > 0.55) set(cx + dx, 1, cz + dz, gooDark);
        }
      }
    }
  }

  applyStamps(def, names, set, voxelSize, origin);

  const neigh = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1]
  ] as const;
  const filledN = (x: number, y: number, z: number): number => {
    let n = 0;
    for (const [dx, dy, dz] of neigh) {
      const xx = x + dx;
      const yy = y + dy;
      const zz = z + dz;
      if (!inB(xx, yy, zz) || volume[idx(xx, yy, zz)] === 0) continue;
      n += 1;
    }
    return n;
  };

  const byId = palById(def);
  const surfacePoints: Array<[number, number, number]> = [];
  const counts: Record<PaletteGroup | 'total', number> = {
    goo: 0,
    glint: 0,
    bone: 0,
    rust: 0,
    total: 0
  };

  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        const i = idx(x, y, z);
        const id = volume[i];
        if (!id) continue;
        const entry = byId.get(id);
        if (entry?.group === 'goo') {
          const n = filledN(x, y, z);
          if (n <= 3 && hash2(x, z + y * 3, noiseSeed + 21) < glintChance) {
            volume[i] = glint;
          }
        }
        const after = byId.get(volume[i]);
        const g = after?.group ?? 'goo';
        counts[g] += 1;
        counts.total += 1;
        if (g === 'goo' || g === 'glint') {
          if (filledN(x, y, z) < 6 && surfacePoints.length < 48) {
            if (hash2(x * 3, z * 5 + y, noiseSeed + 30) > 0.62) {
              surfacePoints.push([
                origin[0] + (x + 0.5) * voxelSize,
                origin[1] + (y + 0.5) * voxelSize,
                origin[2] + (z + 0.5) * voxelSize
              ]);
            }
          }
        }
      }
    }
  }

  return {
    volume,
    dims,
    voxelSize,
    origin,
    voxelCount: counts.total,
    counts,
    surfacePoints,
    peakHeight,
    width: (maxX - minX + 1) * voxelSize,
    depth: (maxZ - minZ + 1) * voxelSize
  };
}

function applyStamps(
  def: MonsterDef,
  names: Map<string, PaletteEntry>,
  set: (x: number, y: number, z: number, id: number) => void,
  voxelSize: number,
  origin: [number, number, number]
): void {
  const toVox = (m: number, axis: 0 | 1 | 2): number =>
    Math.round((m - (axis === 1 ? 0 : origin[axis])) / voxelSize);

  for (const stamp of def.stamps) {
    const pal = names.get(stamp.palette)?.id ?? 7;
    const stain = names.get(stamp.stain ?? stamp.palette)?.id ?? pal;
    const dark = names.get(stamp.dark ?? stamp.palette)?.id ?? pal;
    const cx = toVox(stamp.x, 0);
    const cy = Math.max(0, toVox(stamp.y, 1));
    const cz = toVox(stamp.z, 2);
    const rotY = stamp.rotY ?? 0;
    const scale = stamp.scale ?? 1;
    const s = Math.max(1, Math.round(scale * (0.045 / voxelSize)));

    if (stamp.type === 'skull') {
      stampSkull(set, cx, cy, cz, pal, stain, rotY, s);
    } else if (stamp.type === 'bone') {
      stampBone(set, cx, cy, cz, pal, stain, rotY, stamp.length ?? 0.22, stamp.axis ?? 'x', voxelSize);
    } else if (stamp.type === 'hilt') {
      stampHilt(set, cx, cy, cz, pal, dark, rotY, stamp.rotZ ?? 0.4, stamp.length ?? 0.22, voxelSize);
    }
  }
}

function rotY(x: number, z: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + z * s, -x * s + z * c];
}

function stampSkull(
  set: (x: number, y: number, z: number, id: number) => void,
  cx: number,
  cy: number,
  cz: number,
  pal: number,
  stain: number,
  yaw: number,
  s: number
): void {
  const rx = Math.max(2, 2 * s);
  const ry = Math.max(2, 2 * s);
  const rz = Math.max(2, 2 * s);
  for (let y = -ry; y <= ry + 1; y++) {
    for (let z = -rz; z <= rz; z++) {
      for (let x = -rx; x <= rx; x++) {
        const e = (x * x) / (rx * rx) + ((y - 0.3) * (y - 0.3)) / (ry * ry) + (z * z) / (rz * rz);
        if (e > 1.05) continue;
        const [lx, lz] = rotY(x, z, yaw);
        const ix = cx + Math.round(lx);
        const iy = cy + y;
        const iz = cz + Math.round(lz);
        // Profile sockets on local +X (turned away from a −Z camera).
        const socket = Math.abs(x - rx + 0.6) < 0.9 && Math.abs(y - 0.4) < 0.8 && Math.abs(z) > 0.4 && Math.abs(z) < rz * 0.7;
        if (socket && e > 0.45) continue;
        const id = y < 0 || e > 0.82 ? stain : pal;
        if (iy >= 0) set(ix, iy, iz, id);
      }
    }
  }
}

function stampBone(
  set: (x: number, y: number, z: number, id: number) => void,
  cx: number,
  cy: number,
  cz: number,
  pal: number,
  stain: number,
  yaw: number,
  length: number,
  axis: 'x' | 'z',
  voxelSize: number
): void {
  const half = Math.max(2, Math.round(length / voxelSize / 2));
  const thick = 1;
  for (let i = -half; i <= half; i++) {
    const t = i / Math.max(1, half);
    const bulge = Math.abs(t) > 0.78 ? 1 : 0;
    for (let a = -thick - bulge; a <= thick + bulge; a++) {
      for (let b = -thick; b <= thick + bulge; b++) {
        const localX = axis === 'x' ? i : a;
        const localZ = axis === 'z' ? i : b;
        const localY = axis === 'x' ? b : a;
        const [lx, lz] = rotY(localX, localZ, yaw);
        const id = Math.abs(t) > 0.7 ? stain : pal;
        set(cx + Math.round(lx), cy + localY, cz + Math.round(lz), id);
      }
    }
  }
}

function stampHilt(
  set: (x: number, y: number, z: number, id: number) => void,
  cx: number,
  cy: number,
  cz: number,
  pal: number,
  dark: number,
  yaw: number,
  tilt: number,
  length: number,
  voxelSize: number
): void {
  const n = Math.max(4, Math.round(length / voxelSize));
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let i = 0; i < n; i++) {
    const y = Math.round(i * ct);
    const along = i * st;
    const [lx, lz] = rotY(along, 0, yaw);
    const id = i < 2 || i > n - 2 ? dark : pal;
    set(cx + Math.round(lx), cy + y, cz + Math.round(lz), id);
    set(cx + Math.round(lx), cy + y, cz + Math.round(lz) + 1, dark);
  }
  const guard = Math.max(2, Math.round(0.08 / voxelSize));
  const gy = Math.round(n * 0.45 * ct);
  for (let g = -guard; g <= guard; g++) {
    const [lx, lz] = rotY(n * 0.45 * st, g, yaw);
    set(cx + Math.round(lx), cy + gy, cz + Math.round(lz), pal);
  }
}

function maskGroup(
  volume: Uint8Array,
  byId: Map<number, PaletteEntry>,
  pred: (g: PaletteGroup | undefined, id: number) => boolean
): Uint8Array {
  const out = new Uint8Array(volume.length);
  for (let i = 0; i < volume.length; i++) {
    const id = volume[i];
    if (!id) continue;
    if (pred(byId.get(id)?.group, id)) out[i] = 1;
  }
  return out;
}

function colorize(
  mesh: MeshArrays,
  volume: Uint8Array,
  dims: [number, number, number],
  origin: [number, number, number],
  voxelSize: number,
  byId: Map<number, PaletteEntry>,
  fallback: [number, number, number]
): Float32Array {
  const [W, H, D] = dims;
  const colors = new Float32Array((mesh.positions.length / 3) * 3);
  const lookup = (wx: number, wy: number, wz: number): [number, number, number] => {
    const ix = Math.min(W - 1, Math.max(0, Math.floor((wx - origin[0]) / voxelSize)));
    const iy = Math.min(H - 1, Math.max(0, Math.floor((wy - origin[1]) / voxelSize)));
    const iz = Math.min(D - 1, Math.max(0, Math.floor((wz - origin[2]) / voxelSize)));
    const id = volume[ix + iy * W + iz * W * H];
    const hex = byId.get(id)?.hex;
    return hex ? srgbHexToLinear(hex) : fallback;
  };
  const nVerts = mesh.positions.length / 3;
  for (let v = 0; v < nVerts; v += 4) {
    const ax = (mesh.positions[v * 3] + mesh.positions[(v + 1) * 3] + mesh.positions[(v + 2) * 3] + mesh.positions[(v + 3) * 3]) / 4;
    const ay = (mesh.positions[v * 3 + 1] + mesh.positions[(v + 1) * 3 + 1] + mesh.positions[(v + 2) * 3 + 1] + mesh.positions[(v + 3) * 3 + 1]) / 4;
    const az = (mesh.positions[v * 3 + 2] + mesh.positions[(v + 1) * 3 + 2] + mesh.positions[(v + 2) * 3 + 2] + mesh.positions[(v + 3) * 3 + 2]) / 4;
    const nx = mesh.normals[v * 3];
    const ny = mesh.normals[v * 3 + 1];
    const nz = mesh.normals[v * 3 + 2];
    const rgb = lookup(ax - nx * voxelSize * 0.4, ay - ny * voxelSize * 0.4, az - nz * voxelSize * 0.4);
    for (let k = 0; k < 4; k++) {
      const o = (v + k) * 3;
      colors[o] = rgb[0];
      colors[o + 1] = rgb[1];
      colors[o + 2] = rgb[2];
    }
  }
  return colors;
}

export function meshToGeometry(mesh: MeshArrays, colors?: Float32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
  if (mesh.uvs.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs, 2));
  if (colors && colors.length) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(mesh.indices);
  g.computeBoundingSphere();
  return g;
}

function meshOne(
  volume: Uint8Array,
  mask: Uint8Array,
  built: BuiltVolume,
  byId: Map<number, PaletteEntry>,
  group: PaletteGroup | 'core',
  fallbackHex: string
): GroupGeometry | null {
  const meshed = greedyMesh(
    mask,
    built.dims,
    (x, y, z) => [
      built.origin[0] + x * built.voxelSize,
      built.origin[1] + y * built.voxelSize,
      built.origin[2] + z * built.voxelSize
    ],
    { cullNeg: [false, true, false], cullPos: [false, false, false] }
  );
  if (meshed.triangles === 0) return null;
  const colors = colorize(
    meshed.mesh,
    volume,
    built.dims,
    built.origin,
    built.voxelSize,
    byId,
    srgbHexToLinear(fallbackHex)
  );
  let voxels = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) voxels += 1;
  return { group, geometry: meshToGeometry(meshed.mesh, colors), triangles: meshed.triangles, voxels };
}

function erodeGoo(volume: Uint8Array, dims: [number, number, number], byId: Map<number, PaletteEntry>): Uint8Array {
  const [W, H, D] = dims;
  const core = new Uint8Array(volume.length);
  const get = (x: number, y: number, z: number): number => {
    if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D) return 0;
    return volume[x + y * W + z * W * H];
  };
  const isGoo = (id: number): boolean => {
    const g = byId.get(id)?.group;
    return g === 'goo' || g === 'glint';
  };
  for (let z = 0; z < D; z++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = x + y * W + z * W * H;
        if (!isGoo(volume[i])) continue;
        if (
          isGoo(get(x + 1, y, z)) &&
          isGoo(get(x - 1, y, z)) &&
          isGoo(get(x, y + 1, z)) &&
          isGoo(get(x, y - 1, z)) &&
          isGoo(get(x, y, z + 1)) &&
          isGoo(get(x, y, z - 1))
        ) {
          core[i] = 1;
        }
      }
    }
  }
  return core;
}

/** Greedy-mesh a JSON volume into merged BufferGeometries (one per material group). */
export function meshMonster(def: MonsterDef, built: BuiltVolume): MeshedMonster {
  const byId = palById(def);
  const groups: GroupGeometry[] = [];
  const push = (g: GroupGeometry | null): void => {
    if (g) groups.push(g);
  };
  push(
    meshOne(
      built.volume,
      maskGroup(built.volume, byId, (g) => g === 'goo'),
      built,
      byId,
      'goo',
      '#2f3329'
    )
  );
  push(
    meshOne(
      built.volume,
      erodeGoo(built.volume, built.dims, byId),
      built,
      byId,
      'core',
      '#24271f'
    )
  );
  push(
    meshOne(
      built.volume,
      maskGroup(built.volume, byId, (g) => g === 'glint'),
      built,
      byId,
      'glint',
      '#6e7464'
    )
  );
  push(
    meshOne(
      built.volume,
      maskGroup(built.volume, byId, (g) => g === 'bone'),
      built,
      byId,
      'bone',
      '#b4a888'
    )
  );
  push(
    meshOne(
      built.volume,
      maskGroup(built.volume, byId, (g) => g === 'rust'),
      built,
      byId,
      'rust',
      '#5c301c'
    )
  );
  return {
    groups,
    triangles: groups.reduce((s, g) => s + g.triangles, 0),
    voxels: built.voxelCount
  };
}

export function floorVsMidOccupancy(built: BuiltVolume): { floor: number; mid: number } {
  const [W, H, D] = built.dims;
  const midY = Math.max(1, Math.floor(H * 0.45));
  let floor = 0;
  let mid = 0;
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      if (built.volume[x + 0 * W + z * W * H]) floor += 1;
      if (built.volume[x + midY * W + z * W * H]) mid += 1;
    }
  }
  return { floor, mid };
}
