import * as THREE from 'three';
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import {
  DOOR_CLOSE_MS,
  DOOR_OPEN_MS,
  DOOR_SLIDE,
  DOOR_UNLOCK_LEAD_MS
} from '../src/voxel-floor1/constants';
import { greedyMesh } from '../src/voxel-lab/mesher';
import {
  OpeningSystem,
  pickSecretTellTexels,
  recessSecretTell,
  type OpeningVisual
} from '../src/voxel-floor1/openings';
import { floor1Map, openingViews, resetFloor1Doors, tileAt } from '../src/voxel-floor1/layout';
import { lookForSecret } from '../src/voxel-floor1/wall-look';

function fakeDoor(locked: boolean): OpeningVisual {
  const tile = tileAt(floor1Map, 4, 2)!;
  tile.door = true;
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

  it('uses proto3d slide distance and open/close windows', () => {
    expect(DOOR_SLIDE).toBeCloseTo(1.42, 8);
    expect(DOOR_OPEN_MS).toBe(1450);
    expect(DOOR_CLOSE_MS).toBe(600);
    expect(DOOR_UNLOCK_LEAD_MS).toBe(350);
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
  });

  it('sets doorOpen at slide start so the cell is walkable while the panel moves', () => {
    const system = new OpeningSystem();
    const visual = fakeDoor(false);
    system.register(visual);
    expect(system.tryDoor(4, 2, false, 50)).toBe('toggled');
    expect(visual.tile.doorOpen).toBe(true);
    expect(visual.busy).toBe(true);
    system.update(50 + DOOR_OPEN_MS);
    expect(visual.busy).toBe(false);
    expect(visual.panels[0].position.y).toBeCloseTo(DOOR_SLIDE, 5);
    expect(visual.panels[0].visible).toBe(false);
    system.poseSlide(visual, 0.45);
    expect(visual.panels[0].position.y).toBeCloseTo(DOOR_SLIDE * 0.45, 5);
    expect(visual.busy).toBe(false);
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
    expect(openings).toContain('door_panel.png');
    expect(openings).toContain('door_open.png');
    expect(openings).toContain('FLOOR1_WALL_FILES');
    expect(openings).toContain('lookForSecret');
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
});
