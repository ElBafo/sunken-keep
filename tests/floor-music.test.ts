import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('no background music on floors', () => {
  const audio = readFileSync(resolve(__dirname, '../src/proto3d/audio.ts'), 'utf8');
  const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');

  it('keeps act1 and slime-battle files on disk but never starts those loops', () => {
    expect(existsSync(resolve(__dirname, '../public/audio/music_act1_loop.mp3'))).toBe(true);
    expect(existsSync(resolve(__dirname, '../public/audio/music_slime_battle_loop.mp3'))).toBe(true);
    const ensure = audio.slice(audio.indexOf('private ensureAct1Music'), audio.indexOf('private startAmbienceIfReady'));
    expect(ensure).not.toContain('.play()');
    expect(ensure).toContain('music_act1_loop');
    const battle = audio.slice(audio.indexOf('startSlimeBattleLoop()'), audio.indexOf('stopSlimeBattleLoop()'));
    expect(battle).not.toContain('startBufferLoop');
    expect(audio).toContain('music_slime_battle_loop');
    expect(audio).toMatch(/syncSlimeLoops[\s\S]*stopSlimeBattleLoop\(\)/);
  });

  it('keeps the lair-door sting as SFX and ducks ambience under it', () => {
    expect(existsSync(resolve(__dirname, '../public/audio/sting_slime_lair.mp3'))).toBe(true);
    expect(audio).toContain('duckAmbienceForSting');
    expect(audio).toMatch(/playSting\(name: string\)[\s\S]*duckAmbienceForSting\(\)[\s\S]*playUi\(name\)/);
    expect(main).toContain("playSting('sting_slime_lair')");
    expect(main).not.toMatch(/fadeToPreStingSilence\([^)]*playSting/);
  });

  it('still plays title, intro, and does not touch ending/cutscene players', () => {
    expect(audio).toContain('playMenu()');
    expect(audio).toContain('crossfadeToIntro');
    expect(audio).toContain('menuSound.play()');
    expect(audio).toContain('introSound.play()');
  });
});
