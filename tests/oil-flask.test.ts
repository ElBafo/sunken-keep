import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { OIL_FLASK, OIL_MAX } from '../src/proto3d/constants';
import { oilFlaskPlan, OIL_FLASK_FADE_AT, OIL_FLASK_FADE_SEC, OIL_FLASK_GLUGS } from '../src/proto3d/oil-flask';

describe('oil flask', () => {
  it('fills two bars, one glug when nearly full, and refuses at 4', () => {
    expect(OIL_FLASK).toBe(2);
    expect(OIL_FLASK_GLUGS).toEqual([0.051, 0.351]);
    expect(oilFlaskPlan(0)).toEqual({
      kind: 'use',
      from: 0,
      to: 2,
      glugs: [0.051, 0.351],
      fadeAt: null
    });
    expect(oilFlaskPlan(2)).toEqual({
      kind: 'use',
      from: 2,
      to: 4,
      glugs: [0.051, 0.351],
      fadeAt: null
    });
    expect(oilFlaskPlan(3)).toEqual({
      kind: 'use',
      from: 3,
      to: OIL_MAX,
      glugs: [0.051],
      fadeAt: OIL_FLASK_FADE_AT
    });
    expect(oilFlaskPlan(4)).toEqual({ kind: 'full' });
    expect(OIL_FLASK_FADE_AT).toBe(0.28);
    expect(OIL_FLASK_FADE_SEC).toBe(0.05);
  });

  it('plays sfx_oil_flask, not the lantern refill sting', () => {
    const audio = readFileSync(resolve(__dirname, '../src/proto3d/audio.ts'), 'utf8');
    expect(audio).toContain("playUi('oil_flask')");
    expect(audio).not.toMatch(/playOilFlask[\s\S]*lantern_refill/);
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(main).toContain('playOilFlask');
    expect(main).toContain('oil_full');
  });

  it('keeps Pell’s flask as the only oil on floor 1', () => {
    const floor = readFileSync(resolve(__dirname, '../public/levels/floor1.ts'), 'utf8');
    const flasks = [...floor.matchAll(/item:\s*'oil_flask'/g)];
    expect(flasks).toHaveLength(1);
    expect(floor).toContain("item: 'oil_flask'");
  });
});
