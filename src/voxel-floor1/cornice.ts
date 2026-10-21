import * as THREE from 'three';
import {
  CELL,
  CORNICE_DEPTH,
  CORNICE_HEIGHT,
  CORNICE_SHADOW_ROWS,
  CORNICE_TEXELS_U,
  CORNICE_TEXELS_V,
  CORNICE_WALL_INSET,
  WALL_TEXELS
} from './constants';
import {
  enumerateFaces,
  listDoors,
  listSecrets,
  openingViews,
  type FloorMap
} from './layout';
import { enablePaintedSampling } from './painted';
import { faceUOffset, lookForZoneBase, type WallKind } from './wall-look';
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
  uOffset: number;
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
  const inset = bulge * CELL - CORNICE_WALL_INSET;
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
      uOffset: faceUOffset(face, tx, tz),
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
/** 128 wall texels per cell — the 256-wide strip covers two cells so joints still meet. */
export const CORNICE_U_SCALE = WALL_TEXELS / CORNICE_TEXELS_U;

function hash01(tx: number, tz: number, face: string, salt: number): number {
  let n = Math.imul((tx + 17) * 374761393 ^ (tz + 31) * 668265263 ^ face.charCodeAt(0) * 97 ^ salt, 2246822519);
  n ^= n >>> 15;
  return ((n >>> 0) % 10000) / 10000;
}

/**
 * Project UVs from the box in metres so every face (front, underside, ends,
 * top) has a real U and V span at wall texel density. The old path remapped
 * BoxGeometry 0–1 UVs with an integer running U and ClampToEdge on V — a
 * collapsed axis smeared one texel row/column into vertical streaks.
 */
export function setCorniceUvs(geo: THREE.BufferGeometry, seg: CorniceSeg): void {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  if (!pos || !nrm || !uv) return;
  const shadowV = corniceShadowV(seg.family);
  const alongX = seg.face === 'N' || seg.face === 'S';
  const texel = CELL / WALL_TEXELS;
  const uPerM = CORNICE_U_SCALE / CELL;
  const vPerM = 1 / (CORNICE_TEXELS_V * texel);
  const cellMin = alongX ? (seg.tx - 0.5) * CELL : (seg.tz - 0.5) * CELL;
  const centerAlong = alongX ? seg.x : seg.z;
  const depthSize = Math.max(1e-6, alongX ? seg.sz : seg.sx);
  const heightSize = Math.max(1e-6, seg.sy);
  const uOff = (seg.uOffset ?? 0) * CORNICE_U_SCALE;

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const lz = pos.getZ(i);
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    const nz = nrm.getZ(i);
    const along = centerAlong + (alongX ? lx : lz);
    const u = (along - cellMin) * uPerM + uOff;
    const h01 = ly / heightSize + 0.5;
    const d01 = (alongX ? lz : lx) / depthSize + 0.5;
    const stoneV = shadowV + h01 * heightSize * vPerM;
    if (ny < -0.5) {
      uv.setXY(i, u, Math.min(shadowV, Math.max(0, d01 * shadowV)));
    } else if (ny > 0.5) {
      uv.setXY(i, u, shadowV + d01 * depthSize * vPerM);
    } else {
      const wallNormal = alongX ? Math.abs(nz) >= Math.abs(nx) : Math.abs(nx) >= Math.abs(nz);
      if (wallNormal) uv.setXY(i, u, stoneV);
      else uv.setXY(i, uOff + d01 * depthSize * uPerM, stoneV);
    }
  }
  uv.needsUpdate = true;
}

/** Darken, grimy, chip the clean LEGO strip so it reads as the room's old stone. */
export function wearCornicePixels(
  image: { width: number; height: number; data: Uint8ClampedArray | Uint8Array },
  family: CorniceFamily
): void {
  const w = image.width;
  const h = image.height;
  const data = image.data;
  const shadow = CORNICE_SHADOW_ROWS[family];
  for (let y = 0; y < h; y++) {
    const fromBottom = h - 1 - y;
    const underside = fromBottom < shadow;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let n = Math.imul(x * 374761393 + y * 668265263 + (family === 'brick' ? 17 : 31), 2246822519);
      n ^= n >>> 13;
      const rnd = ((n >>> 0) % 10000) / 10000;
      const edge = Math.min(x, w - 1 - x, y, h - 1 - y);
      const grime = (1 - Math.min(1, edge / 7)) * 0.34 + rnd * 0.16;
      const chip = ((x < 10 || x > w - 11 || fromBottom > h - 10) && rnd > 0.55 ? 0.36 + rnd * 0.28 : 0);
      let k = 1 - grime - chip;
      if (underside) k *= 0.2;
      else k *= family === 'slab' ? 0.58 + rnd * 0.1 : 0.68 + rnd * 0.1;
      data[i] = Math.max(0, Math.min(255, Math.round(data[i] * k)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(data[i + 1] * k * 0.97)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(data[i + 2] * k * 0.93)));
    }
  }
  for (let c = 0; c < 14; c++) {
    const cx = Math.floor(((c + 0.2) * w) / 11) % w;
    const cy = shadow + 1 + (c % 4);
    const rw = 2 + (c % 6);
    const rh = 2 + (c % 4);
    for (let yy = cy; yy < Math.min(h - 1, cy + rh); yy++) {
      for (let xx = cx; xx < Math.min(w, cx + rw); xx++) {
        const i = ((h - 1 - yy) * w + xx) * 4;
        data[i] = Math.max(0, data[i] - 62);
        data[i + 1] = Math.max(0, data[i + 1] - 66);
        data[i + 2] = Math.max(0, data[i + 2] - 58);
      }
    }
  }
}

