import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { titleBootRelPaths } from '../src/proto3d/boot-assets';
import { INTRO_SHOT_FILES } from '../src/proto3d/intro';
import { createLimiter, mapPool, SPRITE_LOAD_CONCURRENCY } from '../src/proto3d/load-pool';

describe('mapPool / createLimiter', () => {
  it('runs at most `limit` workers at once and keeps order', async () => {
    let inflight = 0;
    let peak = 0;
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const out = await mapPool(items, 3, async (n) => {
      inflight += 1;
      peak = Math.max(peak, inflight);
      await Promise.resolve();
      inflight -= 1;
      return n * 10;
    });
    expect(out).toEqual(items.map((n) => n * 10));
    expect(peak).toBeLessThanOrEqual(3);
    expect(SPRITE_LOAD_CONCURRENCY).toBeGreaterThan(1);
    expect(SPRITE_LOAD_CONCURRENCY).toBeLessThanOrEqual(12);
  });

  it('caps concurrent limiter jobs', async () => {
    const limit = createLimiter(2);
    let inflight = 0;
    let peak = 0;
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        limit(async () => {
          inflight += 1;
          peak = Math.max(peak, inflight);
          await Promise.resolve();
          inflight -= 1;
          return n;
        })
      )
    );
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('title boot asset list', () => {
  it('lists the title-first batch and no intro shots or monster frames', () => {
    const paths = titleBootRelPaths('en');
    expect(paths).toContain('art/ui/title/title_bg.png');
    expect(paths).toContain('art/ui/title/title_logo.png');
    expect(paths).toContain('art/ui/title/btn_normal.png');
    expect(paths).toContain('art/font/font_5x7.png');
    expect(paths).toContain('audio/music_menu_loop.mp3');
    expect(paths).toContain('audio/sfx_ui_button.mp3');
    expect(paths).toContain('audio/sfx_ui_button_denied.mp3');
    expect(paths.some((p) => p.includes('intro/shot'))).toBe(false);
    expect(paths.some((p) => p.includes('music_intro'))).toBe(false);
    expect(paths.some((p) => p.includes('monsters'))).toBe(false);
    expect(paths).toHaveLength(17);
  });

  it('uses the Greek logo and el text files for el', () => {
    const paths = titleBootRelPaths('el');
    expect(paths).toContain('art/ui/title/title_logo_el.png');
    expect(paths).toContain('story/el/ui_text.el.json');
    expect(paths).not.toContain('art/ui/title/title_logo.png');
  });

  it('keeps the pre-tap payload far under the old 2.8 MB dump', () => {
    const root = resolve(__dirname, '../public');
    let bytes = 0;
    for (const rel of titleBootRelPaths('en')) {
      const st = statSync(resolve(root, rel));
      expect(st.size).toBeGreaterThan(0);
      bytes += st.size;
    }
    expect(bytes).toBeLessThan(800_000);
    expect(bytes).toBeGreaterThan(400_000);
  });

  it('reads Loading and tap_to_start from the existing EN/EL files', () => {
    const en = JSON.parse(readFileSync(resolve(__dirname, '../public/story/ui_text.json'), 'utf8')) as {
      step4_title_saves: { status: { loading: string }; tap_to_start: string };
    };
    const el = JSON.parse(readFileSync(resolve(__dirname, '../public/story/el/ui_text.el.json'), 'utf8')) as {
      step4_title_saves: { status: { loading: string }; tap_to_start: string };
    };
    expect(en.step4_title_saves.status.loading).toMatch(/Loading/);
    expect(en.step4_title_saves.tap_to_start).toMatch(/Tap to start/);
    expect(el.step4_title_saves.status.loading).toBeTruthy();
    expect(el.step4_title_saves.tap_to_start).toBeTruthy();
    expect(el.step4_title_saves.status.loading).not.toBe(en.step4_title_saves.status.loading);
  });

  it('keeps intro shots and music_intro out of the title-blocking batch', () => {
    const root = resolve(__dirname, '../public');
    const shotBytes = INTRO_SHOT_FILES.reduce((sum, file) => sum + statSync(resolve(root, 'art/intro', file)).size, 0);
    const shot1 = statSync(resolve(root, 'art/intro/shot1_keep.png')).size;
    const music = statSync(resolve(root, 'audio/music_intro.mp3')).size;
    expect(INTRO_SHOT_FILES).toHaveLength(6);
    expect(shot1).toBeGreaterThan(50_000);
    expect(shot1).toBeLessThan(120_000);
    expect(shotBytes).toBeGreaterThan(400_000);
    expect(shotBytes).toBeLessThan(600_000);
    expect(music).toBeGreaterThan(400_000);
    expect(music).toBeLessThan(500_000);
    expect(titleBootRelPaths('en')).not.toContain('audio/music_intro.mp3');
  });
});
