import * as THREE from 'three';
import {
  CELL_SIZE,
  CUTOUT_ALPHA_TEST,
  DOOR_CLOSE_MS,
  DOOR_OPEN_MS,
  DOOR_PANEL_INSET,
  DOOR_SLIDE,
  FACE_INTO_ROOM,
  WALL_TOP
} from './constants';
import { Tile } from './types';

const DIRS: Record<string, { dx: number; dz: number }> = {
  N: { dx: 0, dz: -1 },
  E: { dx: 1, dz: 0 },
  S: { dx: 0, dz: 1 },
  W: { dx: -1, dz: 0 }
};

export interface DoorVisual {
  x: number;
  y: number;
  tile: Tile;
  panels: THREE.Mesh[];
  meshes: THREE.Object3D[];
  animStart: number;
  animFrom: number;
  animTo: number;
  animDur: number;
  busy: boolean;
}

function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

export class DoorSystem {
  private doors = new Map<string, DoorVisual>();

  get(x: number, y: number): DoorVisual | undefined {
    return this.doors.get(keyOf(x, y));
  }

  all(): DoorVisual[] {
    return [...this.doors.values()];
  }

  isOpen(x: number, y: number): boolean {
    return !!this.get(x, y)?.tile.doorOpen;
  }

  isBusy(x: number, y: number): boolean {
    return !!this.get(x, y)?.busy;
  }

  attachFace(
    group: THREE.Group,
    x: number,
    y: number,
    face: 'N' | 'E' | 'S' | 'W',
    tile: Tile,
    frameTex: THREE.Texture,
    panelTex: THREE.Texture,
    lightX: number,
    lightY: number
  ) {
    const wx = x * CELL_SIZE;
    const wz = y * CELL_SIZE;
    const { rotY } = FACE_INTO_ROOM[face];
    const { dx, dz } = DIRS[face];

    const holder = new THREE.Group();
    holder.position.set(wx + dx * (CELL_SIZE / 2), CELL_SIZE / 2, wz + dz * (CELL_SIZE / 2));
    holder.rotation.y = rotY;
    holder.userData.kind = 'door';
    holder.userData.lightX = lightX;
    holder.userData.lightY = lightY;

    const panelMat = new THREE.MeshBasicMaterial({
      map: panelTex,
      vertexColors: true,
      side: THREE.FrontSide,
      transparent: true,
      alphaTest: CUTOUT_ALPHA_TEST,
      depthWrite: true
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE), panelMat);
    panel.position.z = -DOOR_PANEL_INSET;
    panel.renderOrder = 0;
    panel.userData.lightX = lightX;
    panel.userData.lightY = lightY;
    panel.userData.kind = 'door-panel';
    holder.add(panel);

    const frameMat = new THREE.MeshBasicMaterial({
      map: frameTex,
      vertexColors: true,
      side: THREE.FrontSide,
      transparent: true,
      alphaTest: CUTOUT_ALPHA_TEST,
      depthWrite: true
    });
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE), frameMat);
    frame.position.z = 0;
    frame.renderOrder = 1;
    frame.userData.lightX = lightX;
    frame.userData.lightY = lightY;
    frame.userData.kind = 'door-frame';
    holder.add(frame);

    group.add(holder);

    const k = keyOf(x, y);
    let visual = this.doors.get(k);
    if (!visual) {
      visual = {
        x,
        y,
        tile,
        panels: [],
        meshes: [],
        animStart: 0,
        animFrom: 0,
        animTo: 0,
        animDur: DOOR_OPEN_MS,
        busy: false
      };
      this.doors.set(k, visual);
    }
    visual.panels.push(panel);
    visual.meshes.push(holder);
    if (tile.doorOpen) {
      for (const p of visual.panels) p.position.y = DOOR_SLIDE;
    }
  }

  startSlide(visual: DoorVisual, opening: boolean, now: number) {
    const from = visual.panels[0]?.position.y ?? 0;
    const to = opening ? DOOR_SLIDE : 0;
    visual.animFrom = from;
    visual.animTo = to;
    visual.animStart = now;
    visual.animDur = opening ? DOOR_OPEN_MS : DOOR_CLOSE_MS;
    visual.busy = true;
    visual.tile.doorOpen = opening;
    if (opening) visual.tile.doorLocked = false;
  }

  snapOpen(visual: DoorVisual, open: boolean) {
    visual.busy = false;
    visual.tile.doorOpen = open;
    if (open) visual.tile.doorLocked = false;
    const y = open ? DOOR_SLIDE : 0;
    for (const p of visual.panels) p.position.y = y;
  }

  update(now: number) {
    for (const visual of this.doors.values()) {
      if (!visual.busy) continue;
      const t = Math.min(1, (now - visual.animStart) / visual.animDur);
      const opening = visual.animTo > visual.animFrom;
      const eased = opening ? 1 - (1 - t) * (1 - t) * (1 - t) : t * t * t;
      const y = visual.animFrom + (visual.animTo - visual.animFrom) * eased;
      for (const p of visual.panels) {
        p.position.y = y;
        // Hide above the arch so the lintel fully occludes the last sliver.
        p.visible = y < WALL_TOP - 0.02;
      }
      if (t >= 1) {
        visual.busy = false;
        const open = visual.animTo > 0;
        for (const p of visual.panels) {
          p.position.y = visual.animTo;
          p.visible = !open;
        }
      }
    }
  }
}
