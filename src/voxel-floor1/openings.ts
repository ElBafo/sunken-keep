import * as THREE from 'three';
import { volumeFromImageData } from '../voxel-lab/classify';
import { makeToWorld, tileCorner, type FaceId } from '../voxel-lab/faces';
import { loadPng, pbrMap, textureFromPixels, voxelMaterial } from '../voxel-lab/materials';
import { greedyMesh } from '../voxel-lab/mesher';
import {
  geometryWithBake,
  litFarBeams,
  litFarTorches,
  patchBakeMaterial,
  setBakeBlends,
  type FarBeam,
  type FarTorch
} from './bake';
import {
  CELL,
  CORNICE_HEIGHT,
  DOOR_CLOSE_MS,
  DOOR_LAYERS,
  DOOR_LEAF_MS,
  DOOR_LEAF_SLIDE,
  DOOR_OPEN_MS,
  DOOR_SLIDE,
  DOOR_UNLOCK_LEAD_MS,
  DOOR_WALL_HALF,
  LAYER_SIZE
} from './constants';
import { projectArchOpeningUvs } from './uv-audit';
import {
  ageDoorPanelPixels,
  doorOpeningStyle,
  leafMeshes,
  padlockIronPixels,
  openingPunchRect,
  openingSlabMeshes,
  punchOpening,
  type DoorOpeningStyle
} from './door-opening';
import { floor1Sconces, floor1Sunbeams } from './fixtures';
import {
  doorEdgeAt,
  listDoors,
  listSecrets,
  openingViews,
  tileAt,
  type FloorMap,
  type FloorTile
} from './layout';
import { faceHash } from './variants';
import { lookPixels } from './wall-once';
import {
  FLOOR1_WALL_FILES,
  applyUOffset,
  faceUOffset,
  familyBaseFile,
  finishVolume,
  lookForSecret,
  lookForZoneBase,
  warnMissingWallTexture,
  type WallLook
} from './wall-look';

export type OpeningKind = 'door' | 'secret';

export type OpeningVisual = {
  x: number;
  y: number;
  kind: OpeningKind;
  tile: FloorTile;
  panels: THREE.Object3D[];
  animStart: number;
  animFrom: number;
  animTo: number;
  animDur: number;
  busy: boolean;
};

export type DoorResult = 'none' | 'busy' | 'locked' | 'unlocking' | 'toggled';

function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

const MORTAR_LUMA = 30 / 255;

type PixelImage = { width: number; height: number; data: ArrayLike<number> };

function pixelLuma(image: PixelImage, x: number, y: number): number {
  const i = (y * image.width + x) * 4;
  const r = image.data[i];
  const g = image.data[i + 1];
  const b = image.data[i + 2];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * One field brick (not the frieze, quoins, or plinth). Used as the secret-wall tell.
 * Returns voxel (u, v) with v=0 at the floor.
 */
export function pickSecretTellTexels(image: PixelImage, seed: number): Array<[number, number]> {
  const W = image.width;
  const H = image.height;
  const seen = new Uint8Array(W * H);
  const bricks: Array<{ area: number; cx: number; cy: number; texels: Array<[number, number]> }> = [];
  const dirs: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const start = px + py * W;
      if (seen[start] || pixelLuma(image, px, py) < MORTAR_LUMA) continue;
      const stack = [start];
      seen[start] = 1;
      const texels: Array<[number, number]> = [];
      let sx = 0;
      let sy = 0;
      let minx = px;
      let maxx = px;
      let miny = py;
      let maxy = py;
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % W;
        const y = (i / W) | 0;
        texels.push([x, H - 1 - y]);
        sx += x;
        sy += y;
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = nx + ny * W;
          if (seen[ni] || pixelLuma(image, nx, ny) < MORTAR_LUMA) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      const area = texels.length;
      if (area < 80 || area > 250) continue;
      if (minx <= 8 || maxx >= W - 9) continue;
      if (miny < 24 || maxy > 98) continue;
      bricks.push({ area, cx: sx / area, cy: sy / area, texels });
    }
  }
  if (!bricks.length) return [];
  bricks.sort((a, b) => a.cx + a.cy * 10 - (b.cx + b.cy * 10));
  return bricks[seed % bricks.length].texels;
}