export function wearCorniceMap(src: THREE.Texture, family: CorniceFamily): THREE.Texture {
  const img = src.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | undefined;
  const w = img?.naturalWidth || img?.width || 0;
  const h = img?.naturalHeight || img?.height || 0;
  if (!img || !w || !h || typeof document === 'undefined') return src;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(img as CanvasImageSource, 0, 0);
  const pix = ctx.getImageData(0, 0, w, h);
  wearCornicePixels(pix, family);
  ctx.putImageData(pix, 0, 0);
  const tex = new THREE.Texture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export type CornicePiece = CorniceSeg;

/** Three blocks, same height/depth. Age is in the joints and a tiny bottom nick. */
export function cornicePieces(seg: CorniceSeg): CornicePiece[] {
  const alongX = seg.face === 'N' || seg.face === 'S';
  const len = alongX ? seg.sx : seg.sz;
  const parts = 3;
  const out: CornicePiece[] = [];
  let cursor = 0;
  for (let i = 0; i < parts; i++) {
    const share = i === parts - 1 ? 1 - cursor / len : 0.28 + hash01(seg.tx, seg.tz, seg.face, 4 + i) * 0.14;
    const slen = i === parts - 1 ? len - cursor : share * len;
    const mid = cursor + slen / 2 - len / 2;
    const piece: CornicePiece = {
      ...seg,
      sy: CORNICE_HEIGHT,
      y: CELL - CORNICE_HEIGHT / 2,
      sx: alongX ? slen : CORNICE_DEPTH,
      sz: alongX ? CORNICE_DEPTH : slen,
      x: alongX ? seg.x + mid : seg.x,
      z: alongX ? seg.z : seg.z + mid
    };
    out.push(piece);
    cursor += slen;
  }
  const chipAt = Math.floor(hash01(seg.tx, seg.tz, seg.face, 41) * parts);
  const host = out[chipAt];
  const chipW = 0.035 + hash01(seg.tx, seg.tz, seg.face, 43) * 0.02;
  const chipH = 0.022;
  const chipD = CORNICE_DEPTH * 0.45;
  const sign = hash01(seg.tx, seg.tz, seg.face, 47) > 0.5 ? 1 : -1;
  const y = host.y - host.sy / 2 + chipH / 2;
  if (alongX) {
    out.push({
      ...host,
      sx: chipW,
      sy: chipH,
      sz: chipD,
      x: host.x + sign * (host.sx / 2 - chipW / 2),
      y,
      z: host.z + (seg.face === 'S' ? (CORNICE_DEPTH - chipD) / 2 : (chipD - CORNICE_DEPTH) / 2)
    });
  } else {
    out.push({
      ...host,
      sx: chipD,
      sy: chipH,
      sz: chipW,
      x: host.x + (seg.face === 'E' ? (CORNICE_DEPTH - chipD) / 2 : (chipD - CORNICE_DEPTH) / 2),
      y,
      z: host.z + sign * (host.sz / 2 - chipW / 2)
    });
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

function corniceMaterial(map: THREE.Texture): THREE.MeshPhysicalMaterial {
  enablePaintedSampling(map);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.generateMipmaps = false;
  map.minFilter = THREE.NearestFilter;
  map.magFilter = THREE.NearestFilter;
  return new THREE.MeshPhysicalMaterial({
    map,
    roughness: 1,
    metalness: 0,
    clearcoat: 0,
    sheen: 0,
    specularIntensity: 0,
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
  const maps: Record<CorniceFamily, THREE.Texture> = {
    brick: wearCorniceMap(brickMap, 'brick'),
    slab: wearCorniceMap(slabMap, 'slab')
  };
  for (const family of ['brick', 'slab'] as const) {
    const list = segs.filter((s) => s.family === family);
    if (!list.length) continue;
    const geos = list.flatMap((s) =>
      cornicePieces(s).map((p) => {
        const g = new THREE.BoxGeometry(p.sx, p.sy, p.sz);
        setCorniceUvs(g, p);
        g.translate(p.x, p.y, p.z);
        return g;
      })
    );
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
