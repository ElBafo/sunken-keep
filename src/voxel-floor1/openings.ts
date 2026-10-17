import * as THREE from 'three';
import { volumeFromImageData } from '../voxel-lab/classify';
import { makeToWorld, type FaceId } from '../voxel-lab/faces';
import { loadPng, pbrMap, voxelMaterial } from '../voxel-lab/materials';
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
  DOOR_CLOSE_MS,
  DOOR_OPEN_MS,
  DOOR_PANEL_INSET,
  DOOR_SLIDE,
  DOOR_UNLOCK_LEAD_MS,
  LAYER_SIZE,
  WALL_VARIANTS
} from './constants';
import { floor1Sconces, floor1Sunbeams } from './fixtures';
import {
  listDoors,
  listSecrets,
  openingViews,
  tileAt,
  type FloorMap,
  type FloorTile
} from './layout';
import { faceHash, pickVariant } from './variants';

const INSET: Record<'N' | 'E' | 'S' | 'W', [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0]
};

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

function offsetToWorld(
  base: (u: number, v: number, d: number) => [number, number, number],
  nx: number,
  nz: number,
  dist: number
): (u: number, v: number, d: number) => [number, number, number] {
  return (u, v, d) => {
    const p = base(u, v, d);
    return [p[0] + nx * dist, p[1], p[2] + nz * dist];
  };
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
    const to = opening ? DOOR_SLIDE : 0;
    visual.animFrom = from;
    visual.animTo = to;
    visual.animStart = now;
    visual.animDur = opening ? DOOR_OPEN_MS : DOOR_CLOSE_MS;
    visual.busy = true;
    if (visual.kind === 'door') {
      visual.tile.doorOpen = opening;
      if (opening) visual.tile.doorLocked = false;
    } else {
      visual.tile.secretOpen = opening;
    }
  }

  poseSlide(visual: OpeningVisual, t: number): void {
    const k = Math.min(1, Math.max(0, t));
    const y = DOOR_SLIDE * k;
    visual.busy = false;
    visual.animFrom = y;
    visual.animTo = y;
    if (visual.kind === 'door') visual.tile.doorOpen = k > 0;
    else visual.tile.secretOpen = k > 0;
    for (const panel of visual.panels) {
      panel.position.y = y;
      panel.visible = k < 0.99;
    }
  }

  snapOpen(visual: OpeningVisual, open: boolean): void {
    visual.busy = false;
    if (visual.kind === 'door') {
      visual.tile.doorOpen = open;
      if (open) visual.tile.doorLocked = false;
    } else {
      visual.tile.secretOpen = open;
    }
    const y = open ? DOOR_SLIDE : 0;
    for (const panel of visual.panels) {
      panel.position.y = y;
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
    this.startSlide(visual, !visual.tile.doorOpen, now);
    return 'toggled';
  }

  openSecret(x: number, y: number, now: number): boolean {
    const visual = this.get(x, y);
    if (!visual || visual.kind !== 'secret' || visual.tile.secretOpen || visual.busy) return false;
    this.startSlide(visual, true, now);
    return true;
  }

  finishUnlock(now: number): boolean {
    if (!this.pendingUnlock || now < this.unlockAt) return false;
    const { x, y } = this.pendingUnlock;
    this.pendingUnlock = null;
    const visual = this.get(x, y);
    if (visual) this.startSlide(visual, true, now);
    return true;
  }

  update(now: number): void {
    this.finishUnlock(now);
    for (const visual of this.openings.values()) {
      if (!visual.busy) continue;
      const t = Math.min(1, (now - visual.animStart) / visual.animDur);
      const opening = visual.animTo > visual.animFrom;
      const eased = opening ? 1 - (1 - t) * (1 - t) * (1 - t) : t * t * t;
      const y = visual.animFrom + (visual.animTo - visual.animFrom) * eased;
      for (const panel of visual.panels) {
        panel.position.y = y;
        panel.visible = y < CELL - 0.02;
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

  const wallFiles = [...WALL_VARIANTS];
  const pngs = await Promise.all([
    loadPng('door_panel.png'),
    loadPng('door_open.png'),
    ...wallFiles.map((file) => loadPng(file))
  ]);
  const panelPng = pngs[0];
  const framePng = pngs[1];
  const wallPngs = new Map<string, (typeof panelPng)>();
  wallFiles.forEach((file, i) => wallPngs.set(file, pngs[i + 2]));
  const panelVol = volumeFromImageData(panelPng.data);
  const frameVol = volumeFromImageData(framePng.data);
  const wallVols = new Map<string, ReturnType<typeof volumeFromImageData>>();
  for (const file of wallFiles) wallVols.set(file, volumeFromImageData(wallPngs.get(file)!.data));

  const makeMat = (png: typeof panelPng, vol: { roughness: Uint8Array; dims: [number, number, number] }) => {
    const mat = voxelMaterial(png.texture, pbrMap(vol.roughness, vol.dims[0], vol.dims[1]));
    mat.fog = true;
    if (!realLights) patchBakeMaterial(mat);
    return mat;
  };
  const panelMat = makeMat(panelPng, panelVol);
  const frameMat = makeMat(framePng, frameVol);
  const wallMats = new Map<string, THREE.MeshPhysicalMaterial>();
  for (const file of wallFiles) {
    wallMats.set(file, makeMat(wallPngs.get(file)!, wallVols.get(file)!));
  }
  system.bindLights(torches, beams, realLights, [panelMat, frameMat, ...wallMats.values()]);

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
    const [inx, inz] = INSET[face];
    const toWorld = makeToWorld(view.face, view.tx, view.tz, panelVol.dims, LAYER_SIZE, CELL, 'center');
    if (kind === 'door') {
      const frameGeo = meshVolume(
        frameVol.volume,
        frameVol.dims,
        toWorld,
        view.tx,
        view.tz,
        torches,
        beams,
        true
      );
      if (frameGeo) {
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.name = `door-frame:${visual.x},${visual.y}:${face}`;
        frame.castShadow = true;
        frame.receiveShadow = true;
        frame.frustumCulled = false;
        group.add(frame);
      }
      const panelWorld = offsetToWorld(toWorld, inx, inz, DOOR_PANEL_INSET);
      const panelGeo = meshVolume(panelVol.volume, panelVol.dims, panelWorld, view.tx, view.tz, torches, beams);
      if (panelGeo) {
        const slider = new THREE.Group();
        slider.name = `door-panel:${visual.x},${visual.y}:${face}`;
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.castShadow = true;
        panel.receiveShadow = true;
        panel.frustumCulled = false;
        slider.add(panel);
        slider.frustumCulled = false;
        group.add(slider);
        visual.panels.push(slider);
      }
      return;
    }
    const file = pickVariant(WALL_VARIANTS, view.wallX, view.wallY, view.wallFace);
    const src = wallVols.get(file)!;
    const png = wallPngs.get(file)!;
    const mat = wallMats.get(file)!;
    const tell = pickSecretTellTexels(png.data, faceHash(view.wallX, view.wallY, view.wallFace, 9));
    const volume = recessSecretTell(src.volume, src.dims, tell);
    const secretWorld = makeToWorld(view.face, view.tx, view.tz, src.dims, LAYER_SIZE, CELL, 'center');
    const secretGeo = meshVolume(volume, src.dims, secretWorld, view.tx, view.tz, torches, beams);
    if (secretGeo) {
      const slider = new THREE.Group();
      slider.name = `secret:${visual.x},${visual.y}:${face}`;
      const wall = new THREE.Mesh(secretGeo, mat);
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.frustumCulled = false;
      wall.userData.secretTell = tell.length;
      wall.userData.secretFile = file;
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

  return { group, system };
}
