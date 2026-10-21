import * as THREE from 'three';
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import {
  ARCH_FRONT,
  CELL,
  DOOR_CLOSE_MS,
  DOOR_OPEN_MS,
  DOOR_SLIDE,
  DOOR_LEAF_MS,
  DOOR_LEAF_SLIDE,
  DOOR_UNLOCK_LEAD_MS
} from '../src/voxel-floor1/constants';
import { ageDoorPanelPixels, LEAF_MAX_LUMA, lintelTop } from '../src/voxel-floor1/door-opening';
import { greedyMesh } from '../src/voxel-lab/mesher';
import {
  OpeningSystem,
  makeArchToWorld,
  maskVolumeWithOpening,
  pickSecretTellTexels,
  recessSecretTell,
  solidifyArchVolume,
  type OpeningVisual
} from '../src/voxel-floor1/openings';
import { floor1Map, openingViews, resetFloor1Doors, tileAt } from '../src/voxel-floor1/layout';
import { lookForSecret } from '../src/voxel-floor1/wall-look';

function fakeDoor(locked: boolean): OpeningVisual {
  const tile = tileAt(floor1Map, 4, 2)!;
  tile.doorLocked = locked;
  tile.doorOpen = false;
  return {
    x: 4,
    y: 2,
    kind: 'door',
    tile,
    panels: [new THREE.Group()],
    animStart: 0,
    animFrom: 0,
    animTo: 0,
    animDur: DOOR_OPEN_MS,
    busy: false
  };
}

