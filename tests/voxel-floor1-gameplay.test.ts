import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { INTRO_SKIP_MIN_TAP_PX } from '../src/proto3d/intro-skip';
import { wrapLogMessage } from '../src/voxel-floor1/portrait-layout';
import { floor1BarkAt, HERO_HURT_STEMS, parseGameplayFlags } from '../src/voxel-floor1/gameplay';
import { floor1Map, tileAt } from '../src/voxel-floor1/layout';

type BarkRow = { trigger: string; speaker: string; text: string };

const html = readFileSync(resolve(__dirname, '../voxel-floor1.html'), 'utf8');
const gameplay = readFileSync(resolve(__dirname, '../src/voxel-floor1/gameplay.ts'), 'utf8');
const main = readFileSync(resolve(__dirname, '../src/voxel-floor1/main.ts'), 'utf8');
const index = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const protoMain = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
const barks = JSON.parse(readFileSync(resolve(__dirname, '../public/barks.json'), 'utf8')) as BarkRow[];
const log = JSON.parse(readFileSync(resolve(__dirname, '../public/log.json'), 'utf8')) as Array<{
  key: string;
  text: string;
}>;

describe('voxel floor 1 intro / audio / bark port', () => {
  it('reuses Classic intro, title, audio, and bark modules instead of copying them', () => {
    expect(gameplay).toContain("from '../proto3d/intro'");
    expect(gameplay).toContain("from '../proto3d/intro-skip'");
    expect(gameplay).toContain("from '../proto3d/title'");
    expect(gameplay).toContain("from '../proto3d/audio'");
    expect(gameplay).toContain("from '../proto3d/floor1-sounds'");
    expect(gameplay).toContain("from '../proto3d/bark-picker'");
    expect(HERO_HURT_STEMS.join(' ')).toMatch(/brannoc/);
    expect(HERO_HURT_STEMS.join(' ')).toMatch(/wren/);
    expect(HERO_HURT_STEMS.join(' ')).toMatch(/ilsevar/);
    expect(HERO_HURT_STEMS.join(' ')).toMatch(/mags/);
    expect(gameplay).toContain("from '../proto3d/i18n'");
    expect(gameplay).toContain("from '../proto3d/story-progress'");
    expect(gameplay).toContain('enterPlayFromIntro');
    expect(gameplay).toContain('mountIntroSkip');
    expect(gameplay).toContain('crossfadeToIntro');
    expect(gameplay).toContain('playHeroHurt');
    expect(gameplay).toContain('playHeroDown');
    expect(gameplay).toContain('startFloorLoops');
    expect(gameplay).toContain("import.meta.env.BASE_URL");
    expect(main).not.toContain("from '../proto3d/");
    expect(index).not.toContain('voxel-floor1/gameplay');
    expect(protoMain).not.toContain('voxel-floor1/gameplay');
  });

  it('skips the intro chrome for ?test=1 so existing floor walk tests stay playable', () => {
    expect(parseGameplayFlags('?test=1')).toEqual({ skipChrome: true, showTitle: false });
    expect(parseGameplayFlags('?test=1&title=1')).toEqual({ skipChrome: false, showTitle: true });
    expect(parseGameplayFlags('')).toEqual({ skipChrome: false, showTitle: false });
    expect(gameplay).toContain("q.get('test') === '1'");
  });

  it('keeps the Classic Skip control on the intro overlay', () => {
    expect(html).toContain('id="intro-overlay"');
    expect(html).toContain('id="intro-canvas"');
    expect(html).toContain('id="tap-to-start"');
    const block = html.slice(html.indexOf('.intro-skip'), html.indexOf('.intro-skip[hidden]'));
    expect(block).toMatch(/top:\s*12px/);
    expect(block).toMatch(/right:\s*12px/);
    expect(block).toMatch(/min-width:\s*44px/);
    expect(block).toMatch(/min-height:\s*44px/);
    expect(INTRO_SKIP_MIN_TAP_PX).toBeGreaterThanOrEqual(44);
    expect(gameplay).toContain('onSkip: () => this.skipIntro()');
    expect(gameplay).toContain('setOnFinished(() => this.skipIntro())');
  });

  it('walks onto the first floor-1 bark tile with the full Mags line', () => {
    expect(tileAt(floor1Map, 2, 9)?.bark).toBe('f1_start');
    expect(floor1BarkAt(2, 9)).toBe('f1_start');
    expect(floor1BarkAt(3, 14)).toBeUndefined();
    const line = barks.find((row) => row.trigger === 'f1_start');
    expect(line?.speaker).toBe('mags');
    expect(line?.text).toBe('Tam went in last spring. If he\'s in here, I\'m finding him.');
    const wrapped = wrapLogMessage(`Mags: ${line!.text}`, 28);
    expect(wrapped.join('')).not.toMatch(/\.\.\.|…/);
    expect(wrapped.join('').replace(/\s+/g, '')).toBe(`Mags:${line!.text}`.replace(/\s+/g, ''));
    const enter = log.find((row) => row.key === 'enter_floor1');
    expect(enter?.text).toMatch(/upper halls/i);
    expect(gameplay).toContain("fire('enter_floor1')");
    expect(gameplay).toContain('this.hooks?.pushLog(line)');
  });

  it('does not touch Classic pages or voxel water / floor overlay files', () => {
    expect(gameplay).not.toContain("from './water'");
    expect(gameplay).not.toContain('water-decals');
    expect(main).toContain("from './water'");
    expect(index).toContain('src="/src/proto3d/main.ts"');
  });
});
