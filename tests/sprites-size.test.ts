import { describe, expect, it } from 'vitest';
import { MONSTER_OFFSET_TOWARD_PARTY } from '../src/proto3d/constants';
import { monsterLodName, monsterVisualOffset, quadForWorldHeight } from '../src/proto3d/sprites';

describe('monster billboard sizing', () => {
  it('picks close/near/mid/far by Chebyshev squares', () => {
    expect(monsterLodName(1, true)).toBe('close');
    expect(monsterLodName(1, false)).toBe('near');
    expect(monsterLodName(2, true)).toBe('near');
    expect(monsterLodName(3, true)).toBe('mid');
    expect(monsterLodName(4, true)).toBe('far');
    expect(monsterLodName(6, true)).toBe('far');
  });

  it('sizes the quad as worldHeight × wall, using that set’s pixel ratio', () => {
    const slimeClose = quadForWorldHeight(0.55, 2, 118, 82);
    expect(slimeClose.h).toBeCloseTo(1.1, 5);
    expect(slimeClose.w).toBeCloseTo(1.1 * (118 / 82), 5);

    const ratClose = quadForWorldHeight(0.25, 2, 42, 37);
    expect(ratClose.h).toBeCloseTo(0.5, 5);
    expect(ratClose.w).toBeCloseTo(0.5 * (42 / 37), 5);

    const crabClose = quadForWorldHeight(0.35, 2, 77, 52);
    expect(crabClose.h).toBeCloseTo(0.7, 5);
    expect(crabClose.w).toBeCloseTo(0.7 * (77 / 52), 5);

    const leechClose = quadForWorldHeight(0.15, 2, 37, 22);
    expect(leechClose.h).toBeCloseTo(0.3, 5);
    expect(leechClose.w).toBeCloseTo(0.3 * (37 / 22), 5);
  });

  it('offsets a quarter square toward the party at every distance', () => {
    expect(MONSTER_OFFSET_TOWARD_PARTY).toBe(0.25);
    expect(monsterVisualOffset(7, 2, 6, 2)).toEqual({ ox: -0.5, oz: 0 });
    expect(monsterVisualOffset(7, 2, 5, 2)).toEqual({ ox: -0.5, oz: 0 });
    expect(monsterVisualOffset(7, 2, 4, 2)).toEqual({ ox: -0.5, oz: 0 });
    expect(monsterVisualOffset(5, 3, 6, 3)).toEqual({ ox: 0.5, oz: 0 });
  });
});
