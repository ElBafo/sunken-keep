import { describe, expect, it } from 'vitest';
import { monsterLodName, quadForWorldHeight } from '../src/proto3d/sprites';

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

    const ratClose = quadForWorldHeight(0.2, 2, 37, 30);
    expect(ratClose.h).toBeCloseTo(0.4, 5);
    expect(ratClose.w).toBeCloseTo(0.4 * (37 / 30), 5);

    const leechClose = quadForWorldHeight(0.15, 2, 37, 22);
    expect(leechClose.h).toBeCloseTo(0.3, 5);
    expect(leechClose.w).toBeCloseTo(0.3 * (37 / 22), 5);
  });
});
