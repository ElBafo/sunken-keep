import { describe, expect, it } from 'vitest';
import spec from '../public/proto3d/camera.json';
import { CAMERA_FOV, CAMERA_VIEW, MONSTER_OFFSET_TOWARD_PARTY } from '../src/proto3d/constants';
import { gameStageScale } from '../src/proto3d/game-stage';

describe('camera.json monster offset heights', () => {
  it('keeps 80° FOV, 270×380 view, and a quarter-square visual offset', () => {
    expect(spec.fov).toBe(80);
    expect(CAMERA_FOV).toBe(80);
    expect(spec.view).toEqual([270, 380]);
    expect(CAMERA_VIEW).toEqual([270, 380]);
    expect(spec.monsterOffsetTowardParty).toBe(0.25);
    expect(MONSTER_OFFSET_TOWARD_PARTY).toBe(0.25);

    const f = 380 / 2 / Math.tan((80 / 2) * (Math.PI / 180));
    for (const n of [1, 2, 3, 4] as const) {
      const z = (n + spec.backOffsetTiles - spec.monsterOffsetTowardParty) * spec.cellSize;
      const unit = spec.unitSpriteHeightPx[String(n) as '1' | '2' | '3' | '4'];
      const wall = spec.wallSpriteHeightPx[String(n) as '1' | '2' | '3' | '4'];
      expect(unit).toBeCloseTo(f / z, 1);
      expect(wall).toBeCloseTo((2 * f) / z, 1);
    }
  });
});

describe('270×585 stage scale', () => {
  it('snaps to whole device pixels and letterboxes short Safari', () => {
    expect(gameStageScale(393, 659, 3)).toBe(1);
    expect(gameStageScale(393, 852, 3)).toBeCloseTo(4 / 3, 5);
  });
});
