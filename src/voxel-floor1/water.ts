import * as THREE from 'three';
import { CELL, SCONCE_RADIUS_TILES } from './constants';
import { FACE_INTO_ROOM, floodReach, sconceIsLit, type SconceSpec } from './fixtures';
import { isWaterCell, type FloorMap } from './layout';
import { enablePaintedSampling } from './painted';
import { loadPng } from '../voxel-lab/materials';

/** Water surface sits this far below the dry stone floor (6–10 cm). */
export const WATER_SURFACE_DROP = 0.08;
/** Hairline so the painted bed does not z-fight the ripple plane. */
export const WATER_BED_GAP = 0.004;
export const WATER_SURFACE_Y = -WATER_SURFACE_DROP;
export const WATER_BED_Y = WATER_SURFACE_Y - WATER_BED_GAP;
/** Thin stone curb on water-to-dry (and water-to-wall) edges. */
export const WATER_LIP_WIDTH = 0.06;
/** Bed / surface overlap under the lip so the join does not open a hole. */
export const WATER_LIP_OVERLAP = 0.008;
export const WATER_BAND_WIDTH = 0.11;
export const WATER_SURFACE_SEGS = 4;
export const WATER_RIPPLE_AMP = 0.005;
const WATER_RIPPLE_HZ = 0.16;

export const WATER_FACES = ['N', 'E', 'S', 'W'] as const;
export type WaterFace = (typeof WATER_FACES)[number];

const FACE_DELTA: Record<WaterFace, { dx: number; dz: number }> = {
  N: { dx: 0, dz: -1 },
  E: { dx: 1, dz: 0 },
  S: { dx: 0, dz: 1 },
  W: { dx: -1, dz: 0 }
};

export type WaterCell = { x: number; y: number };

export type WaterLip = {
  tx: number;
  tz: number;
  face: WaterFace;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
};

export type Aabb = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

export type WaterBedRect = { minX: number; maxX: number; minZ: number; maxZ: number; y: number };

export function listWaterCells(map: FloorMap): WaterCell[] {
  const out: WaterCell[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isWaterCell(map, x, y)) out.push({ x, y });
    }
  }
  return out;
}

export function hasWaterNeighbor(map: FloorMap, x: number, y: number): boolean {
  for (const face of WATER_FACES) {
    const { dx, dz } = FACE_DELTA[face];
    if (isWaterCell(map, x + dx, y + dz)) return true;
  }
  return false;
}

/**
 * Lip on every water edge that does not face more water — dry walkable
 * cells and walls both open a hole if the pool drops without a curb.
 */
export function waterEdgeNeedsLip(map: FloorMap, x: number, y: number, face: WaterFace): boolean {
  if (!isWaterCell(map, x, y)) return false;
  const { dx, dz } = FACE_DELTA[face];
  return !isWaterCell(map, x + dx, y + dz);
}

export function waterBedSize(): number {
  return CELL - 2 * WATER_LIP_WIDTH + WATER_LIP_OVERLAP;
}

/** Water beds inset for the lip; dry tiles that touch water stay CELL so they do not hang over the pool. */
export function paintedFloorSize(tx: number, tz: number, map: FloorMap, defaultSize: number): number {
  if (isWaterCell(map, tx, tz)) return waterBedSize();
  if (hasWaterNeighbor(map, tx, tz)) return CELL;
  return defaultSize;
}

export function applyWaterBedPose(pose: { y: number }, tx: number, tz: number, map: FloorMap): void {
  if (isWaterCell(map, tx, tz)) pose.y += WATER_BED_Y;
}

export function waterBedRect(tx: number, tz: number): WaterBedRect {
  const half = waterBedSize() / 2;
  return {
    minX: tx * CELL - half,
    maxX: tx * CELL + half,
    minZ: tz * CELL - half,
    maxZ: tz * CELL + half,
    y: WATER_BED_Y
  };
}

