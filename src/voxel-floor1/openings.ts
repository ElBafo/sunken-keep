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
  LAYER_SIZE
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

function meshVolume(
  volume: Uint8Array,
  dims: [number, number, number],
  toWorld: (u: number, v: number, d: number) => [number, number, number],
  tx: number,
  tz: number,
  torches: FarTorch[],
  beams: FarBeam[]
): THREE.BufferGeometry | null {
  const meshed = greedyMesh(volume, dims, toWorld);
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

  const [panelPng, framePng, secretPng] = await Promise.all([
    loadPng('door_panel.png'),
    loadPng('door_open.png'),
    loadPng('secret_closed.png')
  ]);
  const panelVol = volumeFromImageData(panelPng.data);
  const frameVol = volumeFromImageData(framePng.data);
  const secretVol = volumeFromImageData(secretPng.data);

  const makeMat = (png: typeof panelPng, vol: { roughness: Uint8Array; dims: [number, number, number] }) => {
    const mat = voxelMaterial(png.texture, pbrMap(vol.roughness, vol.dims[0], vol.dims[1]));
    mat.fog = true;
    if (!realLights) patchBakeMaterial(mat);
    return mat;
  };
  const panelMat = makeMat(panelPng, panelVol);
  const frameMat = makeMat(framePng, frameVol);
  const secretMat = makeMat(secretPng, secretVol);
  system.bindLights(torches, beams, realLights, [panelMat, frameMat, secretMat]);

  const addFace = (
    visual: OpeningVisual,
    view: { tx: number; tz: number; face: FaceId },
    kind: OpeningKind
  ): void => {
    const face = view.face as 'N' | 'E' | 'S' | 'W';
    const [inx, inz] = INSET[face];
    const toWorld = makeToWorld(view.face, view.tx, view.tz, panelVol.dims, LAYER_SIZE, CELL, 'center');
    if (kind === 'door') {
      const frameGeo = meshVolume(frameVol.volume, frameVol.dims, toWorld, view.tx, view.tz, torches, beams);
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
    } else {
      const secretGeo = meshVolume(
        secretVol.volume,
        secretVol.dims,
        toWorld,
        view.tx,
        view.tz,
        torches,
        beams
      );
      if (secretGeo) {
        const slider = new THREE.Group();
        slider.name = `secret:${visual.x},${visual.y}:${face}`;
        const wall = new THREE.Mesh(secretGeo, secretMat);
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.frustumCulled = false;
        slider.add(wall);
        slider.frustumCulled = false;
        group.add(slider);
        visual.panels.push(slider);
      }
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
