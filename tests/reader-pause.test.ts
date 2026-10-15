import { execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { CombatEngine, parseRules, Rng } from '../src/core';
import { SLIME_SMALL_STAGGER_SEC } from '../src/core/slime-pair';
import {
  GameClock,
  NOTE_READER_DUCK_CLOSE_SEC,
  NOTE_READER_DUCK_DB,
  NOTE_READER_DUCK_OPEN_SEC,
  dbToGain,
  isMonsterReaderSfx,
  isUnstartedSfx,
  remainingUntil
} from '../src/proto3d/reader-pause';

const mainSrc = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
const audioSrc = readFileSync(resolve(__dirname, '../src/proto3d/audio.ts'), 'utf8');
const actions = JSON.parse(readFileSync(resolve('public/levels/actions.json'), 'utf8'));
const monsters = JSON.parse(readFileSync(resolve('public/levels/monsters.json'), 'utf8'));
const rules = parseRules(actions, monsters);

describe('reader pause clock', () => {
  it('freezes hero recovery remaining across a pause', () => {
    const clock = new GameClock();
    const openAt = 10_000;
    const recoveryUntil = clock.nowSec(openAt) + 2.4;
    const before = remainingUntil(recoveryUntil, clock.nowSec(openAt));
    clock.pause(openAt);
    expect(remainingUntil(recoveryUntil, clock.nowSec(openAt + 8000))).toBeCloseTo(before);
    clock.resume(openAt + 8000);
    expect(remainingUntil(recoveryUntil, clock.nowSec(openAt + 8000))).toBeCloseTo(before);
    expect(remainingUntil(recoveryUntil, clock.nowSec(openAt + 8400))).toBeCloseTo(before - 0.4);
  });

  it('keeps slime stagger and spell cooldown remaining after closing', () => {
    const e = new CombatEngine(rules, new Rng(1));
    const clock = new GameClock();
    const t0 = 4_000;
    const now = clock.nowSec(t0);
    e.heroes.ilsevar.recovery.main = now + 1.5;
    e.heroes.wren.recovery.off = now + 5;
    const left = e.spawnMonster('slime_small', 1, 0, 4, { pairSlot: 'left', pairId: 'p' });
    const right = e.spawnMonster('slime_small', 1, 0, 4, { pairSlot: 'right', pairId: 'p' });
    left.nextAttackAt = now + 0.2;
    right.nextAttackAt = left.nextAttackAt + SLIME_SMALL_STAGGER_SEC;
    const recMain = remainingUntil(e.heroes.ilsevar.recovery.main, now);
    const recOff = remainingUntil(e.heroes.wren.recovery.off, now);
    const stagger = remainingUntil(right.nextAttackAt, now);
    clock.pause(t0);
    clock.resume(t0 + 12_000);
    const after = clock.nowSec(t0 + 12_000);
    expect(remainingUntil(e.heroes.ilsevar.recovery.main, after)).toBeCloseTo(recMain);
    expect(remainingUntil(e.heroes.wren.recovery.off, after)).toBeCloseTo(recOff);
    expect(remainingUntil(right.nextAttackAt, after)).toBeCloseTo(stagger);
    expect(stagger).toBeCloseTo(0.2 + SLIME_SMALL_STAGGER_SEC);
  });

  it('does not tick combat while the reader is open and resumes without a burst', () => {
    expect(mainSrc).toContain('this.gameClock.pause()');
    expect(mainSrc).toContain('this.gameClock.resume()');
    expect(mainSrc).toMatch(/const paused = this\.noteOpen \|\| this\.gameClock\.paused/);
    expect(mainSrc).toMatch(/if \(!paused\)[\s\S]*this\.combat\.tick\(this\.nowSec\(\)\)/);
    expect(mainSrc).toContain('this.hud?.draw(this.nowMs())');
    expect(mainSrc).toContain('held: this.noteOpen');
    expect(mainSrc).toContain('flushHeldCombatLogs');
  });
});

describe('reader bed duck and monster sfx hold', () => {
  it('ramps one shared gain by -4 dB over 0.2s and back over 0.3s', () => {
    expect(NOTE_READER_DUCK_DB).toBe(4);
    expect(NOTE_READER_DUCK_OPEN_SEC).toBe(0.2);
    expect(NOTE_READER_DUCK_CLOSE_SEC).toBe(0.3);
    expect(dbToGain(-NOTE_READER_DUCK_DB)).toBeCloseTo(10 ** (-4 / 20));
    expect(audioSrc).toContain('linearRampToValueAtTime');
    expect(audioSrc).toContain('ensureBedDuck');
    expect(audioSrc).toContain('routeThroughBedDuck');
    expect(audioSrc).toContain('NOTE_READER_DUCK_OPEN_SEC');
    expect(audioSrc).toContain('NOTE_READER_DUCK_CLOSE_SEC');
    expect(audioSrc).not.toMatch(/setReaderOpen[\s\S]{0,400}setVolume\(/);
  });

  it('cancels unstarted monster voices and leaves playing ones', () => {
    expect(isUnstartedSfx(1.0, 2.25)).toBe(true);
    expect(isUnstartedSfx(2.25, 2.25)).toBe(false);
    expect(isUnstartedSfx(2.26, 2.25)).toBe(false);
    expect(isMonsterReaderSfx('slime_small_attack')).toBe(true);
    expect(isMonsterReaderSfx('keep_rat_alert')).toBe(true);
    expect(isMonsterReaderSfx('sting_slime_lair')).toBe(true);
    expect(isMonsterReaderSfx('act_axe')).toBe(false);
    expect(audioSrc).toContain('cancelUnstartedMonsterSfx');
    expect(audioSrc).toContain('src.start(startAt)');
    expect(audioSrc).toMatch(/setReaderOpen\([\s\S]*cancelUnstartedMonsterSfx/);
  });
});

describe('reader public leak and ΰ glyph', () => {
  it('keeps make_parchment.py out of public/', () => {
    expect(existsSync(resolve(__dirname, '../tools/art/make_parchment.py'))).toBe(true);
    expect(existsSync(resolve(__dirname, '../public/art/ui/reader/make_parchment.py'))).toBe(false);
  });

  it('has a blank row between ΰ dialytika and the υ body', () => {
    const script = `
from PIL import Image
import json
g = json.load(open('public/art/font/font_5x7.json'))['glyphs']['ΰ']
im = Image.open('public/art/font/font_5x7.png').convert('RGBA')
x, y = g['x'], g['y']
ink = [any(im.getpixel((x+c, y+r))[3] > 80 for c in range(5)) for r in range(9)]
assert ink[0] and ink[1] and not ink[2] and ink[3], ink
print('ok', ''.join('#' if v else '.' for v in ink))
`;
    const out = execFileSync('python3', ['-c', script], { encoding: 'utf8' });
    expect(out).toContain('ok');
  });
});
