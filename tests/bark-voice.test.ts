import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isSilentLogKey } from '../src/proto3d/items';

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

  it('uses lamp_sealed for later taps on Pell\'s lamp, not torch_capped', () => {
    const fn = main.slice(main.indexOf('handleCappedLamp'), main.indexOf('wireTorchChoice'));
    expect(fn).toContain("storyLog('lamp_sealed')");
    expect(fn).toContain('silent:');
    expect(fn).toContain("speakBark(barkId)");
    expect(fn).not.toContain("torch_capped");
    const torchFn = main.slice(main.indexOf('handleFacingTorch'), main.indexOf('lightFacingTorch'));
    expect(torchFn).toContain("storyLog('torch_capped')");
  });

  it('ships lampkeeper_capped_lamp as a story bark and a silent lamp_sealed log', () => {
    const enBarks = JSON.parse(readFileSync(resolve(__dirname, '../public/barks.json'), 'utf8')) as Array<{
      trigger: string;
      tier?: string;
    }>;
    const elBarks = JSON.parse(
      readFileSync(resolve(__dirname, '../public/story/el/barks.el.json'), 'utf8')
    ) as Array<{ trigger: string; tier?: string }>;
    expect(enBarks.find((b) => b.trigger === 'lampkeeper_capped_lamp')?.tier).toBe('story');
    expect(elBarks.find((b) => b.trigger === 'lampkeeper_capped_lamp')?.tier).toBe('story');
    const enLogs = JSON.parse(readFileSync(resolve(__dirname, '../public/log.json'), 'utf8')) as Array<{
      key: string;
      text: string;
      silent?: boolean;
    }>;
    const elLogs = JSON.parse(
      readFileSync(resolve(__dirname, '../public/story/el/log.el.json'), 'utf8')
    ) as Array<{ key: string; text: string; silent?: boolean }>;
    expect(enLogs.find((e) => e.key === 'lamp_sealed')).toMatchObject({
      text: "Pell's lamp. Sealed tight. Not yet.",
      silent: true
    });
    expect(elLogs.find((e) => e.key === 'lamp_sealed')).toMatchObject({
      text: 'Η λάμπα του Πελ. Σφραγισμένη. Όχι ακόμα.',
      silent: true
    });
    expect(isSilentLogKey('lamp_sealed')).toBe(true);
    expect(isSilentLogKey('torch_capped')).toBe(false);
  });

  it('presses Skip with a 1px translateY and does not CSS-fetch the stone strip', () => {
    expect(html).toContain('.intro-skip:active { transform: translateY(1px); }');
    expect(html).not.toMatch(/url\([^)]*stone_strip_tile/);
  });
});