/** Pull one brick back by a single depth layer (1 texel of wall relief). */
export function recessSecretTell(
  volume: Uint8Array,
  dims: [number, number, number],
  texels: Array<[number, number]>
): Uint8Array {
  const out = new Uint8Array(volume);
  const [W, H, D] = dims;
  const slice = W * H;
  for (const [u, v] of texels) {
    if (u < 0 || v < 0 || u >= W || v >= H) continue;
    let maxK = -1;
    for (let k = D - 1; k >= 0; k--) {
      if (out[u + v * W + k * slice]) {
        maxK = k;
        break;
      }
    }
    if (maxK >= 1) out[u + v * W + maxK * slice] = 0;
  }
  return out;
}

/** Empty texels of the painted doorway void, ignoring thin mortar cracks. */
export function openingHoleMask(opening: Uint8Array, dims: [number, number, number]): Uint8Array {
  const [W, H, D] = dims;
  const slice = W * H;
  const empty = new Uint8Array(slice);
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      let solid = false;
      for (let d = 0; d < D; d++) {
        if (opening[u + v * W + d * slice]) {
          solid = true;
          break;
        }
      }
      empty[u + v * W] = solid ? 0 : 1;
    }
  }
  const erode = Math.min(W, H) < 8 ? 0 : Math.max(1, Math.round(Math.min(W, H) / 32));
  const interior = new Uint8Array(slice);
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      let keep = 1;
      for (let dy = -erode; dy <= erode && keep; dy++) {
        const y = v + dy;
        if (y < 0 || y >= H) {
          keep = 0;
          break;
        }
        for (let dx = -erode; dx <= erode; dx++) {
          const x = u + dx;
          if (x < 0 || x >= W || !empty[x + y * W]) {
            keep = 0;
            break;
          }
        }
      }
      interior[u + v * W] = keep;
    }
  }
  const core = new Uint8Array(slice);
  const stack: number[] = [];
  const seeds: Array<[number, number]> = [
    [W >> 1, H >> 1],
    [W >> 1, ((H * 2) / 3) | 0],
    [W >> 1, ((H * 3) / 4) | 0]
  ];
  for (const [su, sv] of seeds) {
    const i = su + sv * W;
    if (interior[i]) stack.push(i);
  }
  if (!stack.length) {
    for (let i = 0; i < slice; i++) {
      if (interior[i]) {
        stack.push(i);
        break;
      }
    }
  }
  const dirs: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  while (stack.length) {
    const i = stack.pop()!;
    if (core[i] || !interior[i]) continue;
    core[i] = 1;
    const u = i % W;
    const v = (i / W) | 0;
    for (const [dx, dy] of dirs) {
      const nu = u + dx;
      const nv = v + dy;
      if (nu < 0 || nv < 0 || nu >= W || nv >= H) continue;
      const ni = nu + nv * W;
      if (!core[ni] && interior[ni]) stack.push(ni);
    }
  }
  const hole = new Uint8Array(slice);
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      if (!core[u + v * W]) continue;
      for (let dy = -erode; dy <= erode; dy++) {
        const y = v + dy;
        if (y < 0 || y >= H) continue;
        for (let dx = -erode; dx <= erode; dx++) {
          const x = u + dx;
          if (x < 0 || x >= W) continue;
          if (empty[x + y * W]) hole[x + y * W] = 1;
        }
      }
    }
  }
  return hole;
}

/** Keep family-base stone, cutting only the painted doorway void. */
export function maskVolumeWithOpening(
  wall: Uint8Array,
  wallDims: [number, number, number],
  opening: Uint8Array,
  openingDims: [number, number, number]
): Uint8Array {
  const [wW, wH, wD] = wallDims;
  const hole = openingHoleMask(opening, openingDims);
  const [oW, oH] = openingDims;
  const out = new Uint8Array(wall);
  const wSlice = wW * wH;
  for (let v = 0; v < wH; v++) {
    for (let u = 0; u < wW; u++) {
      const ou = Math.min(oW - 1, Math.floor((u * oW) / wW));
      const ov = Math.min(oH - 1, Math.floor((v * oH) / wH));
      if (!hole[ou + ov * oW]) continue;
      for (let d = 0; d < wD; d++) out[u + v * wW + d * wSlice] = 0;
    }
  }
  return out;
}

