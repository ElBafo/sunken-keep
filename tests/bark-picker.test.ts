import { describe, expect, it } from 'vitest';
import {
  BarkDirector,
  barkDurationMs,
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

  it('queues story barks so opening_cavein_2 is never dropped', () => {
    const director = new BarkDirector({
      flavour_gap_s: 120,
      flavour_min_interval_s: 180,
      min_gap_s: 8
    });
    const lines: BarkLine[] = [
      {
        trigger: 'opening_cavein',
        speaker: 'brannoc',
        text: 'The way home just closed.',
        tier: 'story'
      },
      {
        trigger: 'opening_cavein_2',
        speaker: 'mags',
        text: 'Brilliant.',
        tier: 'story'
      }
    ];
    const ctx = (nowMs: number) => ({ nowMs, party, flags: new Set<string>() });
    const first = director.pick('opening_cavein', lines, ctx(0));
    expect(first?.trigger).toBe('opening_cavein');
    const requested = director.pick('opening_cavein_2', lines, ctx(800));
    expect(requested).toBeNull();
    expect(director.queuedCount()).toBe(1);
    expect(director.flush(800)).toBeNull();
    const readyAt = barkDurationMs(first!);
    expect(director.flush(readyAt - 1)).toBeNull();
    const second = director.flush(readyAt);
    expect(second?.trigger).toBe('opening_cavein_2');
    expect(director.queuedCount()).toBe(0);
  });

  it('never lets a combat flavour bark land between two cave-in story lines', () => {
    const director = new BarkDirector({
      flavour_gap_s: 0,
      flavour_min_interval_s: 0,
      min_gap_s: 0
    });
    const lines: BarkLine[] = [
      { trigger: 'opening_cavein', speaker: 'brannoc', text: 'Closed.', tier: 'story' },
      { trigger: 'opening_cavein_2', speaker: 'mags', text: 'Brilliant.', tier: 'story' },
      { trigger: 'new_monster', speaker: 'mags', text: 'A rat!', tier: 'flavour' }
    ];
    const ctx = (nowMs: number) => ({ nowMs, party, flags: new Set<string>(), skipRateLimits: true });
    const first = director.pick('opening_cavein', lines, ctx(0));
    expect(first?.trigger).toBe('opening_cavein');
    expect(director.pick('opening_cavein_2', lines, ctx(200))).toBeNull();
    expect(director.queuedCount()).toBe(1);
    expect(director.pick('new_monster', lines, ctx(400))).toBeNull();
    const readyAt = barkDurationMs(first!);
    expect(director.pick('new_monster', lines, ctx(readyAt))).toBeNull();
    const second = director.flush(readyAt);
    expect(second?.trigger).toBe('opening_cavein_2');
    expect(director.queuedCount()).toBe(0);
  });

  it('clears queued story barks when leaving the game screen', () => {
    const director = new BarkDirector({
      flavour_gap_s: 120,
      flavour_min_interval_s: 180,
      min_gap_s: 8
    });
    const lines: BarkLine[] = [
      { trigger: 'opening_cavein', speaker: 'brannoc', text: 'Closed.', tier: 'story' },
      { trigger: 'opening_cavein_2', speaker: 'mags', text: 'Brilliant.', tier: 'story' }
    ];
    director.pick('opening_cavein', lines, { nowMs: 0, party, flags: new Set() });
    director.pick('opening_cavein_2', lines, { nowMs: 800, party, flags: new Set() });
    expect(director.queuedCount()).toBe(1);
    director.clearQueue();
    expect(director.queuedCount()).toBe(0);
    expect(director.flush(20_000)).toBeNull();
  });
});