export function lipBox(tx: number, tz: number, face: WaterFace): WaterLip {
  const height = -WATER_BED_Y;
  const y = WATER_BED_Y / 2;
  const along = CELL;
  const inward = WATER_LIP_WIDTH / 2;
  if (face === 'E') {
    return {
      tx,
      tz,
      face,
      x: (tx + 0.5) * CELL - inward,
      y,
      z: tz * CELL,
      sx: WATER_LIP_WIDTH,
      sy: height,
      sz: along
    };
  }
  if (face === 'W') {
    return {
      tx,
      tz,
      face,
      x: (tx - 0.5) * CELL + inward,
      y,
      z: tz * CELL,
      sx: WATER_LIP_WIDTH,
      sy: height,
      sz: along
    };
  }
  if (face === 'S') {
    return {
      tx,
      tz,
      face,
      x: tx * CELL,
      y,
      z: (tz + 0.5) * CELL - inward,
      sx: along,
      sy: height,
      sz: WATER_LIP_WIDTH
    };
  }
  return {
    tx,
    tz,
    face,
    x: tx * CELL,
    y,
    z: (tz - 0.5) * CELL + inward,
    sx: along,
    sy: height,
    sz: WATER_LIP_WIDTH
  };
}

export function listWaterLips(map: FloorMap): WaterLip[] {
  const out: WaterLip[] = [];
  for (const cell of listWaterCells(map)) {
    for (const face of WATER_FACES) {
      if (waterEdgeNeedsLip(map, cell.x, cell.y, face)) {
        out.push(lipBox(cell.x, cell.y, face));
      }
    }
  }
  return out;
}

export function lipBounds(lip: WaterLip): Aabb {
  return {
    minX: lip.x - lip.sx / 2,
    maxX: lip.x + lip.sx / 2,
    minY: lip.y - lip.sy / 2,
    maxY: lip.y + lip.sy / 2,
    minZ: lip.z - lip.sz / 2,
    maxZ: lip.z + lip.sz / 2
  };
}

/** True when the curb meets the bed and the dry floor with no open gap. */
export function lipSealsBed(lip: WaterLip, bed: WaterBedRect): boolean {
  const b = lipBounds(lip);
  if (b.maxY < -1e-4) return false;
  if (b.minY > WATER_SURFACE_Y + 1e-4) return false;
  const overlap = 0.002;
  if (lip.face === 'E') {
    return b.maxX >= (lip.tx + 0.5) * CELL - 1e-4 && b.minX <= bed.maxX + overlap;
  }
  if (lip.face === 'W') {
    return b.minX <= (lip.tx - 0.5) * CELL + 1e-4 && b.maxX >= bed.minX - overlap;
  }
  if (lip.face === 'S') {
    return b.maxZ >= (lip.tz + 0.5) * CELL - 1e-4 && b.minZ <= bed.maxZ + overlap;
  }
  return b.minZ <= (lip.tz - 0.5) * CELL + 1e-4 && b.maxZ >= bed.minZ - overlap;
}