function shiftFaceU(geo: THREE.BufferGeometry, face: string, tx: number, tz: number): void {
  const uv = geo.getAttribute('uv');
  if (!uv) return;
  applyUOffset(uv.array as unknown as number[], faceUOffset(face, tx, tz));
  uv.needsUpdate = true;
}

/** Solid stone through the reveal; keep the painted relief on the room-side layers. */
export function solidifyArchVolume(
  wall: Uint8Array,
  dims: [number, number, number],
  newD = DOOR_LAYERS
): { volume: Uint8Array; dims: [number, number, number] } {
  const [W, H, D] = dims;
  const slice = W * H;
  const out = new Uint8Array(W * H * newD);
  const back = Math.max(0, newD - D);
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      let solid = false;
      for (let d = 0; d < D; d++) {
        if (wall[u + v * W + d * slice]) {
          solid = true;
          break;
        }
      }
      if (!solid) continue;
      for (let d = 0; d < back; d++) out[u + v * W + d * slice] = 1;
      for (let d = 0; d < D && back + d < newD; d++) {
        if (wall[u + v * W + d * slice]) out[u + v * W + (back + d) * slice] = 1;
      }
    }
  }
  return { volume: out, dims: [W, H, newD] };
}

/**
 * d=0 is the shared cell edge. d=D is the room-side face of the 15 cm
 * doorway half-wall.
 */
export function makeArchToWorld(
  face: FaceId,
  tileX: number,
  tileZ: number,
  dims: [number, number, number],
  cell = CELL
): (u: number, v: number, d: number) => [number, number, number] {
  const [W, H, D] = dims;
  const sx = cell / W;
  const sy = cell / H;
  const layer = DOOR_WALL_HALF / Math.max(1, D);
  const { ox, oz } = tileCorner(tileX, tileZ, cell, 'center');
  switch (face) {
    case 'N':
      return (u, v, d) => [ox + u * sx, v * sy, oz + d * layer];
    case 'S':
      return (u, v, d) => [ox + cell - u * sx, v * sy, oz + cell - d * layer];
    case 'W':
      return (u, v, d) => [ox + d * layer, v * sy, oz + cell - u * sx];
    case 'E':
      return (u, v, d) => [ox + cell - d * layer, v * sy, oz + u * sx];
    default:
      return makeToWorld(face, tileX, tileZ, dims, LAYER_SIZE, cell, 'center');
  }
}

/** Punch a rectangular plate, add style slabs, project UVs. Used by the density audit. */
export function meshArchOpening(
  wall: Uint8Array,
  wallDims: [number, number, number],
  _opening: Uint8Array,
  _openingDims: [number, number, number],
  face: 'N' | 'E' | 'S' | 'W',
  tx: number,
  tz: number,
  style: DoorOpeningStyle = 'lintel'
): { positions: number[]; normals: number[]; uvs: number[]; quads: number } {
  return meshDoorOpening(wall, wallDims, face, tx, tz, style);
}

export function meshDoorOpening(
  wall: Uint8Array,
  wallDims: [number, number, number],
  face: 'N' | 'E' | 'S' | 'W',
  tx: number,
  tz: number,
  style: DoorOpeningStyle
): { positions: number[]; normals: number[]; uvs: number[]; quads: number } {
  const punched = punchOpening(wall, wallDims, style);
  const solid = solidifyArchVolume(punched, wallDims, DOOR_LAYERS);
  const plateWorld = makeArchToWorld(face, tx, tz, solid.dims);
  const plate = greedyMesh(solid.volume, solid.dims, plateWorld, { cullNeg: [false, false, false] });
  const uvs = plate.mesh.uvs.slice();
  projectArchOpeningUvs(
    plate.mesh.positions,
    plate.mesh.normals,
    uvs,
    face,
    CELL,
    faceUOffset(face, tx, tz)
  );
  const positions = plate.mesh.positions.slice();
  const normals = plate.mesh.normals.slice();
  const slabs = openingSlabMeshes(style, face, tx, tz);
  for (const slab of [slabs.stone, slabs.lintel]) {
    positions.push(...slab.positions);
    normals.push(...slab.normals);
    uvs.push(...slab.uvs);
  }
  return {
    positions,
    normals,
    uvs,
    quads: (positions.length / 3 / 4) | 0
  };
}

