import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { floor1 } from '../src/proto3d/floor-data';

type UiStairs = {
  stairs: { floor2_soon: string; floor2_soon_short: string };
};

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(resolve(__dirname, '..', rel), 'utf8')) as T;
}

describe('floor 1 down-stairs coming-soon copy', () => {
  const en = readJson<UiStairs>('public/story/ui_text.json');
  const el = readJson<UiStairs>('public/story/el/ui_text.el.json');
  const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');

  it('uses localized ui_text, with a 41-char log sibling', () => {
    expect(en.stairs.floor2_soon).toBe('The stairs lead down into darkness... Floor 2 is coming soon.');
    expect(en.stairs.floor2_soon_short).toBe('Stairs into darkness. Floor 2 soon.');
    expect(el.stairs.floor2_soon).toBe('Οι σκάλες κατεβαίνουν στο σκοτάδι... Ο όροφος 2 έρχεται σύντομα.');
    expect(el.stairs.floor2_soon_short).toBe('Σκάλες στο σκοτάδι. Όροφος 2 σύντομα.');
    expect(en.stairs.floor2_soon_short.length).toBeLessThanOrEqual(41);
    expect(el.stairs.floor2_soon_short.length).toBeLessThanOrEqual(41);
  });

  it('is keyed off the stairs tile, not a hard-coded coordinate', () => {
    const downs: Array<{ x: number; y: number; stepUi?: string }> = [];
    for (let y = 0; y < floor1.height; y++) {
      for (let x = 0; x < floor1.width; x++) {
        if (floor1.tiles[y][x].stairs === 'down') {
          downs.push({ x, y, stepUi: floor1.tiles[y][x].stepUi as string | undefined });
        }
      }
    }
    expect(downs.length, 'one down-stairs square on floor 1').toBe(1);
    expect(downs[0].stepUi).toBe('stairs.floor2_soon');

    expect(main).toContain('fireTileStepUi');
    expect(main).toContain('tile?.stepUi');
    expect(main).toContain('`${path}_short`');
    expect(main).not.toMatch(/16\s*,\s*10/);
    expect(main).toContain('moveToX !== this.player.x');
    const stepUiFn = main.slice(main.indexOf('private fireTileStepUi'), main.indexOf('private fireTileTrigger'));
    expect(stepUiFn).not.toMatch(/flags|once/);
  });
});