export function listWaterGlintCells(map: FloorMap, sconces: readonly SconceSpec[]): WaterCell[] {
  const seen = new Set<string>();
  const out: WaterCell[] = [];
  for (const s of sconces) {
    if (!sconceIsLit(s)) continue;
    const room = {
      x: s.x + Math.round(FACE_INTO_ROOM[s.face].nx),
      y: s.y + Math.round(FACE_INTO_ROOM[s.face].nz)
    };
    for (const key of floodReach(map, room.x, room.y, SCONCE_RADIUS_TILES)) {
      const [x, y] = key.split(',').map(Number);
      if (!isWaterCell(map, x, y) || seen.has(key)) continue;
      seen.add(key);
      out.push({ x, y });
    }
  }
  return out;
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!geos.length) return null;
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.getAttribute('position').count;
    iCount += g.getIndex()?.count ?? g.getAttribute('position').count;
  }
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  let vBase = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    const ix = g.getIndex();
    for (let i = 0; i < p.count; i++) {
      pos[(vo + i) * 3] = p.getX(i);
      pos[(vo + i) * 3 + 1] = p.getY(i);
      pos[(vo + i) * 3 + 2] = p.getZ(i);
      if (n) {
        nrm[(vo + i) * 3] = n.getX(i);
        nrm[(vo + i) * 3 + 1] = n.getY(i);
        nrm[(vo + i) * 3 + 2] = n.getZ(i);
      }
      if (u) {
        uv[(vo + i) * 2] = u.getX(i);
        uv[(vo + i) * 2 + 1] = u.getY(i);
      }
    }
    if (ix) {
      for (let i = 0; i < ix.count; i++) idx[io++] = ix.getX(i) + vBase;
    } else {
      for (let i = 0; i < p.count; i++) idx[io++] = i + vBase;
    }
    vo += p.count;
    vBase += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function makeRippleNormal(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const height = (x: number, y: number): number => {
    const u = x / size;
    const v = y / size;
    return (
      Math.sin(u * Math.PI * 3.2) * 0.32 +
      Math.sin((u * 0.65 + v) * Math.PI * 2.4) * 0.22 +
      Math.sin((v * 1.15 - u * 0.4) * Math.PI * 4.1) * 0.12
    );
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = height(x + 1, y) - height(x - 1, y);
      const dy = height(x, y + 1) - height(x, y - 1);
      let nx = -dx * 1.8;
      let ny = -dy * 1.8;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function makeGlintTexture(): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
  g.addColorStop(0, 'rgba(255, 214, 150, 0.85)');
  g.addColorStop(0.4, 'rgba(196, 150, 88, 0.28)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function makeBandTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 32, 0);
  g.addColorStop(0, 'rgba(4, 3, 3, 0.82)');
  g.addColorStop(0.4, 'rgba(6, 5, 4, 0.4)');
  g.addColorStop(1, 'rgba(8, 7, 6, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function setLipUvs(geo: THREE.BufferGeometry, lip: WaterLip): void {
  const uv = geo.getAttribute('uv');
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const lz = pos.getZ(i);
    const along = Math.abs(lip.sx - CELL) < 1e-4 ? lx : lz;
    uv.setXY(i, (along + CELL / 2) / CELL, (ly + lip.sy / 2) / CELL);
  }
  uv.needsUpdate = true;
}

function surfacePlane(tx: number, tz: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(waterBedSize(), waterBedSize(), WATER_SURFACE_SEGS, WATER_SURFACE_SEGS);
  geo.rotateX(-Math.PI / 2);
  geo.translate(tx * CELL, WATER_SURFACE_Y, tz * CELL);
  return geo;
}

function bandPlane(lip: WaterLip): THREE.BufferGeometry {
  const along = lip.face === 'E' || lip.face === 'W' ? lip.sz : lip.sx;
  const geo = new THREE.PlaneGeometry(along, WATER_BAND_WIDTH);
  geo.rotateX(-Math.PI / 2);
  const inset = WATER_LIP_WIDTH + WATER_BAND_WIDTH / 2 - WATER_LIP_OVERLAP * 0.5;
  let x = lip.tx * CELL;
  let z = lip.tz * CELL;
  let rotY = 0;
  if (lip.face === 'E') {
    x = (lip.tx + 0.5) * CELL - inset;
    rotY = Math.PI / 2;
  } else if (lip.face === 'W') {
    x = (lip.tx - 0.5) * CELL + inset;
    rotY = -Math.PI / 2;
  } else if (lip.face === 'S') {
    z = (lip.tz + 0.5) * CELL - inset;
    rotY = 0;
  } else {
    z = (lip.tz - 0.5) * CELL + inset;
    rotY = Math.PI;
  }
  geo.rotateY(rotY);
  geo.translate(x, WATER_SURFACE_Y + 0.0015, z);
  return geo;
}

function stoneLipMaterial(map: THREE.Texture): THREE.MeshPhysicalMaterial {
  enablePaintedSampling(map);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshPhysicalMaterial({
    map,
    roughness: 1,
    metalness: 0,
    clearcoat: 0,
    sheen: 0,
    specularIntensity: 0,
    envMapIntensity: 0,
    fog: true,
    emissive: 0x000000,
    emissiveIntensity: 0
  });
}

function waterSurfaceMaterial(normal: THREE.Texture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x1a201c,
    roughness: 0.74,
    metalness: 0,
    clearcoat: 0,
    sheen: 0,
    specularIntensity: 0.14,
    envMapIntensity: 0,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    fog: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.32, 0.32)
  });
}

