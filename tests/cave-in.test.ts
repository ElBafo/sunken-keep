import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAVE_IN_BARK2_DELAY_MS,
  CAVE_IN_CRASH_AT,
  CAVE_IN_DUST_SKIP_FRAME,
  CAVE_IN_SKIP_FADE_SEC,
  CAVE_IN_STATE,
  CAVE_IN_TURN_SEC,
  CaveInDirector,
  caveInCrashed,
  caveInFinished,
  caveInTurnT,
  dustBurstFrame,
  easeOutQuad
} from '../src/proto3d/cave-in';
import { floor1, floor1CaveIn } from '../src/proto3d/floor-data';

describe('floor 1 cave-in', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts west of the crash square and turns east after the rubble', () => {
    expect(floor1.startX).toBe(3);
    expect(floor1.startY).toBe(14);
    expect(floor1.startDir).toBe(3);
    expect(floor1CaveIn).toMatchObject({
      at: { x: 3, y: 14 },
      stepTo: { x: 2, y: 14 },
      rubble: { x: 3, y: 14 },
      endDir: 1,
      state: CAVE_IN_STATE,
      bark: 'opening_cavein'
    });
    expect(floor1.tiles[14][3].trigger).toBe('cave_in');
  });

  it('crashes at 1.2s then eases the turn out over 0.45s', () => {
    expect(CAVE_IN_CRASH_AT).toBe(1.2);
    expect(CAVE_IN_TURN_SEC).toBe(0.45);
    expect(caveInCrashed(1.19)).toBe(false);
    expect(caveInCrashed(1.2)).toBe(true);
    expect(caveInFinished(1.64)).toBe(false);
    expect(caveInFinished(1.65)).toBe(true);
    expect(caveInTurnT(1.2)).toBe(0);
    expect(caveInTurnT(1.65)).toBe(1);
    expect(caveInTurnT(1.425)).toBeCloseTo(easeOutQuad(0.5), 5);
  });

  it('picks dust frames from the crash and holds frame 5 for skip', () => {
    expect(dustBurstFrame(-0.01)).toBeNull();
    expect(dustBurstFrame(0)).toBe(1);
    expect(dustBurstFrame(0.2)).toBe(2);
    expect(dustBurstFrame(1.2)).toBe(CAVE_IN_DUST_SKIP_FRAME);
    expect(dustBurstFrame(1.6)).toBe(6);
    expect(dustBurstFrame(2)).toBeNull();
    expect(CAVE_IN_SKIP_FADE_SEC).toBe(0.3);
  });

  it('arms opening_cavein_2 only on the first run and clears it when leaving the game', () => {
    vi.useFakeTimers();
    const director = new CaveInDirector();
    const fire = vi.fn();
    expect(director.beginOpening(false)).toBe(true);
    director.scheduleBark2(fire, CAVE_IN_BARK2_DELAY_MS);
    expect(director.hasBark2Pending()).toBe(true);
    vi.advanceTimersByTime(CAVE_IN_BARK2_DELAY_MS);
    expect(fire).toHaveBeenCalledOnce();

    fire.mockClear();
    expect(director.beginOpening(true)).toBe(false);
    director.scheduleBark2(fire);
    expect(director.hasBark2Pending()).toBe(false);

    director.beginOpening(false);
    director.scheduleBark2(fire);
    director.clearLeaveScreen();
    vi.advanceTimersByTime(CAVE_IN_BARK2_DELAY_MS);
    expect(fire).not.toHaveBeenCalled();
  });

  it('wires skip, rubble, and leave-screen into the play loop', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(src).toContain('skipCaveIn()');
    expect(src).toContain('maybeStartCaveIn');
    expect(src).toContain('leaveGameScreen()');
    expect(src).toContain('applyRubbleWall');
    expect(src).toContain('playCaveIn()');
    expect(src).toContain('opening_cavein_2');
  });
});
