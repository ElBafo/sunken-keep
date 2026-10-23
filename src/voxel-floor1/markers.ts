import * as THREE from 'three';
import { BRACKET_VOX, CELL, EYE_HEIGHT } from './constants';
import { tileFlatPose } from '../voxel-lab/faces';
import { tileAt, type FloorMap } from './layout';

export type MarkerSpec = {
  id: string;
  kind: 'journal' | 'carving';
  x: number;
  y: number;
  prompt: string;
  face?: 'N' | 'E' | 'S' | 'W';
  /** Secret cell that must be open before this marker shows. */
  secretX: number;
  secretY: number;
  art: string;
};

/**
 * Classic floor-1 secret contents (from public/levels/floor1.ts):
 * - (5,1) secret + carving_secret — 1-square alcove, plate "We gave much. We need more."
 * - (5,13) secret opens west to (4,13) journal_page 1 (Orrun's journal).
 */
export const CARVING_SECRET_NEAR = 'art/decals/carving_secret_near.png';
export const JOURNAL_PAGE_NEAR = 'art/dungeon/item_journal_page_near.png';
/** Near PNG is 44×28 (40×24 plate + 2px glow). Same texel size as the wall. */
export const CARVING_SECRET_PX: [number, number] = [44, 28];
export const JOURNAL_PAGE_PX: [number, number] = [80, 60];
/** Classic item height is a quarter-wall billboard. */
export const JOURNAL_PAGE_HEIGHT = 0.25 * CELL;

export const floor1SecretMarkers: readonly MarkerSpec[] = [
  {
    id: 'carving_secret',
    kind: 'carving',
    x: 5,
    y: 1,
    secretX: 5,
    secretY: 1,
    face: 'N',
    art: CARVING_SECRET_NEAR,
    prompt: '"We gave much. We need more."'
  }
];

const FACE_DELTA: Record<'N' | 'E' | 'S' | 'W', [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0]
};

export function markerUnlocked(map: FloorMap, spec: MarkerSpec): boolean {
  return !!tileAt(map, spec.secretX, spec.secretY)?.secretOpen;
}

function cutoutMat(map: THREE.Texture): THREE.MeshBasicMaterial {
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return new THREE.MeshBasicMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.08,
    depthTest: true,
    depthWrite: true,
    fog: true,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
}

async function loadArt(rel: string): Promise<THREE.Texture> {
  if (typeof Image === 'undefined') throw new Error('no Image');
  const url = `${import.meta.env.BASE_URL}${rel}`;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const texture = new THREE.Texture(img);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Fallback only when Classic art cannot decode (unit tests). Chiselled stone, not a grey quad. */
function carvedStoneTexture(w: number, h: number): THREE.DataTexture {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const edge = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
      const groove = (x + y) % 7 === 0 || (x - y + 16) % 9 === 0;
      const n = edge ? 48 : groove ? 72 : 96 + ((x * 13 + y * 7) % 18);
      rgba[i] = n;
      rgba[i + 1] = n - 4;
      rgba[i + 2] = n - 10;
      rgba[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function parchmentTexture(w: number, h: number): THREE.DataTexture {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const line = y > 10 && y < h - 8 && y % 8 === 0 && x > 8 && x < w - 8;
      rgba[i] = line ? 90 : 196;
      rgba[i + 1] = line ? 70 : 176;
      rgba[i + 2] = line ? 48 : 137;
      rgba[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export async function buildFloor1Markers(map: FloorMap): Promise<{
  group: THREE.Group;
  update: () => void;
  interact: (px: number, py: number, dir: number) => string | null;
}> {
  const group = new THREE.Group();
  group.name = 'floor1-markers';
  const nodes: Array<{ spec: MarkerSpec; obj: THREE.Object3D }> = [];

  let carvingMap: THREE.Texture;
  let journalMap: THREE.Texture;
  try {
    [carvingMap, journalMap] = await Promise.all([loadArt(CARVING_SECRET_NEAR), loadArt(JOURNAL_PAGE_NEAR)]);
  } catch {
    carvingMap = carvedStoneTexture(CARVING_SECRET_PX[0], CARVING_SECRET_PX[1]);
    journalMap = parchmentTexture(JOURNAL_PAGE_PX[0], JOURNAL_PAGE_PX[1]);
  }

  for (const spec of floor1SecretMarkers) {
    let obj: THREE.Object3D;
    if (spec.kind === 'journal') {
      const w = JOURNAL_PAGE_HEIGHT * (JOURNAL_PAGE_PX[0] / JOURNAL_PAGE_PX[1]);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, JOURNAL_PAGE_HEIGHT), cutoutMat(journalMap));
      mesh.position.set(spec.x * CELL + CELL * 0.25, JOURNAL_PAGE_HEIGHT * 0.5, spec.y * CELL);
      mesh.rotation.y = -Math.PI / 2;
      mesh.userData.noShadow = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      mesh.name = spec.id;
      obj = mesh;
    } else {
      const face = spec.face ?? 'N';
      const pose = tileFlatPose(face, spec.x, spec.y, CELL, 'center');
      const [pw, ph] = CARVING_SECRET_PX;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(pw * BRACKET_VOX, ph * BRACKET_VOX),
        cutoutMat(carvingMap)
      );
      const [dx, dz] = FACE_DELTA[face];
      mesh.position.set(pose.x - dx * 0.05, EYE_HEIGHT, pose.z - dz * 0.05);
      mesh.rotation.y = pose.rotY;
      mesh.userData.noShadow = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      mesh.name = spec.id;
      obj = mesh;
    }
    obj.visible = false;
    group.add(obj);
    nodes.push({ spec, obj });
  }

  const update = (): void => {
    for (const node of nodes) node.obj.visible = markerUnlocked(map, node.spec);
  };

  const interact = (px: number, py: number, dir: number): string | null => {
    update();
    const [dx, dy] = FACE_DELTA[['N', 'E', 'S', 'W'][dir & 3] as 'N' | 'E' | 'S' | 'W'];
    const fx = px + dx;
    const fy = py + dy;
    for (const node of nodes) {
      if (!markerUnlocked(map, node.spec)) continue;
      const on = node.spec.x === px && node.spec.y === py;
      const ahead = node.spec.x === fx && node.spec.y === fy;
      const facingPlaque = node.spec.kind === 'carving' && on && node.spec.face === ['N', 'E', 'S', 'W'][dir & 3];
      if (on || ahead || facingPlaque) return node.spec.prompt;
    }
    return null;
  };

  update();
  return { group, update, interact };
}
