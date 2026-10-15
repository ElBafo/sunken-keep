import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('bark voice and capped-lamp log', () => {
  const audio = readFileSync(resolve(__dirname, '../src/proto3d/audio.ts'), 'utf8');
  const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
  const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

  it('plays vox_<hero>_talk for party speakers and quiet bark for everyone else', () => {
    const fn = audio.slice(audio.indexOf('playBarkVoice'), audio.indexOf('playHeroHurt'));
    expect(fn).toContain('vox_${speaker}_talk');
    expect(fn).toContain('HERO_IDS');
    expect(fn).toMatch(/playUi\('bark',\s*0\.4\)/);
    expect(fn).not.toContain('hurt');
  });

  it('does not use hurt clips for speakBark', () => {
    expect(main).toContain('playBarkVoice(picked.speaker)');
    expect(main).not.toMatch(/speakBark[\s\S]{0,400}playHeroHurt/);
  });

  it('logs torch_capped instead of using the centre overlay', () => {
    expect(main).toContain("showMessage(this.storyLog('torch_capped'))");
    expect(main).not.toContain("showPrompt(this.storyLog('torch_capped'))");
    expect(main).toContain("this.speakBark('deep_water')");
  });

  it('presses Skip with a 1px translateY and does not CSS-fetch the stone strip', () => {
    expect(html).toContain('.intro-skip:active { transform: translateY(1px); }');
    expect(html).not.toMatch(/url\([^)]*stone_strip_tile/);
  });
});
