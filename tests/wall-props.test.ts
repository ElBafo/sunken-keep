import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { CAMERA_NEAR, CELL_SIZE, cameraOffsetXZ } from '../src/proto3d/constants';
import { floor1 } from '../src/proto3d/floor-data';
import { isBlockingProp, isWallProp, PropBuilder } from '../src/proto3d/props';
import { Player } from '../src/proto3d/player';
import {
  canInteractProp,
  interactPropAt,
  WALL_PROP_WORLD_HEIGHT,
  wallPropInset,
  wallPropPlanePose,
  wallPropShowsFlat,
  wallPropVisible
} from '../src/proto3d/wall-props';
import * as THREE from 'three';

describe('wall vs floor props', () => {
  const lamp = floor1.tiles[9][13];
  const desk = floor1.tiles[9][12];
  const beam = floor1.tiles[2][12];
  const rack = floor1.tiles[10][9];
  const mirrored = floor1.tiles[3][10];

  it('marks the capped lamp as a non-blocking wall prop on E', () => {
    expect(lamp.prop).toBe('lamp_capped');
    expect(isWallProp(lamp)).toBe(true);
    expect(isBlockingProp(lamp)).toBe(false);
    expect(lamp.propWall).toBe('E');
  });

  it('keeps desk and guard-hall beams as blocking floor props; jar rack hangs on the west wall', () => {
    expect(isBlockingProp(desk)).toBe(true);
    expect(isWallProp(desk)).toBe(false);
    expect(isBlockingProp(beam)).toBe(true);
    expect(rack.prop).toBe('jar_rack');
    expect(isWallProp(rack)).toBe(true);
    expect(isBlockingProp(rack)).toBe(false);
    expect(rack.propWall).toBe('W');
    expect(mirrored.prop).toBe('beams_fallen');
    expect(mirrored.mirror).toBe(true);
  });

  it('lets the party walk onto the lamp square but not the beams', () => {
    const player = new Player(new THREE.PerspectiveCamera(), floor1);
    expect(player.blockReason(13, 9)).toBe('ok');
    expect(player.blockReason(12, 2)).toBe('wall');
    expect(player.blockReason(10, 3)).toBe('wall');
    expect(player.blockReason(12, 4)).toBe('wall');
    expect(player.blockReason(12, 9)).toBe('wall');
    expect(player.blockReason(9, 10)).toBe('ok');
  });

  it('interacts from the adjacent square facing it and from its own square facing E only', () => {
    expect(canInteractProp(13, 8, 2, 13, 9, lamp)).toBe(true);
    expect(canInteractProp(13, 10, 0, 13, 9, lamp)).toBe(true);
    expect(canInteractProp(12, 9, 1, 13, 9, lamp)).toBe(true);
    expect(canInteractProp(13, 9, 1, 13, 9, lamp)).toBe(true);
    expect(canInteractProp(13, 9, 3, 13, 9, lamp)).toBe(false);
    expect(canInteractProp(13, 9, 0, 13, 9, lamp)).toBe(false);
    const fromDesk = interactPropAt(floor1.tiles, floor1.width, floor1.height, 12, 9, 1);
    expect(fromDesk?.tile.prop).toBe('lamp_capped');
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

  it('draws the wall-flat plane on the E wall at sprite size, inset from the near plane', () => {
    const pose = wallPropPlanePose(13, 9, 'E', 32, 48);
    expect(pose.scaleY).toBe(WALL_PROP_WORLD_HEIGHT);
    expect(pose.scaleY).toBeLessThan(CELL_SIZE);
    expect(pose.scaleX).toBeCloseTo(WALL_PROP_WORLD_HEIGHT * (32 / 48));
    expect(pose.y).toBeCloseTo(CELL_SIZE / 2);
    expect(pose.x).toBeGreaterThan(13 * CELL_SIZE);
    expect(pose.x).toBeLessThan(13 * CELL_SIZE + CELL_SIZE / 2);
    expect(13 * CELL_SIZE + CELL_SIZE / 2 - pose.x).toBeCloseTo(wallPropInset(), 10);
    expect(wallPropInset()).toBeGreaterThanOrEqual(CAMERA_NEAR);
    expect(wallPropShowsFlat(13, 9, 1, 13, 9, 'E')).toBe(true);
    expect(wallPropShowsFlat(13, 9, 3, 13, 9, 'E')).toBe(false);
    expect(wallPropShowsFlat(13, 8, 2, 13, 9, 'E')).toBe(false);
    expect(wallPropVisible(13, 9, 1, 13, 9, 'E')).toBe(true);
    expect(wallPropVisible(13, 9, 3, 13, 9, 'E')).toBe(false);
    expect(wallPropVisible(13, 8, 2, 13, 9, 'E')).toBe(true);
    expect(wallPropVisible(9, 10, 3, 9, 10, 'W')).toBe(true);
    expect(wallPropVisible(9, 10, 1, 9, 10, 'W')).toBe(false);
  });

  it('keeps the facing camera outside the near plane of a wall-hung prop', () => {
    const pose = wallPropPlanePose(13, 9, 'E', 32, 48);
    const rotY = (-1 * Math.PI) / 2;
    const [ox, oz] = cameraOffsetXZ(rotY);
    const camX = 13 * CELL_SIZE + ox;
    const camZ = 9 * CELL_SIZE + oz;
    const dist = Math.hypot(pose.x - camX, pose.z - camZ);
    expect(dist).toBeGreaterThan(CAMERA_NEAR);
    const cellCenterDist = Math.hypot(13 * CELL_SIZE - camX, 9 * CELL_SIZE - camZ);
    expect(cellCenterDist).toBeLessThan(dist);
  });

  it('does not use a camera-facing sprite for wall props', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/props.ts'), 'utf8');
    expect(src).not.toMatch(/new THREE\.Sprite/);
    expect(src).toMatch(/MeshLambertMaterial|MeshStandardMaterial/);
    expect(src).toContain('NearestFilter');
    expect(src).toContain('vertexColors: true');
    expect(src).toContain('emissive');
    expect(src).toContain('0xffffff');
    expect(src).toMatch(/emissiveIntensity:\s*0\.3[0-9]/);
    expect(src).toContain('emissiveMap: this.lampTex');
  });

  it('hangs the lamp and jar rack on their wall faces and hides them when the camera is on that wall', () => {
    const scene = new THREE.Scene();
    const props = new PropBuilder();
    props.place(scene, floor1);

    props.layoutAdjacent(13, 9, 1, 1);
    const lampEast = props.debugWallProps().filter((d) => d.x === 13 && d.y === 9);
    expect(lampEast.length).toBeGreaterThan(0);
    expect(lampEast.every((d) => d.face === 'E')).toBe(true);
    expect(lampEast.every((d) => d.visible)).toBe(true);
    expect(lampEast.every((d) => d.scaleY <= WALL_PROP_WORLD_HEIGHT + 1e-6)).toBe(true);
    expect(lampEast.every((d) => d.kind !== 'lamp_capped')).toBe(true);

    props.layoutAdjacent(13, 9, 1, 3);
    expect(props.debugWallProps().filter((d) => d.x === 13 && d.y === 9).every((d) => !d.visible)).toBe(true);

    props.layoutAdjacent(13, 8, 1, 2);
    const lampAdj = props.debugWallProps().filter((d) => d.x === 13 && d.y === 9);
    expect(lampAdj.every((d) => d.visible)).toBe(true);
    expect(lampAdj.every((d) => d.scaleY <= WALL_PROP_WORLD_HEIGHT + 1e-6)).toBe(true);

    props.layoutAdjacent(9, 10, 1, 3);
    const rackWest = props.debugWallProps().filter((d) => d.x === 9 && d.y === 10);
    expect(rackWest.length).toBeGreaterThan(0);
    expect(rackWest.every((d) => d.face === 'W')).toBe(true);
    expect(rackWest.every((d) => d.visible)).toBe(true);

    props.layoutAdjacent(9, 10, 1, 1);
    expect(props.debugWallProps().filter((d) => d.x === 9 && d.y === 10).every((d) => !d.visible)).toBe(true);

    props.layoutAdjacent(10, 10, 1, 3);
    expect(props.debugWallProps().filter((d) => d.x === 9 && d.y === 10).every((d) => d.visible)).toBe(true);
  });
});
