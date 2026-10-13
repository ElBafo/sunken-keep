import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { CELL_SIZE } from '../src/proto3d/constants';
import { floor1 } from '../src/proto3d/floor-data';
import { isBlockingProp, isWallProp } from '../src/proto3d/props';
import { Player } from '../src/proto3d/player';
import {
  canInteractProp,
  interactPropAt,
  wallPropPlanePose,
  wallPropShowsFlat
} from '../src/proto3d/wall-props';
import * as THREE from 'three';

describe('wall vs floor props', () => {
  const lamp = floor1.tiles[9][13];
  const desk = floor1.tiles[9][12];
  const beam = floor1.tiles[2][12];

  it('marks the capped lamp as a non-blocking wall prop on E', () => {
    expect(lamp.prop).toBe('lamp_capped');
    expect(isWallProp(lamp)).toBe(true);
    expect(isBlockingProp(lamp)).toBe(false);
    expect(lamp.propWall).toBe('E');
  });

  it('keeps desk and guard-hall beams as blocking floor props', () => {
    expect(isBlockingProp(desk)).toBe(true);
    expect(isWallProp(desk)).toBe(false);
    expect(isBlockingProp(beam)).toBe(true);
  });

  it('lets the party walk onto the lamp square but not the beams', () => {
    const player = new Player(new THREE.PerspectiveCamera(), floor1);
    expect(player.blockReason(13, 9)).toBe('ok');
    expect(player.blockReason(12, 2)).toBe('wall');
    expect(player.blockReason(10, 3)).toBe('wall');
    expect(player.blockReason(12, 4)).toBe('wall');
    expect(player.blockReason(12, 9)).toBe('wall');
  });

  it('interacts from the adjacent square facing it and from its own square facing E only', () => {
    expect(canInteractProp(13, 8, 2, 13, 9, lamp)).toBe(true);
    expect(canInteractProp(13, 10, 0, 13, 9, lamp)).toBe(true);
    expect(canInteractProp(13, 9, 1, 13, 9, lamp)).toBe(true);
    expect(canInteractProp(13, 9, 3, 13, 9, lamp)).toBe(false);
    expect(canInteractProp(13, 9, 0, 13, 9, lamp)).toBe(false);
    const own = interactPropAt(floor1.tiles, floor1.width, floor1.height, 13, 9, 1);
    expect(own?.tile.prop).toBe('lamp_capped');
    const miss = interactPropAt(floor1.tiles, floor1.width, floor1.height, 13, 9, 0);
    expect(miss).toBeNull();
  });

  it('falls through to the desk when standing on the lamp and facing west', () => {
    const west = interactPropAt(floor1.tiles, floor1.width, floor1.height, 13, 9, 3);
    expect(west?.x).toBe(12);
    expect(west?.y).toBe(9);
    expect(west?.tile.prop).toBe('desk');
  });

  it('keeps own-square lamp interact when facing its propWall', () => {
    const east = interactPropAt(floor1.tiles, floor1.width, floor1.height, 13, 9, 1);
    expect(east?.tile.prop).toBe('lamp_capped');
  });

  it('draws the wall-flat plane on the E wall at wall height, inset from the camera', () => {
    const pose = wallPropPlanePose(13, 9, 'E', 32, 48);
    expect(pose.scaleY).toBe(CELL_SIZE);
    expect(pose.x).toBeGreaterThan(13 * CELL_SIZE);
    expect(pose.x).toBeLessThan(13 * CELL_SIZE + CELL_SIZE / 2);
    expect(wallPropShowsFlat(13, 9, 1, 13, 9, 'E')).toBe(true);
    expect(wallPropShowsFlat(13, 9, 3, 13, 9, 'E')).toBe(false);
    expect(wallPropShowsFlat(13, 8, 2, 13, 9, 'E')).toBe(false);
  });

  it('draws the own-square stand-in with a lit nearest-filtered material', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/props.ts'), 'utf8');
    expect(src).toMatch(/MeshLambertMaterial|MeshStandardMaterial/);
    expect(src).toContain('NearestFilter');
    expect(src).toContain('vertexColors: true');
    expect(src).toContain('emissive');
  });
});
