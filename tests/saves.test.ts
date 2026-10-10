import { describe, expect, it, vi } from 'vitest';
import { wrapFontLine } from '../src/proto3d/font5x7';
import { formatPlayTime, parseSave, persistStorage, SAVE_VERSION } from '../src/proto3d/saves';

describe('wrapFontLine', () => {
  it('wraps long log lines instead of clipping', () => {
    const lines = wrapFontLine('Wren: The Ember reveals what is hidden behind this wall.', 20);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.length <= 20)).toBe(true);
    expect(lines.join(' ')).toMatch(/Ember/);
  });
});

describe('save version', () => {
  it('refuses old or missing versions', () => {
    expect(parseSave({ party: [], monsters: [], position: { x: 0, y: 0, dir: 0 } })).toBeNull();
    expect(parseSave({ version: 0, party: [], monsters: [], position: { x: 0, y: 0, dir: 0 } })).toBeNull();
    expect(parseSave({ version: SAVE_VERSION, party: [], monsters: [], position: { x: 1, y: 7, dir: 0 } })).toBeTruthy();
  });

  it('formats play time', () => {
    expect(formatPlayTime(90_000)).toBe('1m');
    expect(formatPlayTime(3_600_000 + 120_000)).toBe('1h 2m');
  });
});

import { StoryProgress } from '../src/proto3d/story-progress';

describe('story once + goals', () => {
  it('does not re-fire a spent once trigger and keeps goal status', async () => {
    const p = new StoryProgress();
    await p.load('/');
    p.startNewGame();
    expect(p.fire('door_locked')).toBe(true);
    expect(p.fire('door_locked')).toBe(false);
    p.goals.set('g_f1_door', 'active');
    const snap = p.serialize();
    const q = new StoryProgress();
    await q.load('/');
    q.restore(snap);
    expect(q.fire('door_locked')).toBe(false);
    expect(q.snapshotGoals().g_f1_door).toBe('active');
  });
});

describe('persistStorage', () => {
  it('calls navigator.storage.persist when available', () => {
    const persist = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { storage: { persist } }
    });
    persistStorage();
    expect(persist).toHaveBeenCalled();
  });
});
