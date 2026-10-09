import * as THREE from 'three';
import {
  CELL_SIZE,
  CUTOUT_ALPHA_TEST,
  DOOR_CLOSE_MS,
  DOOR_OPEN_MS,
  DOOR_PANEL_INSET,
  DOOR_SLIDE,
  FACE_INTO_ROOM,
  FACE_SEGMENTS,
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
  /** Slider groups (lit backing + panel) that travel up into the lintel. */
  panels: THREE.Object3D[];
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

function makeDoorGeometry(): THREE.PlaneGeometry {
  // Same segment density as walls so vertex lighting bands match neighbouring faces.
  return new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE, FACE_SEGMENTS, FACE_SEGMENTS);
}

function doorMaterial(
  map: THREE.Texture,
  opts: { alphaTest: number; transparent: boolean }
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    color: 0xffffff,
    vertexColors: true,
    side: THREE.FrontSide,
    transparent: opts.transparent,
    alphaTest: opts.alphaTest,
    depthWrite: true,
    depthTest: true,
    fog: true,
    toneMapped: false
  });
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

    const slider = new THREE.Group();
    slider.userData.kind = 'door-slider';

    // Opaque fill behind the cutout, lit with the same vertex colours as the
    // panel / neighbouring walls so the door never drops to fog-black at 1 sq.
    const backing = new THREE.Mesh(makeDoorGeometry(), doorMaterial(panelTex, { alphaTest: 0, transparent: false }));
    backing.position.z = -DOOR_PANEL_INSET - 0.012;
    backing.userData.kind = 'door-backing';
    backing.userData.noPick = true;
    backing.userData.lightX = lightX;
    backing.userData.lightY = lightY;
    slider.add(backing);

    const panel = new THREE.Mesh(
      makeDoorGeometry(),
      doorMaterial(panelTex, { alphaTest: CUTOUT_ALPHA_TEST, transparent: false })
    );
    panel.position.z = -DOOR_PANEL_INSET;
    panel.renderOrder = 0;
    panel.userData.lightX = lightX;
    panel.userData.lightY = lightY;
    panel.userData.kind = 'door-panel';
    slider.add(panel);
    holder.add(slider);

    const frame = new THREE.Mesh(
      makeDoorGeometry(),
      doorMaterial(frameTex, { alphaTest: CUTOUT_ALPHA_TEST, transparent: false })
    );
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
    visual.panels.push(slider);
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
