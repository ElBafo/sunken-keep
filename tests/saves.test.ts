import { describe, expect, it, vi } from 'vitest';
import { wrapFontLine } from '../src/proto3d/font5x7';
import {
  formatPlayTime,
  listSlots,
  loadSlot,
  parseSave,
  persistStorage,
  SAVE_VERSION,
  slotOccupied
} from '../src/proto3d/saves';

function validV2(over: Record<string, unknown> = {}) {
  return {
    version: SAVE_VERSION,
    kind: 'slot',
    timestamp: 1,
    playTimeMs: 0,
    locale: 'en',
    floor: 1,
    position: { x: 1, y: 7, dir: 0 },
    oil: 6,
    party: [],
    bag: [],
    floors: { '1': { tiles: [], sconces: [], monsters: [] } },
    flags: [],
    firedOnce: [],
    goals: {},
    journalPages: [],
    dialogue: {},
    escapeRunActive: false,
    leader: 'brannoc',
    ...over
  };
}

describe('wrapFontLine', () => {
  it('wraps long log lines instead of clipping', () => {
    const lines = wrapFontLine('Wren: The Ember reveals what is hidden behind this wall.', 20);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.length <= 20)).toBe(true);
    expect(lines.join(' ')).toMatch(/Ember/);
  });
});

describe('save version', () => {
  it('refuses old or missing versions and accepts v2 floors', () => {
    expect(parseSave({ party: [], monsters: [], position: { x: 0, y: 0, dir: 0 } })).toBeNull();
    expect(parseSave({ version: 1, party: [], monsters: [], position: { x: 1, y: 7, dir: 0 } })).toBeNull();
    expect(parseSave({ version: SAVE_VERSION, party: [], position: { x: 1, y: 7, dir: 0 } })).toBeNull();
    const ok = parseSave(validV2({ journalPages: ['journal_page_1'], dialogue: { f2_frogcatcher: 'return' } }));
    expect(ok).toBeTruthy();
    expect(ok?.floors['1']).toBeTruthy();
    expect(ok?.journalPages).toEqual(['journal_page_1']);
    expect(ok?.dialogue.f2_frogcatcher).toBe('return');
    expect((ok as { hasKey?: boolean } | null)?.hasKey).toBeUndefined();
  });

  it('marks an old or unreadable slot as corrupt, not empty', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k)
    });
    store.set(
      'proto3d.save.v1.slot.2',
      JSON.stringify({ version: 1, party: [], monsters: [], position: { x: 1, y: 7, dir: 0 } })
    );
    expect(loadSlot(2)).toBe('corrupt');
    expect(listSlots()[1]).toEqual({ slot: 2, status: 'corrupt' });
    expect(listSlots()[0]).toBeNull();
    vi.unstubAllGlobals();
  });

  it('treats unparseable non-JSON slot data as corrupt, not empty', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k)
    });
    store.set('proto3d.save.v1.slot.3', 'not-json{{{');
    expect(loadSlot(3)).toBe('corrupt');
    expect(listSlots()[2]).toEqual({ slot: 3, status: 'corrupt' });
    expect(slotOccupied(3)).toBe(true);
    expect(loadSlot(1)).toBeNull();
    vi.unstubAllGlobals();
  });

  it('formats play time', () => {
    expect(formatPlayTime(90_000)).toBe('1m');
    expect(formatPlayTime(3_600_000 + 120_000)).toBe('1h 2m');
    expect(formatPlayTime(90_000, (key, vars) => (key === 'slot.time_m' ? `${vars?.m}λ` : ''))).toBe('1λ');
    expect(
      formatPlayTime(3_600_000 + 120_000, (key, vars) => (key === 'slot.time_hm' ? `${vars?.h}ώ ${vars?.m}λ` : ''))
    ).toBe('1ώ 2λ');
  });
});

import { ONCE_TRIGGER_IDS, StoryProgress } from '../src/proto3d/story-progress';

describe('story once + goals', () => {
  it('does not re-fire a spent once bark, log, or note and keeps goal page state', async () => {
    const p = new StoryProgress();
    await p.load('/');
    p.startNewGame();
    expect(p.snapshotGoals().g_why).toBe('active');
    expect(p.fire('guard_hall_enter')).toBe(true);
    expect(p.fire('water_shallow')).toBe(true);
    expect(p.fire('journal_page_1')).toBe(true);
    expect(p.fire('door_locked')).toBe(true);
    expect(p.fire('door_locked')).toBe(true);
    expect(p.snapshotGoals().g_f1_door).toBe('active');
    expect(p.fire('door_unlocked')).toBe(true);
    expect(p.snapshotGoals().g_f1_door).toBe('done');
    const snap = p.serialize();
    expect(snap.fired).toEqual(
      expect.arrayContaining(['guard_hall_enter', 'water_shallow', 'journal_page_1', 'door_unlocked'])
    );
    expect(snap.fired).not.toContain('door_locked');
    const q = new StoryProgress();
    await q.load('/');
    q.restore(snap);
    expect(q.fire('guard_hall_enter')).toBe(false);
    expect(q.fire('water_shallow')).toBe(false);
    expect(q.fire('journal_page_1')).toBe(false);
    expect(q.fire('door_unlocked')).toBe(false);
    expect(q.fire('door_locked')).toBe(true);
    expect(q.snapshotGoals().g_why).toBe('active');
    expect(q.snapshotGoals().g_f1_door).toBe('done');
  });

  it('catalogs every once-marked bark, log, and note', () => {
    expect(ONCE_TRIGGER_IDS).toEqual(
      expect.arrayContaining(['guard_hall_enter', 'water_shallow', 'journal_page_1', 'enter_floor1', 'act1_end'])
    );
    expect(ONCE_TRIGGER_IDS).not.toContain('door_locked');
    expect(ONCE_TRIGGER_IDS).not.toContain('note_lampkeeper');
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