export async function buildFloor1Water(
  map: FloorMap,
  sconces: readonly SconceSpec[]
): Promise<{
  group: THREE.Group;
  update: (now: number, freeze: boolean) => void;
}> {
  const group = new THREE.Group();
  group.name = 'floor1-water';
  group.userData.castWhenOn = false;

  const cells = listWaterCells(map);
  const lips = listWaterLips(map);
  const stone = await loadPng('floor_stone.png');
  const ripple = makeRippleNormal();

  if (lips.length) {
    const geos = lips.map((lip) => {
      const g = new THREE.BoxGeometry(lip.sx, lip.sy, lip.sz);
      setLipUvs(g, lip);
      g.translate(lip.x, lip.y, lip.z);
      return g;
    });
    const geo = mergeGeometries(geos);
    if (geo) {
      const mesh = new THREE.Mesh(geo, stoneLipMaterial(stone.texture));
      mesh.name = 'water-lips';
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  let surface: THREE.Mesh | null = null;
  let restY: Float32Array | null = null;
  if (cells.length) {
    const geo = mergeGeometries(cells.map((c) => surfacePlane(c.x, c.y)));
    if (geo) {
      const pos = geo.getAttribute('position');
      restY = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) restY[i] = pos.getY(i);
      const mesh = new THREE.Mesh(geo, waterSurfaceMaterial(ripple));
      mesh.name = 'water-surface';
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      group.add(mesh);
      surface = mesh;
    }
  }

  if (lips.length) {
    const geo = mergeGeometries(lips.map(bandPlane));
    if (geo) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshPhysicalMaterial({
          map: makeBandTexture(),
          color: 0xffffff,
          roughness: 1,
          metalness: 0,
          clearcoat: 0,
          specularIntensity: 0,
          envMapIntensity: 0,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          fog: true,
          emissive: 0x000000,
          emissiveIntensity: 0
        })
      );
      mesh.name = 'water-edge-band';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      group.add(mesh);
    }
  }

  const glintCells = listWaterGlintCells(map, sconces);
  let glintMat: THREE.MeshBasicMaterial | null = null;
  if (glintCells.length) {
    const glintMap = makeGlintTexture();
    glintMat = new THREE.MeshBasicMaterial({
      map: glintMap,
      color: 0xffe2a4,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: true,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    const geos = glintCells.map((cell) => {
      const g = new THREE.PlaneGeometry(CELL * 0.42, CELL * 0.42);
      g.rotateX(-Math.PI / 2);
      g.translate(cell.x * CELL, WATER_SURFACE_Y + 0.006, cell.y * CELL);
      return g;
    });
    const geo = mergeGeometries(geos);
    if (geo) {
      const mesh = new THREE.Mesh(geo, glintMat);
      mesh.name = 'water-glints';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.castWhenOn = false;
      mesh.userData.skipVertexLighting = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      group.add(mesh);
    }
  }

  return {
    group,
    update: (now, freeze) => {
      const t = freeze ? 0 : now * 0.001;
      if (surface) {
        const mat = surface.material as THREE.MeshPhysicalMaterial;
        if (mat.normalMap) {
          mat.normalMap.offset.set(t * 0.012, t * 0.007);
        }
        if (restY && !freeze) {
          const pos = surface.geometry.getAttribute('position');
          const wave = t * Math.PI * 2 * WATER_RIPPLE_HZ;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            pos.setY(
              i,
              restY[i] +
                WATER_RIPPLE_AMP *
                  Math.sin(x * 1.65 + wave) *
                  Math.cos(z * 1.28 + wave * 0.72)
            );
          }
          pos.needsUpdate = true;
        }
      }
      if (glintMat) {
        glintMat.opacity = freeze ? 0.34 : 0.34 * (0.84 + 0.16 * Math.sin(t * 1.05));
      }
    }
  };
}