/** Axis-aligned doorway void. No circular soffit — curves read as thin stones at phone res. */
export function makeArchHoleMask(W: number, H: number): Uint8Array {
  const hole = new Uint8Array(W * H);
  const rect = openingPunchRect('lintel');
  const u0 = Math.floor((rect.u0 / CELL) * W);
  const u1 = Math.ceil((rect.u1 / CELL) * W);
  const v1 = Math.ceil((rect.v1 / CELL) * H);
  for (let v = 0; v < v1; v++) {
    for (let u = u0; u < u1; u++) {
      hole[u + v * W] = 1;
    }
  }
  return hole;
}

export function holeMaskToVolume(mask: Uint8Array, W: number, H: number, D: number): Uint8Array {
  const volume = new Uint8Array(W * H * D);
  const slice = W * H;
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      if (mask[u + v * W]) continue;
      for (let d = 0; d < D; d++) volume[u + v * W + d * slice] = 1;
    }
  }
  return volume;
}

function meshVolume(
  volume: Uint8Array,
  dims: [number, number, number],
  toWorld: (u: number, v: number, d: number) => [number, number, number],
  tx: number,
  tz: number,
  torches: FarTorch[],
  beams: FarBeam[],
  keepBack = false
): THREE.BufferGeometry | null {
  const meshed = greedyMesh(
    volume,
    dims,
    toWorld,
    keepBack ? { cullNeg: [false, false, false] } : undefined
  );
  return geometryWithBake([{ mesh: meshed.mesh, tx, tz }], torches, beams);
}

export class OpeningSystem {
  private openings = new Map<string, OpeningVisual>();
  private mats: THREE.Material[] = [];
  private torches: FarTorch[] = [];
  private beams: FarBeam[] = [];
  private realLights = false;
  pendingUnlock: { x: number; y: number } | null = null;
  unlockAt = 0;

  get(x: number, y: number): OpeningVisual | undefined {
    return this.openings.get(keyOf(x, y));
  }

  all(): OpeningVisual[] {
    return [...this.openings.values()];
  }

  isOpen(x: number, y: number): boolean {
    const row = this.get(x, y);
    if (!row) return false;
    return row.kind === 'door' ? !!row.tile.doorOpen : !!row.tile.secretOpen;
  }

  isBusy(x: number, y: number): boolean {
    return !!this.get(x, y)?.busy;
  }

  isLocked(x: number, y: number): boolean {
    const row = this.get(x, y);
    return !!row && row.kind === 'door' && !!row.tile.doorLocked && !row.tile.doorOpen;
  }

  register(visual: OpeningVisual): void {
    this.openings.set(keyOf(visual.x, visual.y), visual);
  }

  startSlide(visual: OpeningVisual, opening: boolean, now: number): void {
    const from = visual.panels[0]?.position.y ?? 0;
    const door = visual.kind === 'door';
    const to = opening ? (door ? DOOR_LEAF_SLIDE : DOOR_SLIDE) : 0;
    visual.animFrom = from;
    visual.animTo = to;
    visual.animStart = now;
    visual.animDur = door ? DOOR_LEAF_MS : opening ? DOOR_OPEN_MS : DOOR_CLOSE_MS;
    visual.busy = true;
    if (door) {
      visual.tile.doorOpen = opening;
      if (opening) visual.tile.doorLocked = false;
    } else {
      visual.tile.secretOpen = opening;
    }
  }

  startOpen(visual: OpeningVisual, opening: boolean, now: number): void {
    this.startSlide(visual, opening, now);
  }

  poseSlide(visual: OpeningVisual, t: number): void {
    const k = Math.min(1, Math.max(0, t));
    const door = visual.kind === 'door';
    const y = (door ? DOOR_LEAF_SLIDE : DOOR_SLIDE) * k;
    visual.busy = false;
    visual.animFrom = y;
    visual.animTo = y;
    if (door) {
      visual.tile.doorOpen = k > 0;
      if (k > 0) visual.tile.doorLocked = false;
    } else {
      visual.tile.secretOpen = k > 0;
    }
    for (const panel of visual.panels) {
      panel.position.y = y;
      panel.rotation.y = 0;
      panel.visible = door ? k < 0.99 : k < 0.99;
    }
  }

