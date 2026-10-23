import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { missingFontGlyphs, measureFontWidth, wrapFontToWidth, type FontGlyphs } from '../src/proto3d/font5x7';

const titleSrc = readFileSync(resolve(__dirname, '../src/proto3d/title.ts'), 'utf8');
const index = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const voxel = readFileSync(resolve(__dirname, '../voxel-floor1.html'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../public/story/title_text.json'), 'utf8')) as {
  tagline: string;
  buttons: Record<string, string>;
  overwrite: Record<string, string>;
};
const el = JSON.parse(readFileSync(resolve(__dirname, '../public/story/el/title_text.el.json'), 'utf8')) as {
  tagline: string;
  buttons: Record<string, string>;
  overwrite: Record<string, string>;
};
const enUi = JSON.parse(readFileSync(resolve(__dirname, '../public/story/ui_text.json'), 'utf8')) as {
  step4_title_saves: { buttons: { save: string } };
};
const elUi = JSON.parse(readFileSync(resolve(__dirname, '../public/story/el/ui_text.el.json'), 'utf8')) as {
  step4_title_saves: { buttons: { save: string } };
};
const glyphs = (
  JSON.parse(readFileSync(resolve(__dirname, '../public/art/font/font_5x7.json'), 'utf8')) as { glyphs: FontGlyphs }
).glyphs;

const STAGE = 270;
const BUTTON_W = 140;
const OVERWRITE_W = 220;

function labels(pack: { tagline: string; buttons: Record<string, string>; overwrite: Record<string, string> }, save: string) {
  return [
    pack.tagline,
    pack.buttons.continue,
    pack.buttons.new_game,
    pack.buttons.load,
    pack.buttons.back,
    'EN',
    'EL',
    save,
    pack.overwrite.title,
    pack.overwrite.body,
    pack.overwrite.yes,
    pack.overwrite.no
  ];
}

describe('title and save menus use the 5×7 pixel font', () => {
  it('paints tagline, buttons, and save/load headers with the atlas, never serif', () => {
    expect(titleSrc).toContain('drawFont5x7');
    expect(titleSrc).toContain('paintPixelText');
    expect(titleSrc).toContain('wrapFontToWidth');
    expect(titleSrc).toContain('preloadTitleFont');
    expect(titleSrc).not.toMatch(/px serif/);
    expect(titleSrc).not.toContain("ctx.fillText(tag");
    expect(titleSrc).not.toContain('ctx.fillText(label');
    expect(titleSrc).not.toContain('ctx.fillText(heading');
  });

  it('preloads the font on / and voxel-floor1.html so iPhone does not flash a fallback', () => {
    expect(index).toMatch(/rel="preload"[^>]+font_5x7\.png/);
    expect(index).toMatch(/rel="preload"[^>]+font_5x7\.json/);
    expect(voxel).toMatch(/rel="preload"[^>]+font_5x7\.png/);
    expect(voxel).toMatch(/rel="preload"[^>]+font_5x7\.json/);
    expect(voxel).not.toContain('%BASE_URL%');
  });

  it('keeps English and Greek title copy in the atlas and wrapping inside the 270 stage', () => {
    const enSave = enUi.step4_title_saves.buttons.save;
    const elSave = elUi.step4_title_saves.buttons.save;
    for (const text of [...labels(en, enSave), ...labels(el, elSave)]) {
      expect(missingFontGlyphs(text, glyphs), text).toEqual([]);
    }
    for (const [text, max] of [
      [en.tagline, STAGE - 16],
      [el.tagline, STAGE - 16],
      [en.buttons.new_game, BUTTON_W - 8],
      [el.buttons.new_game, BUTTON_W - 8],
      [en.buttons.continue, BUTTON_W - 8],
      [el.buttons.continue, BUTTON_W - 8],
      [enSave, STAGE - 16],
      [elSave, STAGE - 16],
      [en.buttons.back, BUTTON_W - 8],
      [el.buttons.back, BUTTON_W - 8],
      [en.overwrite.body, OVERWRITE_W - 16],
      [el.overwrite.body, OVERWRITE_W - 16]
    ] as const) {
      const scale = measureFontWidth(text, glyphs, 6, 2) <= max ? 2 : 1;
      const lines = wrapFontToWidth(text, max, glyphs, 6, scale);
      expect(lines.join('').replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
      for (const line of lines) {
        expect(measureFontWidth(line, glyphs, 6, scale)).toBeLessThanOrEqual(max);
      }
    }
  });
});
