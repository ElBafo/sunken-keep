import { describe, expect, it } from 'vitest';
import {
  BarkDirector,
  eligibleBarks,
  lineId,
  type BarkLine
} from '../src/proto3d/bark-picker';

const deepWater: BarkLine[] = [
  { trigger: 'deep_water', speaker: 'brannoc', text: 'Beard.', face: 'neutral', tier: 'flavour' },
  { trigger: 'deep_water', speaker: 'ilsevar', text: 'Bath.', face: 'neutral', tier: 'flavour' },
  {
    trigger: 'deep_water',
    speaker: 'mags',
    text: 'Carry me.',
    face: 'shocked',
    listener: 'brannoc',
    listenerFace: 'smirk',
    tier: 'flavour'
  }
];

const party = [
  { id: 'brannoc', hp: 45 },
  { id: 'wren', hp: 32 },
  { id: 'ilsevar', hp: 24 },
  { id: 'mags', hp: 28 }
];

describe('bark picker', () => {
  it('never lets a hero speak another hero\'s line', () => {
    const seq = [0.9, 0.1, 0.5];
    let i = 0;
    const director = new BarkDirector(
      { flavour_gap_s: 0, flavour_min_interval_s: 0, min_gap_s: 0 },
      () => seq[i++ % seq.length]
    );
    const first = director.pick('deep_water', deepWater, {
      nowMs: 0,
      party,
      flags: new Set(),
      skipRateLimits: true
    });
    expect(first?.speaker).toBe(first && deepWater.find((l) => l.text === first.text)?.speaker);
    const forced = director.pick('deep_water', deepWater, {
      nowMs: 1,
      party,
      flags: new Set(),
      forcedSpeaker: 'ilsevar',
      skipRateLimits: true
    });
    expect(forced?.speaker).toBe('ilsevar');
    expect(forced?.text).toBe('Bath.');
    expect(forced?.face).toBe('neutral');
  });

  it('drops lines whose speaker or listener is downed', () => {
    const downedBrannoc = party.map((h) => (h.id === 'brannoc' ? { ...h, hp: 0, downed: true } : h));
    const ok = eligibleBarks(deepWater, { nowMs: 0, party: downedBrannoc, flags: new Set() });
    expect(ok.map((l) => l.speaker)).toEqual(['ilsevar']);
  });

  it('skips the line that played last and keeps listenerFace', () => {
    let n = 0;
    const director = new BarkDirector(
      { flavour_gap_s: 0, flavour_min_interval_s: 0, min_gap_s: 0 },
      () => 0
    );
    const a = director.pick('deep_water', deepWater, {
      nowMs: n++,
      party,
      flags: new Set(),
      skipRateLimits: true
    });
    const b = director.pick('deep_water', deepWater, {
      nowMs: n++,
      party,
      flags: new Set(),
      skipRateLimits: true
    });
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(lineId(a!)).not.toBe(lineId(b!));
    const withListener = [a, b].find((l) => l?.listener);
    if (withListener) {
      expect(withListener.listenerFace).toBe('smirk');
      expect(withListener.speaker).toBe('mags');
    }
  });

  it('respects flavour gaps from bark_rules', () => {
    const director = new BarkDirector({
      flavour_gap_s: 120,
      flavour_min_interval_s: 180,
      min_gap_s: 8
    });
    const first = director.pick('deep_water', deepWater, { nowMs: 0, party, flags: new Set() });
    expect(first).toBeTruthy();
    const tooSoon = director.pick('deep_water', deepWater, { nowMs: 1000, party, flags: new Set() });
    expect(tooSoon).toBeNull();
  });
});