  poseOpen(visual: OpeningVisual, t: number): void {
    this.poseSlide(visual, t);
  }

  snapOpen(visual: OpeningVisual, open: boolean): void {
    visual.busy = false;
    const door = visual.kind === 'door';
    if (door) {
      visual.tile.doorOpen = open;
      if (open) visual.tile.doorLocked = false;
    } else {
      visual.tile.secretOpen = open;
    }
    const y = open ? (door ? DOOR_LEAF_SLIDE : DOOR_SLIDE) : 0;
    visual.animFrom = y;
    visual.animTo = y;
    for (const panel of visual.panels) {
      panel.position.y = y;
      panel.rotation.y = 0;
      panel.visible = !open;
    }
  }

  tryDoor(x: number, y: number, hasKey: boolean, now: number): DoorResult {
    const visual = this.get(x, y);
    if (!visual || visual.kind !== 'door') return 'none';
    if (visual.busy || this.pendingUnlock) return 'busy';
    if (visual.tile.doorLocked && !visual.tile.doorOpen) {
      if (!hasKey) return 'locked';
      visual.tile.doorLocked = false;
      this.pendingUnlock = { x, y };
      this.unlockAt = now + DOOR_UNLOCK_LEAD_MS;
      return 'unlocking';
    }
    this.startOpen(visual, !visual.tile.doorOpen, now);
    return 'toggled';
  }

  openSecret(x: number, y: number, now: number): boolean {
    const visual = this.get(x, y);
    if (!visual || visual.kind !== 'secret' || visual.tile.secretOpen || visual.busy) return false;
    this.startOpen(visual, true, now);
    return true;
  }

  finishUnlock(now: number): boolean {
    if (!this.pendingUnlock || now < this.unlockAt) return false;
    const { x, y } = this.pendingUnlock;
    this.pendingUnlock = null;
    const visual = this.get(x, y);
    if (visual) this.startOpen(visual, true, now);
    return true;
  }

  update(now: number): void {
    this.finishUnlock(now);
    for (const visual of this.openings.values()) {
      if (!visual.busy) continue;
      const t = Math.min(1, (now - visual.animStart) / visual.animDur);
      const opening = visual.animTo > visual.animFrom;
      const eased = opening ? 1 - (1 - t) * (1 - t) * (1 - t) : t * t * t;
      const value = visual.animFrom + (visual.animTo - visual.animFrom) * eased;
      const door = visual.kind === 'door';
      for (const panel of visual.panels) {
        panel.position.y = value;
        panel.rotation.y = 0;
        panel.visible = door ? value < DOOR_LEAF_SLIDE - 0.02 : value < CELL - 0.02;
      }
      if (t >= 1) {
        visual.busy = false;
        const open = visual.animTo > 0;
        for (const panel of visual.panels) {
          panel.position.y = visual.animTo;
          panel.visible = !open;
        }
      }
    }
  }

  setBakeBlends(blends: Map<string, number>, flick = 1): void {
    setBakeBlends(
      this.mats,
      this.torches,
      blends,
      flick,
      this.beams,
      this.realLights ? 'off' : 'complement'
    );
  }

  bindLights(torches: FarTorch[], beams: FarBeam[], realLights: boolean, mats: THREE.Material[]): void {
    this.torches = torches;
    this.beams = beams;
    this.realLights = realLights;
    this.mats = mats;
  }
}

