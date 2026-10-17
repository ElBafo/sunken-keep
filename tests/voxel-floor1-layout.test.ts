import { describe, expect, it } from 'vitest';
import spec from '../public/proto3d/camera.json';
import { floor1 } from '../public/levels/floor1';
import { pickVariantIndex as gamePick } from '../src/proto3d/texture-variants';
import {
  CELL,
  EYE_HEIGHT,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_VIEW_ASPECT,
  CAMERA_VIEW_H,
  CAMERA_VIEW_W,
  FOG_FAR,
  FOG_NEAR,
  MOVE_MS,
  VOXEL_CHEB,
  WALL_VARIANTS
} from '../src/voxel-floor1/constants';
import { dirToRot, easeInOutQuad } from '../src/voxel-floor1/camera';
import {
  canStep,
  enumerateFaces,
  floor1Map,
  isSolidTile,
  isWalkableTile,
  isTrueWall,
  knotBesideSecret,
  listDoors,
  listSecrets,
  resetFloor1Doors,
  tileAt
} from '../src/voxel-floor1/layout';
import {
  floor1KnotWalls,
  KNOT_WALL_FILE,
  knotWallFile,
  knotWallViewer
} from '../src/voxel-floor1/knot-walls';
import { pickVariantIndex } from '../src/voxel-floor1/variants';
import { tileCorner, tileFlatPose } from '../src/voxel-lab/faces';

describe('voxel-floor1 uses the game camera spec and New Game start', () => {
  it('matches proto3d cell size, eye height, FOV, near clip, and 180 ms steps', () => {
    expect(CELL).toBe(spec.cellSize);
    expect(CELL).toBe(2);
    expect(EYE_HEIGHT).toBe(spec.eyeHeight);
    expect(CAMERA_FOV).toBe(spec.fov);
    expect(CAMERA_NEAR).toBe(spec.near);
    expect(MOVE_MS).toBe(180);
    expect(CAMERA_VIEW_W).toBe(spec.view[0]);
    expect(CAMERA_VIEW_H).toBe(spec.view[1]);
    expect(CAMERA_VIEW_ASPECT).toBeCloseTo(270 / 380, 8);
    expect(FOG_NEAR).toBe(10);
    expect(FOG_FAR).toBe(28);
    expect(VOXEL_CHEB).toBe(3);
  });

  it('starts at the same square and facing as New Game', () => {
    expect(floor1Map.startX).toBe(floor1.startX);
    expect(floor1Map.startY).toBe(floor1.startY);
    expect(floor1Map.startDir).toBe(floor1.startDir);
    expect(floor1Map.startX).toBe(3);
    expect(floor1Map.startY).toBe(14);
    expect(floor1Map.startDir).toBe(3);
    expect(dirToRot(3)).toBeCloseTo((-3 * Math.PI) / 2, 8);
  });
});

