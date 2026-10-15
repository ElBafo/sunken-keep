import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as THREE from 'three';
import {
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_VIEW,
  CELL_SIZE,
  FACE_INTO_ROOM,
  SCONCE_NEAR_CULL,
  WALL_MOUNT_INSET,
  WALL_MOUNT_NEAR_CULL,
  hideWallProp,
  wallPropRoom
} from '../src/proto3d/constants';
import { floor1, floor1Sconces } from '../src/proto3d/floor-data';
import { Player } from '../src/proto3d/player';
import {
  sconceCulledByCamera,
  torchBracketPoses,
  torchWorldPos
} from '../src/proto3d/torches';
import { wallPropPlanePose, type PropWall } from '../src/proto3d/wall-props';

const OPPOSITE: Record<PropWall, PropWall> = { N: 'S', E: 'W', S: 'N', W: 'E' };

function makePlayer(x: number, y: number, dir: number): Player {
  const cam = new THREE.PerspectiveCamera(CAMERA_FOV, CAMERA_VIEW[0] / CAMERA_VIEW[1], CAMERA_NEAR, 32);
  const player = new Player(cam, floor1);
  player.setPosition(x, y, dir);
  return player;
}

function alongCorridorDirs(face: PropWall): [number, number] {
  return face === 'E' || face === 'W' ? [0, 2] : [1, 3];
}

function adjacentAlongCorridor(roomX: number, roomY: number, face: PropWall): Array<{ x: number; y: number }> {
  if (face === 'E' || face === 'W') {
    return [
      { x: roomX, y: roomY - 1 },
      { x: roomX, y: roomY + 1 }
    ];
  }
  return [
    { x: roomX - 1, y: roomY },
    { x: roomX + 1, y: roomY }
  ];
}