export async function buildFloor1Openings(
  map: FloorMap,
  realLights: boolean
): Promise<{ group: THREE.Group; system: OpeningSystem }> {
  const group = new THREE.Group();
  group.name = 'floor1-openings';
  const system = new OpeningSystem();
  const torches = litFarTorches(map, floor1Sconces);
  const beams = litFarBeams(map, floor1Sunbeams);

  const wallFiles = [...FLOOR1_WALL_FILES];
  const pngs = await Promise.all([
    loadPng('ceiling_planks_1.png'),
    loadPng('door_panel_aged.png'),
    ...wallFiles.map((file) => loadPng(file))
  ]);
  const plankPng = pngs[0];
  const doorPng = pngs[1];
  const wallPngs = new Map<string, (typeof plankPng)>();
  wallFiles.forEach((file, i) => wallPngs.set(file, pngs[i + 2]));
  plankPng.texture.wrapS = THREE.RepeatWrapping;
  plankPng.texture.wrapT = THREE.RepeatWrapping;

  const makeMat = (png: { texture: THREE.Texture }, vol: { roughness: Uint8Array; dims: [number, number, number] }) => {
    const mat = voxelMaterial(png.texture, pbrMap(vol.roughness, vol.dims[0], vol.dims[1]));
    mat.fog = true;
    if (!realLights) patchBakeMaterial(mat);
    return mat;
  };
  const agedDoor = {
    width: doorPng.data.width,
    height: doorPng.data.height,
    data: ageDoorPanelPixels(doorPng.data.data, doorPng.data.width, doorPng.data.height)
  };
  const doorTex = textureFromPixels(agedDoor);
  doorTex.wrapS = THREE.ClampToEdgeWrapping;
  doorTex.wrapT = THREE.ClampToEdgeWrapping;
  const corniceY = CELL - CORNICE_HEIGHT;
  const leafClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), corniceY);
  const woodMat = new THREE.MeshPhysicalMaterial({
    map: doorTex,
    color: new THREE.Color(1, 1, 1),
    roughness: 1,
    metalness: 0,
    clearcoat: 0,
    sheen: 0,
    specularIntensity: 0,
    envMapIntensity: 0,
    clippingPlanes: [leafClip]
  });
  woodMat.name = 'door_panel_aged';
  woodMat.fog = true;
  if (!realLights) patchBakeMaterial(woodMat);
  const ironMatFor = (kind: 'body' | 'shackle', name: string): THREE.MeshPhysicalMaterial => {
    const map = textureFromPixels({ width: 8, height: 8, data: padlockIronPixels(kind, 8) });
    const mat = new THREE.MeshPhysicalMaterial({
      map,
      color: new THREE.Color(1, 1, 1),
      roughness: 1,
      metalness: 0,
      clearcoat: 0,
      sheen: 0,
      specularIntensity: 0,
      envMapIntensity: 0,
      clippingPlanes: [leafClip]
    });
    mat.name = name;
    mat.fog = true;
    if (!realLights) patchBakeMaterial(mat);
    return mat;
  };
  const ironMat = ironMatFor('body', 'door_padlock_iron');
  const shackleMat = ironMatFor('shackle', 'door_padlock_shackle');
  const secretMats = new Map<string, THREE.MeshPhysicalMaterial>();
  const surroundMats = new Map<string, THREE.MeshPhysicalMaterial>();
  const lintelMats: THREE.MeshPhysicalMaterial[] = [];
  const secretMat = (
    look: WallLook,
    png: { texture: THREE.Texture },
    src: ReturnType<typeof volumeFromImageData>
  ) => {
    const hit = secretMats.get(look.key);
    if (hit) return hit;
    png.texture.wrapS = THREE.RepeatWrapping;
    png.texture.wrapT = THREE.RepeatWrapping;
    const mat = makeMat(png, src);
    secretMats.set(look.key, mat);
    return mat;
  };
  const wallPngOrFamilyBase = (look: WallLook, at: string) => {
    const hit = wallPngs.get(look.file);
    if (hit) return hit;
    const fallback = familyBaseFile(look.kind);
    warnMissingWallTexture(look.file, fallback, at);
    return wallPngs.get(fallback);
  };

  const surroundMat = (look: WallLook) => {
    const hit = surroundMats.get(look.key);
    if (hit) return hit;
    const png = wallPngOrFamilyBase(look, `door-surround:${look.file}`);
    if (!png) return null;
    png.texture.wrapS = THREE.RepeatWrapping;
    png.texture.wrapT = THREE.RepeatWrapping;
    const src = volumeFromImageData(png.data);
    finishVolume(src, look);
    const mat = makeMat(png, src);
    mat.name = look.file;
    surroundMats.set(look.key, mat);
    return mat;
  };

  const addFace = (
    visual: OpeningVisual,
    view: {
      tx: number;
      tz: number;
      face: FaceId;
      wallX: number;
      wallY: number;
      wallFace: 'N' | 'E' | 'S' | 'W';
    },
    kind: OpeningKind
  ): void => {
    const face = view.face as 'N' | 'E' | 'S' | 'W';
    if (kind === 'door') {
      const style = doorOpeningStyle(visual.x, visual.y);
      const surround = lookForZoneBase(view.tx, view.tz);
      const wallPng = wallPngOrFamilyBase(surround, `door-frame:${visual.x},${visual.y}:${face}`);
      const mat = surroundMat(surround);
      if (wallPng && mat) {
        const wallSrc = volumeFromImageData(wallPng.data);
        finishVolume(wallSrc, surround);
        const punched = punchOpening(wallSrc.volume, wallSrc.dims, style);
        const solid = solidifyArchVolume(punched, wallSrc.dims, DOOR_LAYERS);
        const plateWorld = makeArchToWorld(view.face, view.tx, view.tz, solid.dims);
        const plate = greedyMesh(solid.volume, solid.dims, plateWorld, { cullNeg: [false, false, false] });
        projectArchOpeningUvs(
          plate.mesh.positions,
          plate.mesh.normals,
          plate.mesh.uvs,
          face,
          CELL,
          faceUOffset(face, view.tx, view.tz)
        );
        const slabs = openingSlabMeshes(style, face, view.tx, view.tz);
        const items = [{ mesh: plate.mesh, tx: view.tx, tz: view.tz }];
        if (slabs.stone.positions.length) items.push({ mesh: slabs.stone, tx: view.tx, tz: view.tz });
        const frameGeo = geometryWithBake(items, torches, beams);
        if (frameGeo) {
          const frame = new THREE.Mesh(frameGeo, mat);
          frame.name = `door-frame:${visual.x},${visual.y}:${face}`;
          frame.userData.surroundFile = surround.file;
          frame.userData.surroundLook = surround.key;
          frame.userData.doorStyle = style;
          frame.castShadow = true;
          frame.receiveShadow = true;
          frame.frustumCulled = false;
          group.add(frame);
        }
        if (slabs.lintel.positions.length) {
          const lintelGeo = geometryWithBake([{ mesh: slabs.lintel, tx: view.tx, tz: view.tz }], torches, beams);
          if (lintelGeo) {
            const lintelMat = mat.clone();
            lintelMat.color.setRGB(0.9, 0.88, 0.84);
            if (!realLights) patchBakeMaterial(lintelMat);
            lintelMats.push(lintelMat);
            const lintel = new THREE.Mesh(lintelGeo, lintelMat);
            lintel.name = `door-lintel:${visual.x},${visual.y}:${face}`;
            lintel.castShadow = true;
            lintel.receiveShadow = true;
            lintel.frustumCulled = false;
            group.add(lintel);
          }
        }
      }
      const host = doorEdgeAt(visual.x, visual.y);
      const hostView = !!host && view.tx === host.x && view.tz === host.y && view.face === host.face;
      if (!hostView) return;
      const leaf = leafMeshes(style, face, view.tx, view.tz);
      if (leaf.wood.positions.length) {
        const woodGeo = geometryWithBake([{ mesh: leaf.wood, tx: view.tx, tz: view.tz }], torches, beams);
        const slider = new THREE.Group();
        slider.name = `door-panel:${visual.x},${visual.y}:${face}`;
        slider.userData.door = { x: visual.x, y: visual.y };
        slider.userData.doorLeaf = true;
        if (woodGeo) {
          const panel = new THREE.Mesh(woodGeo, woodMat);
          panel.name = `door-wood:${visual.x},${visual.y}:${face}`;
          panel.castShadow = true;
          panel.receiveShadow = true;
          panel.frustumCulled = false;
          panel.userData.door = { x: visual.x, y: visual.y };
          panel.userData.doorLeaf = true;
          slider.add(panel);
        }
        if (leaf.iron.positions.length) {
          const ironGeo = geometryWithBake([{ mesh: leaf.iron, tx: view.tx, tz: view.tz }], torches, beams);
          if (ironGeo) {
            const lock = new THREE.Mesh(ironGeo, ironMat);
            lock.name = `door-lock:${visual.x},${visual.y}:${face}`;
            lock.castShadow = true;
            lock.receiveShadow = true;
            lock.frustumCulled = false;
            lock.userData.door = { x: visual.x, y: visual.y };
            lock.userData.doorLeaf = true;
            lock.userData.padlock = true;
            slider.add(lock);
          }
        }
        if (leaf.shackle.positions.length) {
          const shackleGeo = geometryWithBake(
            [{ mesh: leaf.shackle, tx: view.tx, tz: view.tz }],
            torches,
            beams
          );
          if (shackleGeo) {
            const shackle = new THREE.Mesh(shackleGeo, shackleMat);
            shackle.name = `door-lock-shackle:${visual.x},${visual.y}:${face}`;
            shackle.castShadow = true;
            shackle.receiveShadow = true;
            shackle.frustumCulled = false;
            shackle.userData.doorLeaf = true;
            shackle.userData.padlock = true;
            slider.add(shackle);
          }
        }
        slider.frustumCulled = false;
        group.add(slider);
        visual.panels.push(slider);
      }
      return;
    }
    const look = lookForSecret(view.wallX, view.wallY, view.wallFace, view.tx, view.tz);
    const png = wallPngOrFamilyBase(look, `secret:${visual.x},${visual.y}:${face}`);
    if (!png) return;
    const pixels = lookPixels(look.file, wallPngs, look.once, look.baseFile);
    const src = volumeFromImageData(pixels);
    finishVolume(src, look);
    const mat = secretMat(look, look.once ? { texture: textureFromPixels(pixels) } : png, src);
    const tell = pickSecretTellTexels(pixels, faceHash(view.wallX, view.wallY, view.wallFace, 9));
    const volume = recessSecretTell(src.volume, src.dims, tell);
    const secretWorld = makeToWorld(view.face, view.tx, view.tz, src.dims, LAYER_SIZE, CELL, 'center');
    const secretGeo = meshVolume(volume, src.dims, secretWorld, view.tx, view.tz, torches, beams);
    if (secretGeo) {
      shiftFaceU(secretGeo, face, view.tx, view.tz);
      const slider = new THREE.Group();
      slider.name = `secret:${visual.x},${visual.y}:${face}`;
      const wall = new THREE.Mesh(secretGeo, mat);
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.frustumCulled = false;
      wall.userData.secretTell = tell.length;
      wall.userData.secretFile = look.key;
      wall.userData.secretLook = look.key;
      slider.add(wall);
      slider.frustumCulled = false;
      group.add(slider);
      visual.panels.push(slider);
    }
  };

  for (const spec of listDoors(map)) {
    const tile = tileAt(map, spec.x, spec.y)!;
    const visual: OpeningVisual = {
      x: spec.x,
      y: spec.y,
      kind: 'door',
      tile,
      panels: [],
      animStart: 0,
      animFrom: 0,
      animTo: 0,
      animDur: DOOR_OPEN_MS,
      busy: false
    };
    for (const view of openingViews(map, spec.x, spec.y)) addFace(visual, view, 'door');
    if (tile.doorOpen) system.snapOpen(visual, true);
    system.register(visual);
  }

  for (const spec of listSecrets(map)) {
    const tile = tileAt(map, spec.x, spec.y)!;
    const visual: OpeningVisual = {
      x: spec.x,
      y: spec.y,
      kind: 'secret',
      tile,
      panels: [],
      animStart: 0,
      animFrom: 0,
      animTo: 0,
      animDur: DOOR_OPEN_MS,
      busy: false
    };
    for (const view of openingViews(map, spec.x, spec.y)) addFace(visual, view, 'secret');
    if (tile.secretOpen) system.snapOpen(visual, true);
    system.register(visual);
  }

  system.bindLights(torches, beams, realLights, [
    woodMat,
    ironMat,
    shackleMat,
    ...secretMats.values(),
    ...surroundMats.values(),
    ...lintelMats
  ]);

  return { group, system };
}