describe('doors and secrets are plain blocking walls', () => {
  it('treats closed doors and secret walls as solid, empties as walkable', () => {
    expect(isSolidTile(tileAt(floor1Map, 4, 2))).toBe(true);
    expect(tileAt(floor1Map, 4, 2)?.door).toBe(true);
    expect(isSolidTile(tileAt(floor1Map, 5, 1))).toBe(true);
    expect(tileAt(floor1Map, 5, 1)?.secret).toBe(true);
    expect(isWalkableTile(tileAt(floor1Map, 3, 14))).toBe(true);
    expect(isWalkableTile(tileAt(floor1Map, 2, 14))).toBe(true);
    expect(canStep(floor1Map, 2, 14)).toBe(true);
    expect(canStep(floor1Map, 3, 15)).toBe(false);
    expect(canStep(floor1Map, 4, 2)).toBe(false);
    expect(canStep(floor1Map, 5, 1)).toBe(false);
  });

  it('unblocks stepping once a door or secret is open, without changing baked faces', () => {
    resetFloor1Doors();
    const before = enumerateFaces(floor1Map).length;
    const door = tileAt(floor1Map, 4, 2)!;
    door.doorOpen = true;
    expect(canStep(floor1Map, 4, 2)).toBe(true);
    expect(enumerateFaces(floor1Map).length).toBe(before);
    door.doorOpen = false;
    const secret = tileAt(floor1Map, 5, 1)!;
    secret.secretOpen = true;
    expect(canStep(floor1Map, 5, 1)).toBe(true);
    expect(enumerateFaces(floor1Map).length).toBe(before);
    resetFloor1Doors();
  });

  it('keeps Classic floor-1 door and secret cells', () => {
    expect(listDoors()).toEqual([
      { x: 4, y: 2, locked: true },
      { x: 14, y: 2, locked: false },
      { x: 19, y: 5, locked: false },
      { x: 6, y: 8, locked: false }
    ]);
    expect(listSecrets()).toEqual([
      { x: 5, y: 1 },
      { x: 5, y: 13 }
    ]);
  });

  it('emits floor on door and secret cells, not stone faces into those openings', () => {
    const faces = enumerateFaces(floor1Map);
    expect(faces.some((f) => f.kind === 'floor' && f.tx === 4 && f.tz === 2)).toBe(true);
    expect(faces.some((f) => f.kind === 'floor' && f.tx === 5 && f.tz === 1)).toBe(true);
    expect(faces.some((f) => f.tx === 3 && f.tz === 2 && f.face === 'E')).toBe(false);
    expect(faces.some((f) => f.tx === 5 && f.tz === 2 && f.face === 'W')).toBe(false);
    expect(faces.some((f) => f.tx === 4 && f.tz === 2 && f.face === 'N')).toBe(true);
    expect(faces.some((f) => f.kind === 'floor' && f.tx === 2 && f.tz === 14)).toBe(true);
  });

  it('keeps the north corridor open at (2,8) into the hall at (2,7)', () => {
    const faces = enumerateFaces(floor1Map);
    expect(isWalkableTile(tileAt(floor1Map, 2, 8))).toBe(true);
    expect(isWalkableTile(tileAt(floor1Map, 2, 7))).toBe(true);
    expect(faces.some((f) => f.tx === 2 && f.tz === 8 && f.face === 'N')).toBe(false);
    expect(faces.some((f) => f.kind === 'floor' && f.tx === 2 && f.tz === 7)).toBe(true);
  });
});

describe('knot carving is a placed wall variant, not a secret', () => {
  it('puts 1–2 knot faces on solid walls away from secrets', () => {
    expect(floor1KnotWalls.length).toBeGreaterThanOrEqual(1);
    expect(floor1KnotWalls.length).toBeLessThanOrEqual(2);
    for (const spec of floor1KnotWalls) {
      expect(isTrueWall(tileAt(floor1Map, spec.x, spec.y))).toBe(true);
      expect(tileAt(floor1Map, spec.x, spec.y)?.secret).toBeFalsy();
      expect(knotBesideSecret(floor1Map, spec.x, spec.y)).toBe(false);
      const view = knotWallViewer(spec);
      expect(isWalkableTile(tileAt(floor1Map, view.x, view.y))).toBe(true);
      expect(knotWallFile(spec.x, spec.y, spec.face)).toBe(KNOT_WALL_FILE);
    }
  });

  it('emits secret_closed.png only on those placed faces', () => {
    const faces = enumerateFaces(floor1Map);
    const knots = faces.filter((f) => f.file === KNOT_WALL_FILE);
    expect(knots.length).toBe(floor1KnotWalls.length);
    for (const spec of floor1KnotWalls) {
      expect(
        knots.some((f) => f.kind === 'wall' && f.wallX === spec.x && f.wallY === spec.y && f.wallFace === spec.face)
      ).toBe(true);
    }
    for (const secret of listSecrets()) {
      expect(knots.some((f) => f.wallX === secret.x && f.wallY === secret.y)).toBe(false);
    }
  });
});

describe('wall variants match the game hash', () => {
  it('uses the same FNV pick as proto3d', () => {
    for (const face of ['N', 'E', 'S', 'W'] as const) {
      expect(pickVariantIndex(WALL_VARIANTS.length, 1, 14, face)).toBe(
        gamePick(WALL_VARIANTS.length, 1, 14, face)
      );
    }
  });
});

describe('game-centered tiles line up with Classic wall planes', () => {
  it('puts a west wall of (2,14) at x = 3', () => {
    const pose = tileFlatPose('W', 2, 14, CELL, 'center');
    expect(pose.x).toBeCloseTo(2 * CELL - CELL / 2, 8);
    expect(pose.z).toBeCloseTo(14 * CELL, 8);
    const { ox, oz } = tileCorner(3, 14, CELL, 'center');
    expect(ox).toBeCloseTo(3 * CELL - CELL / 2, 8);
    expect(oz).toBeCloseTo(14 * CELL - CELL / 2, 8);
  });

  it('eases the same as proto3d', () => {
    expect(easeInOutQuad(0)).toBe(0);
    expect(easeInOutQuad(1)).toBe(1);
    expect(easeInOutQuad(0.5)).toBeCloseTo(0.5, 8);
  });
});
