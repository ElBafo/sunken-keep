import { describe, expect, it } from 'vitest';
import { enterPlayFromIntro, INTRO_SKIP_MIN_TAP_PX } from '../src/proto3d/intro-skip';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('intro skip copy and tap size', () => {
  it('uses ui_text intro.skip in English and Greek', () => {
    const en = JSON.parse(readFileSync(resolve(__dirname, '../public/story/ui_text.json'), 'utf8')) as {
      intro: { skip: string };
    };
    const el = JSON.parse(readFileSync(resolve(__dirname, '../public/story/el/ui_text.el.json'), 'utf8')) as {
      intro: { skip: string };
    };
    expect(en.intro.skip).toBe('Skip');
    expect(el.intro.skip).toBe('Παράλειψη');
    expect(INTRO_SKIP_MIN_TAP_PX).toBeGreaterThanOrEqual(44);
  });

  it('Skip and a finished reel both enter play through skipIntro() with no extra tap', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(src).toContain('onSkip: () => this.skipIntro()');
    expect(src).toContain('setOnFinished(() => this.skipIntro())');
    expect(src).toContain('enterPlayFromIntro(');

    function runPath() {
      const intro = {
        shown: true,
        classList: { remove(name: string) { if (name === 'show') intro.shown = false; } }
      };
      const tap = {
        hidden: false,
        classList: { add(name: string) { if (name === 'hidden') tap.hidden = true; } }
      };
      let play = 0;
      enterPlayFromIntro({
        hideSkip() {},
        introOverlay: intro,
        tapToStart: tap,
        alreadyPlaying: false,
        beginPlay: () => {
          play += 1;
        }
      });
      return { introShown: intro.shown, tapHidden: tap.hidden, play };
    }

    const skipped = runPath();
    const finished = runPath();
    for (const result of [skipped, finished]) {
      expect(result.introShown, 'intro overlay dismissed').toBe(false);
      expect(result.tapHidden, 'tap-to-start not required').toBe(true);
      expect(result.play, 'entered play once').toBe(1);
    }
  });

  it('places the Skip button in the top-right corner with a 44px tap target', () => {
    const css = readFileSync(resolve(__dirname, '../proto3d.html'), 'utf8');
    const block = css.slice(css.indexOf('.intro-skip'), css.indexOf('.intro-skip[hidden]'));
    expect(block).toMatch(/top:\s*12px/);
    expect(block).toMatch(/right:\s*12px/);
    expect(block).toMatch(/min-width:\s*44px/);
    expect(block).toMatch(/min-height:\s*44px/);
    expect(block).not.toMatch(/bottom:\s*18px/);
  });
});
