import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  SLIME_PAIR_OFFSET_FRAC,
  SLIME_SMALL_FRAME_W,
  SLIME_SMALL_PAN,
  SLIME_SMALL_SFX_GAP_MS,
  SLIME_SMALL_STAGGER_SEC,
  livingPairVisual,
  slimePairShiftPx,
  slimeSmallPitchRate
} from '../src/core/slime-pair';

describe('slimeling pair layout and voices', () => {
  it('shifts each piece 0.55 of its own frame width (~45/25/18/14 px)', () => {
    expect(SLIME_PAIR_OFFSET_FRAC).toBe(0.55);
    expect(Math.round(slimePairShiftPx('close'))).toBe(45);
    expect(Math.round(slimePairShiftPx('near'))).toBe(25);
    expect(Math.round(slimePairShiftPx('mid'))).toBe(18);
    expect(Math.round(slimePairShiftPx('far'))).toBe(14);
    expect(SLIME_SMALL_FRAME_W.close).toBe(82);
  });

  it('centres and unflips a lone survivor (restore / after mate death)', () => {
    const left = { id: 'slime_small-11', pairSlot: 'left' as const, pairId: 'slime-7' };
    const right = { id: 'slime_small-12', pairSlot: 'right' as const, pairId: 'slime-7', alive: false };
    expect(livingPairVisual(left, [left, right])).toEqual({ pairSlot: undefined, pairSlide: 0 });
    expect(livingPairVisual(left, [left, { ...right, alive: true }])).toEqual({
      pairSlot: 'left',
      pairSlide: 1
    });
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(main).toContain('syncSlimelingPans');
    expect(main).toContain('livingPairVisual');
    expect(main).toContain('setSlimelingPan(m.id, visual.pairSlot ? SLIME_SMALL_PAN[visual.pairSlot] : 0)');
  });

  it('staggers the second timer by 1.25s and pans left/right', () => {
    expect(SLIME_SMALL_STAGGER_SEC).toBe(1.25);
    expect(SLIME_SMALL_PAN.left).toBe(-0.3);
    expect(SLIME_SMALL_PAN.right).toBe(0.3);
    expect(SLIME_SMALL_SFX_GAP_MS).toBe(100);
    expect(slimeSmallPitchRate(1)).toBeCloseTo(2 ** (1 / 12), 8);
  });

  it('plays slime_small_* by id with a semitone shift, stereo pan, and 100ms gap', () => {
    const audio = readFileSync(resolve(__dirname, '../src/proto3d/audio.ts'), 'utf8');
    expect(audio).toContain('slime_small_');
    expect(audio).toContain('createStereoPanner');
    expect(audio).toContain('SLIME_SMALL_SFX_GAP_MS');
    expect(audio).toContain('slimeSmallPitchRate');
    const sprites = readFileSync(resolve(__dirname, '../src/proto3d/sprites.ts'), 'utf8');
    expect(sprites).toContain('SLIME_PAIR_OFFSET_FRAC');
    expect(sprites).toContain("pairSlot === 'right'");
    expect(sprites).toContain('beginPairSlide');
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(main).toContain('SLIME_SMALL_PAN');
    expect(main).toContain('beginPairSlide');
    const deadCase = main.slice(main.indexOf("case 'monster_dead'"), main.indexOf("case 'slime_split'"));
    expect(deadCase).toContain('beginPairSlide');
    expect(deadCase).not.toContain('clearSlimelingPan(e.id)');
    expect(main).toContain("e.name.endsWith('_death')");
    expect(main).toContain('clearSlimelingPan(e.id)');
  });
});