describe('sconce near-plane bracket cull', () => {
  const unlit = floor1Sconces.find((s) => s.x === 4 && s.y === 6)!;
  const lit = floor1Sconces.find((s) => s.x === 0 && s.y === 6)!;

  it('mounts bracket + flame flush on the wall like wallPropPlanePose', () => {
    expect(WALL_MOUNT_INSET).toBe(0.08);
    for (const s of floor1Sconces) {
      const poses = torchBracketPoses(s);
      const room = wallPropRoom(s.x, s.y, s.face);
      const wall = wallPropPlanePose(room.x, room.y, OPPOSITE[s.face], 32, 48);
      const { nx, nz } = FACE_INTO_ROOM[s.face];
      const wallX = s.x * CELL_SIZE + nx * (CELL_SIZE / 2);
      const wallZ = s.y * CELL_SIZE + nz * (CELL_SIZE / 2);

      expect(poses.front.x, `front x ${s.x},${s.y} ${s.face}`).toBeCloseTo(wall.x, 5);
      expect(poses.front.z, `front z ${s.x},${s.y} ${s.face}`).toBeCloseTo(wall.z, 5);
      expect(poses.side.x, 'side piece anchored on the wall').toBeCloseTo(poses.front.x, 5);
      expect(poses.side.z).toBeCloseTo(poses.front.z, 5);
      expect(poses.flame.x).toBeCloseTo(poses.front.x, 5);
      expect(poses.flame.z).toBeCloseTo(poses.front.z, 5);
      expect(Math.hypot(poses.front.x - wallX, poses.front.z - wallZ)).toBeCloseTo(WALL_MOUNT_INSET, 5);
    }
  });

  it('keeps the unlit (4,6) W bracket (QA flash: backing from (2,6) facing west)', () => {
    expect(unlit.face).toBe('W');
    expect(unlit.lit).toBe(false);
    const poses = torchBracketPoses(unlit);
    expect(poses.side.x).toBeCloseTo(poses.front.x, 5);
  });

  it('culls the unlit bracket as the camera arrives on its wall (QA: (2,6,3) then back)', () => {
    const player = makePlayer(2, 6, 3);
    const rotY = (-3 * Math.PI) / 2;
    const frames: Array<{ t: number; culled: boolean; hideGrid: boolean }> = [];

    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const x = 2 + (3 - 2) * eased;
      player.poseCamera(x, 6, rotY, 0);
      const hideGrid = hideWallProp(unlit.x, unlit.y, unlit.face, 2, 6, 3);
      const culled = sconceCulledByCamera(unlit, player.camera);
      frames.push({ t, culled, hideGrid });
    }

    const flash = frames.filter((f) => f.t >= 0.85);
    expect(flash.length).toBeGreaterThan(0);
    expect(
      flash.every((f) => f.culled),
      `late-step frames must hide the bracket (got ${JSON.stringify(flash)})`
    ).toBe(true);
    expect(
      frames.some((f) => f.culled && !f.hideGrid),
      'camera-depth cull must hide the bracket before own-square hideWallProp'
    ).toBe(true);
  });

  it('still shows the bracket when facing the sconce from its room', () => {
    const player = makePlayer(3, 6, 1);
    expect(sconceCulledByCamera(unlit, player.camera)).toBe(false);
    expect(torchWorldPos(unlit).x).toBeGreaterThan(3 * 2);
  });

  it('still shows the lit west-wall torch when facing it at (1,6)', () => {
    const player = makePlayer(1, 6, 3);
    expect(sconceCulledByCamera(lit, player.camera)).toBe(false);
  });

  it('shows the side-wall sconce at rest in its room looking along the corridor', () => {
    for (const dir of alongCorridorDirs(lit.face)) {
      const player = makePlayer(1, 6, dir);
      expect(
        sconceCulledByCamera(lit, player.camera),
        `lit (0,6) E culled at rest (1,6) dir ${dir}`
      ).toBe(false);
    }
  });

  it('shows every floor-1 sconce at rest from the adjacent corridor square', () => {
    for (const s of floor1Sconces) {
      const room = wallPropRoom(s.x, s.y, s.face);
      for (const dir of alongCorridorDirs(s.face)) {
        const inRoom = makePlayer(room.x, room.y, dir);
        expect(
          sconceCulledByCamera(s, inRoom.camera),
          `${s.x},${s.y} ${s.face} culled at rest in room (${room.x},${room.y}) dir ${dir}`
        ).toBe(false);
      }
      for (const adj of adjacentAlongCorridor(room.x, room.y, s.face)) {
        if (adj.x < 0 || adj.y < 0 || adj.x >= floor1.width || adj.y >= floor1.height) continue;
        if (floor1.tiles[adj.y]?.[adj.x]?.wall) continue;
        const dirToward =
          adj.y < room.y ? 2 : adj.y > room.y ? 0 : adj.x < room.x ? 1 : 3;
        const player = makePlayer(adj.x, adj.y, dirToward);
        expect(
          sconceCulledByCamera(s, player.camera),
          `${s.x},${s.y} ${s.face} culled at rest from (${adj.x},${adj.y}) looking toward room dir ${dirToward}`
        ).toBe(false);
      }
    }
  });

  it('does not use hideWallProp to hide sconces — near-cull is camera-depth only', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/torches.ts'), 'utf8');
    const hidden = src.slice(src.indexOf('private sconceHidden'), src.indexOf('snapshot()'));
    expect(hidden).toContain('objectNearPlaneCulled');
    expect(hidden).not.toContain('hideWallProp');
    expect(src).not.toMatch(/hideWallProp\(/);
  });

  it(`uses a cull distance past CAMERA_NEAR (${CAMERA_NEAR}) so a 0.5-wide bracket cannot straddle the clip plane`, () => {
    expect(SCONCE_NEAR_CULL).toBeGreaterThan(CAMERA_NEAR);
    expect(SCONCE_NEAR_CULL).toBeGreaterThanOrEqual(0.5);
    expect(SCONCE_NEAR_CULL).toBe(WALL_MOUNT_NEAR_CULL);
  });
});