describe('voxel-floor1 doors match Classic timing and lock rules', () => {
  beforeEach(() => resetFloor1Doors());

  it('starts all four door edges closed with a leaf style', () => {
    const doors = [
      [4, 2],
      [14, 2],
      [6, 8],
      [19, 5]
    ] as const;
    for (const [x, y] of doors) {
      const tile = tileAt(floor1Map, x, y);
      expect(tile?.door, `${x},${y}`).toBeFalsy();
      expect(tile?.doorOpen, `${x},${y}`).toBeFalsy();
    }
  });

  it('slides the leaf up like a portcullis in 0.6s and keeps the secret Y-slide', () => {
    expect(DOOR_LEAF_MS).toBe(600);
    expect(DOOR_LEAF_SLIDE).toBeGreaterThan(lintelTop() - 1e-6);
    expect(DOOR_SLIDE).toBeCloseTo(1.42, 8);
    expect(DOOR_OPEN_MS).toBe(1450);
    expect(DOOR_CLOSE_MS).toBe(600);
    expect(DOOR_UNLOCK_LEAD_MS).toBe(350);
  });

  it('ages door_panel wood to grey-brown and iron to rust without a new design', () => {
    const w = 16;
    const h = 16;
    const src = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      src[i * 4] = 200;
      src[i * 4 + 1] = 110;
      src[i * 4 + 2] = 48;
      src[i * 4 + 3] = 255;
    }
    const mid = ((h >> 1) * w + (w >> 1)) * 4;
    src[mid] = 170;
    src[mid + 1] = 172;
    src[mid + 2] = 176;
    const stud = mid + 4;
    src[stud] = 255;
    src[stud + 1] = 255;
    src[stud + 2] = 252;
    src[stud + 3] = 255;
    const aged = ageDoorPanelPixels(src, w, h);
    expect(aged[0]).toBeLessThan(140);
    expect(aged[0] - aged[2]).toBeLessThan(40);
    expect(aged[mid]).toBeLessThan(90);
    expect(aged[mid]).toBeGreaterThan(aged[mid + 2]);
    const studLuma = (0.2126 * aged[stud] + 0.7152 * aged[stud + 1] + 0.0722 * aged[stud + 2]) / 255;
    expect(studLuma).toBeLessThanOrEqual(LEAF_MAX_LUMA + 1e-3);
    expect(Math.max(aged[stud], aged[stud + 1], aged[stud + 2])).toBeLessThan(140);
    expect(aged[stud]).toBeGreaterThan(aged[stud + 2]);
    let maxLuma = 0;
    for (let i = 0; i < w * h; i++) {
      const luma =
        (0.2126 * aged[i * 4] + 0.7152 * aged[i * 4 + 1] + 0.0722 * aged[i * 4 + 2]) / 255;
      if (luma > maxLuma) maxLuma = luma;
    }
    expect(maxLuma).toBeLessThanOrEqual(LEAF_MAX_LUMA + 1e-3);
  });

  it('refuses a locked door without a key and does not start the slide', () => {
    const system = new OpeningSystem();
    const visual = fakeDoor(true);
    system.register(visual);
    expect(system.tryDoor(4, 2, false, 1000)).toBe('locked');
    expect(visual.tile.doorOpen).toBeFalsy();
    expect(visual.busy).toBe(false);
    expect(system.isLocked(4, 2)).toBe(true);
  });

  it('unlocks with a key, then opens after the lead-in', () => {
    const system = new OpeningSystem();
    const visual = fakeDoor(true);
    system.register(visual);
    expect(system.tryDoor(4, 2, true, 1000)).toBe('unlocking');
    expect(visual.tile.doorLocked).toBe(false);
    expect(visual.tile.doorOpen).toBeFalsy();
    system.update(1000 + DOOR_UNLOCK_LEAD_MS - 1);
    expect(visual.tile.doorOpen).toBeFalsy();
    system.update(1000 + DOOR_UNLOCK_LEAD_MS);
    expect(visual.tile.doorOpen).toBe(true);
    expect(visual.busy).toBe(true);
    system.update(1000 + DOOR_UNLOCK_LEAD_MS + DOOR_LEAF_MS);
    expect(visual.busy).toBe(false);
    expect(visual.panels[0].visible).toBe(false);
    expect(visual.panels[0].position.y).toBeCloseTo(DOOR_LEAF_SLIDE, 5);
  });

  it('sets doorOpen at slide start so the cell is walkable while the leaf moves', () => {
    const system = new OpeningSystem();
    const visual = fakeDoor(false);
    system.register(visual);
    expect(system.tryDoor(4, 2, false, 50)).toBe('toggled');
    expect(visual.tile.doorOpen).toBe(true);
    expect(visual.busy).toBe(true);
    system.update(50 + DOOR_LEAF_MS);
    expect(visual.busy).toBe(false);
    expect(visual.panels[0].position.y).toBeCloseTo(DOOR_LEAF_SLIDE, 5);
    expect(visual.panels[0].visible).toBe(false);
    system.poseOpen(visual, 0.45);
    expect(visual.panels[0].position.y).toBeCloseTo(DOOR_LEAF_SLIDE * 0.45, 5);
    expect(visual.panels[0].visible).toBe(true);
    expect(visual.busy).toBe(false);
    system.snapOpen(visual, false);
    expect(visual.tile.doorOpen).toBe(false);
    expect(visual.panels[0].position.y).toBeCloseTo(0, 5);
    expect(visual.panels[0].visible).toBe(true);
  });

  it('opens a secret wall on bump and keeps overlay files off proto3d', () => {
    const system = new OpeningSystem();
    const tile = tileAt(floor1Map, 5, 1)!;
    const visual: OpeningVisual = {
      x: 5,
      y: 1,
      kind: 'secret',
      tile,
      panels: [new THREE.Group()],
      animStart: 0,
      animFrom: 0,
      animTo: 0,
      animDur: DOOR_OPEN_MS,
      busy: false
    };
    system.register(visual);
    expect(system.openSecret(5, 1, 10)).toBe(true);
    expect(tile.secretOpen).toBe(true);
    const dir = resolve(__dirname, '../src/voxel-floor1');
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.ts')) continue;
      const src = readFileSync(resolve(dir, name), 'utf8');
      expect(src, name).not.toContain("from '../proto3d/");
    }
    const main = readFileSync(resolve(dir, 'main.ts'), 'utf8');
    expect(main).toContain('buildFloor1Openings');
    expect(main).toContain('handleDoor');
    expect(main).toContain('openSecret');
    expect(main).not.toContain('if (remeshed) syncShadows()');
    const openings = readFileSync(resolve(dir, 'openings.ts'), 'utf8');
    expect(openings).toContain('ceiling_planks_1.png');
    expect(openings).toContain('doorOpeningStyle');
    expect(openings).toContain('FLOOR1_WALL_FILES');
    expect(openings).toContain('lookForSecret');
    expect(openings).toContain('lookForZoneBase');
    expect(openings).toContain('maskVolumeWithOpening');
    expect(openings).toContain('openingHoleMask');
    expect(openings).toContain('solidifyArchVolume');
    expect(openings).toContain('makeArchToWorld');
    expect(openings).toContain('projectArchOpeningUvs');
    expect(openings).toContain('wrapT = THREE.RepeatWrapping');
    expect(openings).toContain('warnMissingWallTexture');
    expect(openings).toContain('familyBaseFile');
    expect(openings).not.toContain('using door_open');
    expect(openings).toContain('surroundFile');
    expect(main).not.toContain('listDoors(floor1Map)');
    expect(main).not.toContain('snapOpen(visual, true)');
    expect(main).not.toContain('Demo only');
    expect(main).toContain('hitFacingDoorLeaf');
    expect(main).toContain("'Close'");
    expect(main).toContain('localClippingEnabled');
    expect(openings).toContain('door_panel.png');
    expect(openings).toContain('ageDoorPanelPixels');
    expect(openings).toContain('DOOR_LEAF_SLIDE');
    expect(openings).toContain('doorLeaf');
    expect(openings).not.toContain('door-hinge');
    expect(openings).not.toContain('MeshBasicMaterial');
    expect(openings).not.toContain('applyWallLook');
    expect(openings).toContain('recessSecretTell');
    expect(openings).not.toContain('secret_closed.png');
    expect(openings).toContain('greedyMesh');
    expect(openings).toContain('patchBakeMaterial');
    expect(openings).toContain('keepBack');
    expect(openings).toContain('cullNeg: [false, false, false]');
    expect(main).toContain('buildFloor1Markers');
    expect(main).toContain('TORCH_CAPPED_PROMPT');
    expect(main).toContain('facingSconce');
    expect(main).not.toContain('relightTorch');
    expect(main).not.toContain('lightFacingTorch');
  });

  it('keeps greedy-mesh back faces when cullNeg depth is off', () => {
    const dims: [number, number, number] = [2, 2, 2];
    const volume = new Uint8Array(8).fill(1);
    const toWorld = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
    const culled = greedyMesh(volume, dims, toWorld);
    const kept = greedyMesh(volume, dims, toWorld, { cullNeg: [false, false, false] });
    expect(kept.quads).toBeGreaterThan(culled.quads);
    expect(kept.quads - culled.quads).toBe(1);
  });

  it('hashes secret faces like neighbouring stone walls', () => {
    const views = openingViews(floor1Map, 5, 1);
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      expect(view.wallX).toBe(5);
      expect(view.wallY).toBe(1);
      const look = lookForSecret(view.wallX, view.wallY, view.wallFace, view.tx, view.tz);
      expect(look.file.startsWith('walls_floor1/')).toBe(true);
      expect(look.bulge).toBe(0);
    }
  });

  it('cuts only the painted doorway void from family-base stone', () => {
    const wall = new Uint8Array(8).fill(1);
    const opening = new Uint8Array(8);
    opening[0] = 1;
    opening[1] = 1;
    const masked = maskVolumeWithOpening(wall, [2, 2, 2], opening, [2, 2, 2]);
    expect(masked[0]).toBe(1);
    expect(masked[1]).toBe(1);
    expect(masked[2]).toBe(0);
    expect(masked[4]).toBe(1);
  });

  it('recesses a single field brick by one depth layer', () => {
    const W = 128;
    const H = 128;
    const D = 3;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      data[i * 4] = 8;
      data[i * 4 + 1] = 8;
      data[i * 4 + 2] = 8;
      data[i * 4 + 3] = 255;
    }
    for (let y = 61; y <= 71; y++) {
      for (let x = 50; x <= 66; x++) {
        const i = (y * W + x) * 4;
        data[i] = 140;
        data[i + 1] = 140;
        data[i + 2] = 140;
      }
    }
    const texels = pickSecretTellTexels({ width: W, height: H, data }, 0);
    expect(texels.length).toBeGreaterThan(80);
    expect(texels.length).toBeLessThan(250);
    const volume = new Uint8Array(W * H * D);
    volume.fill(1);
    const recessed = recessSecretTell(volume, [W, H, D], texels);
    let pulled = 0;
    for (const [u, v] of texels) {
      if (!recessed[u + v * W + 2 * W * H]) pulled += 1;
      expect(recessed[u + v * W]).toBe(1);
    }
    expect(pulled).toBe(texels.length);
    expect(recessed[0 + 0 * W + 2 * W * H]).toBe(1);
  });

  it('cuts the door opening through a 30 cm doorway wall', () => {
    expect(ARCH_FRONT).toBeCloseTo(0.03, 5);
    const wall = new Uint8Array(8).fill(1);
    wall[2] = 0;
    wall[6] = 0;
    const arch = solidifyArchVolume(wall, [2, 2, 2], 15);
    expect(arch.dims[2]).toBe(15);
    expect(arch.volume[0]).toBe(1);
    expect(arch.volume[2]).toBe(0);
    const toWorld = makeArchToWorld('W', 4, 2, [2, 2, 15]);
    const back = toWorld(0, 0, 0);
    const front = toWorld(0, 0, 15);
    expect(front[0] - back[0]).toBeCloseTo(0.15, 5);
    expect(back[0]).toBeCloseTo((4 - 0.5) * CELL, 5);
    expect(front[0] - back[0]).toBeGreaterThan(0.12);
    expect(front[0] - back[0]).toBeLessThan(0.2);
  });
});
