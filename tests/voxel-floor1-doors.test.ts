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
import { OpeningSystem, type OpeningVisual } from '../src/voxel-floor1/openings';
import { floor1Map, resetFloor1Doors, tileAt } from '../src/voxel-floor1/layout';

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
    expect(openings).toContain('secret_closed.png');
    expect(openings).toContain('greedyMesh');
    expect(openings).toContain('patchBakeMaterial');
  });
});
