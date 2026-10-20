import * as THREE from 'three';
import {
  CELL,
  CORNICE_DEPTH,
  CORNICE_HEIGHT,
  CORNICE_SHADOW_ROWS,
  CORNICE_TEXELS_V
} from './constants';
import {
  enumerateFaces,
  listDoors,
  listSecrets,
  openingViews,
  type FloorMap
} from './layout';
import { enablePaintedSampling } from './painted';
import { lookForZoneBase, type WallKind } from './wall-look';
import type { FaceId } from '../voxel-lab/faces';

export const CORNICE_BRICK_FILE = 'cornice_brick.png';
export const CORNICE_SLAB_FILE = 'cornice_slab.png';

export type CorniceFamily = 'brick' | 'slab';

export type CorniceSeg = {
  tx: number;
  tz: number;
  face: 'N' | 'E' | 'S' | 'W';
  family: CorniceFamily;
  file: string;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  bulge: number;
};

export function corniceFamilyForKind(kind: WallKind): CorniceFamily {
  return kind === 'brick' || kind === 'soot' ? 'brick' : 'slab';
}

export function corniceFileForFamily(family: CorniceFamily): string {
  return family === 'brick' ? CORNICE_BRICK_FILE : CORNICE_SLAB_FILE;
}

export function corniceShadowV(family: CorniceFamily): number {
  return CORNICE_SHADOW_ROWS[family] / CORNICE_TEXELS_V;
}

function keyOf(tx: number, tz: number, face: string): string {
  return `${tx},${tz},${face}`;
}

function boxForFace(tx: number, tz: number, face: 'N' | 'E' | 'S' | 'W', bulge: number): Pick<
  CorniceSeg,
  'x' | 'y' | 'z' | 'sx' | 'sy' | 'sz'
> {
  const ox = (tx - 0.5) * CELL;
  const oz = (tz - 0.5) * CELL;
  const inset = bulge * CELL;
  const y = CELL - CORNICE_HEIGHT / 2;
  if (face === 'N') {
    return {
      x: ox + CELL / 2,
      y,
      z: oz + inset + CORNICE_DEPTH / 2,
      sx: CELL,
      sy: CORNICE_HEIGHT,
      sz: CORNICE_DEPTH
    };
  }
  if (face === 'S') {
    return {
      x: ox + CELL / 2,
      y,
      z: oz + CELL - inset - CORNICE_DEPTH / 2,
      sx: CELL,
      sy: CORNICE_HEIGHT,
      sz: CORNICE_DEPTH
    };
  }
  if (face === 'W') {
    return {
      x: ox + inset + CORNICE_DEPTH / 2,
      y,
      z: oz + CELL / 2,
      sx: CORNICE_DEPTH,
      sy: CORNICE_HEIGHT,
      sz: CELL
    };
  }
  return {
    x: ox + CELL - inset - CORNICE_DEPTH / 2,
    y,
    z: oz + CELL / 2,
    sx: CORNICE_DEPTH,
    sy: CORNICE_HEIGHT,
    sz: CELL
  };
}

/** One band per wall / door / secret face at the ceiling line. Overlap mitres corners. */
export function listCorniceSegments(map: FloorMap): CorniceSeg[] {
  const out: CorniceSeg[] = [];
  const seen = new Set<string>();
  const add = (tx: number, tz: number, face: FaceId, kind: WallKind, bulge: number): void => {
    if (face !== 'N' && face !== 'E' && face !== 'S' && face !== 'W') return;
    const key = keyOf(tx, tz, face);
    if (seen.has(key)) return;
    seen.add(key);
    const family = corniceFamilyForKind(kind);
    out.push({
      tx,
      tz,
      face,
      family,
      file: corniceFileForFamily(family),
      bulge,
      ...boxForFace(tx, tz, face, bulge)
    });
  };

  for (const job of enumerateFaces(map)) {
    if (job.kind !== 'wall') continue;
    const kind = job.look?.kind ?? lookForZoneBase(job.tx, job.tz).kind;
    add(job.tx, job.tz, job.face, kind, job.bulge);
  }
  for (const spec of [...listDoors(map), ...listSecrets(map)]) {
    for (const view of openingViews(map, spec.x, spec.y)) {
      const look = lookForZoneBase(view.tx, view.tz);
      add(view.tx, view.tz, view.face, look.kind, 0);
    }
  }
  return out;
}

/**
 * Front/end/top use the stone rows (1:1 from the top of the 256×64 strip).
 * Underside takes only the painted shadow line so it is not drawn on the face.
 */
export function setCorniceUvs(geo: THREE.BufferGeometry, seg: CorniceSeg): void {
  const uv = geo.getAttribute('uv');
  const shadowV = corniceShadowV(seg.family);
  const texel = CELL / 256;
  const frontV0 = 1 - CORNICE_HEIGHT / texel / CORNICE_TEXELS_V;
  const topV0 = 1 - CORNICE_DEPTH / texel / CORNICE_TEXELS_V;
  const alongX = seg.face === 'N' || seg.face === 'S';
  const front = seg.face === 'N' ? 4 : seg.face === 'S' ? 5 : seg.face === 'E' ? 0 : 1;
  const back = seg.face === 'N' ? 5 : seg.face === 'S' ? 4 : seg.face === 'E' ? 1 : 0;
  const endU = CORNICE_DEPTH / CELL;

  const write = (f: number, u: number, v: number, i: number): void => {
    uv.setXY(f * 4 + i, u, v);
  };

  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const u0 = uv.getX(i);
      const v0 = uv.getY(i);
      if (f === 2) {
        write(f, alongX ? u0 : v0, topV0 + (alongX ? v0 : u0) * (1 - topV0), k);
      } else if (f === 3) {
        write(f, alongX ? u0 : v0, (alongX ? v0 : u0) * shadowV, k);
      } else if (f === front || f === back) {
        write(f, u0, frontV0 + v0 * (1 - frontV0), k);
      } else {
        write(f, u0 * endU, frontV0 + v0 * (1 - frontV0), k);
      }
    }
  }
  uv.needsUpdate = true;
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

function corniceMaterial(map: THREE.Texture): THREE.MeshPhysicalMaterial {
  enablePaintedSampling(map);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
}

/** Two batched MeshPhysical draws (brick / slab). Static — not in the near-ring cache. */
export function meshCornice(
  brickMap: THREE.Texture,
  slabMap: THREE.Texture,
  segs: CorniceSeg[] = []
): THREE.Group | null {
  if (!segs.length) return null;
  const group = new THREE.Group();
  group.name = 'ceiling-cornice';
  group.userData.castWhenOn = false;
  const maps: Record<CorniceFamily, THREE.Texture> = { brick: brickMap, slab: slabMap };
  for (const family of ['brick', 'slab'] as const) {
    const list = segs.filter((s) => s.family === family);
    if (!list.length) continue;
    const geos = list.map((s) => {
      const g = new THREE.BoxGeometry(s.sx, s.sy, s.sz);
      setCorniceUvs(g, s);
      g.translate(s.x, s.y, s.z);
      return g;
    });
    const geo = mergeGeometries(geos);
    if (!geo) continue;
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, corniceMaterial(maps[family]));
    mesh.name = `ceiling-cornice-${family}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.castWhenOn = false;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group.children.length ? group : null;
}
