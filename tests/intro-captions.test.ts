import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAPTION_CHAR_PX, CAPTION_MAX_CHARS, CAPTION_MAX_LINES, wrapCaption } from '../src/proto3d/font5x7';
import { floor1MonsterKinds, floor1PlayableRelPaths } from '../src/proto3d/floor1-prefetch';
import {
  captionTextAt,
  IntroPlayer,
  introShotIndex,
  INTRO_DURATION_SEC
} from '../src/proto3d/intro';
import type { StoryText } from '../src/proto3d/i18n';

const captions = JSON.parse(
  readFileSync(resolve(__dirname, '../public/story/intro_captions.json'), 'utf8')
) as {
  en: Array<{ id: string; start: number; end: number; text: string }>;
  el: Array<{ id: string; start: number; end: number; text: string }>;
};

function stubCanvas() {
  return {
    getContext: () => ({
      fillRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn()
    })
  } as unknown as HTMLCanvasElement;
}

function stubStory(locale: 'en' | 'el' = 'en'): StoryText {
  return { locale, log: (key: string) => key } as unknown as StoryText;
}

describe('intro captions file', () => {
  it('is served from story/intro_captions.json with en/el keys and no hardcoded intro_keep in log', () => {
    expect(existsSync(resolve(__dirname, '../public/story/intro_captions.json'))).toBe(true);
    const ids = ['intro_keep', 'intro_forges', 'intro_people', 'intro_fools'];
    expect(captions.en.map((c) => c.id)).toEqual(ids);
    expect(captions.el.map((c) => c.id)).toEqual(ids);
    const elKeep = captions.el.find((c) => c.id === 'intro_keep')!;
    expect(elKeep.text.length).toBe(51);
    const log = JSON.parse(readFileSync(resolve(__dirname, '../public/log.json'), 'utf8')) as Array<{
      key?: string;
    }>;
    expect(log.some((e) => e.key === 'intro_keep')).toBe(false);
  });
});

describe('wrapCaption', () => {
  it('wraps the 51-character Greek keep line at word boundaries into two 5×7 lines', () => {
    const text = captions.el.find((c) => c.id === 'intro_keep')!.text;
    expect(text.length).toBe(51);
    const lines = wrapCaption(text);
    expect(CAPTION_CHAR_PX).toBe(6);
    expect(CAPTION_MAX_CHARS).toBe(42);
    expect(CAPTION_MAX_LINES).toBe(2);
    expect(lines.length).toBe(2);
    expect(lines.every((l) => l.length <= 42)).toBe(true);
    expect(lines.join(' ')).toBe(text);
    expect(lines[0]).not.toMatch(/Όρκουβούλιαξε/);
  });

  it('keeps short English captions on one line', () => {
    const lines = wrapCaption('Its forges went cold.');
    expect(lines).toEqual(['Its forges went cold.']);
  });
});

describe('intro shot index', () => {
  const durations = [6, 6, 6, 6, 5, 6];

  it('stays on the last shot at and past the 35s end instead of jumping to shot 1', () => {
    expect(introShotIndex(durations, 0)).toBe(0);
    expect(introShotIndex(durations, 34.9)).toBe(5);
    expect(introShotIndex(durations, INTRO_DURATION_SEC)).toBe(5);
    expect(introShotIndex(durations, 40)).toBe(5);
    expect(durations.reduce((a, b) => a + b, 0)).toBe(INTRO_DURATION_SEC);
  });
});

describe('caption timing from music currentTime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('picks caption text from JSON times, not from story.log keys', () => {
    expect(captionTextAt(captions.en, 6.9)).toBe('');
    expect(captionTextAt(captions.en, 7)).toBe('Stonevow Keep sank in a single night.');
    expect(captionTextAt(captions.el, 8)).toBe(captions.el[0].text);
    expect(captionTextAt(captions.en, 12)).toBe('');
  });

  it('advances IntroPlayer time from the music clock instead of elapsed', () => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const intro = new IntroPlayer(stubCanvas(), stubStory());
    intro.setTimeSource(() => 8.25);
    intro.start();
    expect(intro.debugTick()).toBe(8.25);
    expect(intro.debugShotIndex()).toBe(1);
  });
});

describe('floor 1 playable prefetch list', () => {
  it('lists walls, floor 1 monsters, and before-play steps, not intro/title or streamed combat', () => {
    const paths = floor1PlayableRelPaths();
    expect(floor1MonsterKinds().sort()).toEqual(['bog_leeches', 'keep_rat', 'rust_crab', 'slime']);
    expect(paths.some((p) => p.includes('proto3d/tex3d/wall_plain'))).toBe(true);
    expect(paths.some((p) => p.includes('monsters_v2/keep_rat_idle_1_near.png'))).toBe(true);
    expect(paths).toContain('audio/sfx_step_1.mp3');
    expect(paths).toContain('audio/sfx_lantern_loop.mp3');
    expect(paths).toContain('audio/sfx_bump.mp3');
    expect(paths).not.toContain('audio/amb_flooded_halls_loop.mp3');
    expect(paths).not.toContain('audio/sfx_keep_rat_alert.mp3');
    expect(paths.some((p) => p.includes('art/intro/'))).toBe(false);
    expect(paths.some((p) => p.includes('music_intro'))).toBe(false);
    expect(paths.some((p) => p.includes('title_bg'))).toBe(false);
  });
});
