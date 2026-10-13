import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  SLIME_FROST_RESIST_FLAG,
  isSlimeKind,
  slimeFrostFramePath,
  takeSlimeFrostBark
} from '../src/core/slime-frost';
import { loadSlot, parseSave, SAVE_VERSION, writeSlot } from '../src/proto3d/saves';

function readMonsters(rel: string) {
  return JSON.parse(readFileSync(resolve(__dirname, rel), 'utf8')) as {
    slime: { behavior: { frostMul?: number; detail?: string; counter?: string } };
    slime_small: {
      damage: [number, number];
      interval: number;
      behavior: { frostMul?: number; detail?: string };
    };
  };
}

function saveWithFlags(flags: string[]) {
  return {
    version: SAVE_VERSION,
    kind: 'slot' as const,
    timestamp: 1,
    playTimeMs: 0,
    locale: 'en' as const,
    floor: 1,
    position: { x: 1, y: 7, dir: 0 },
    oil: 6,
    party: [],
    bag: [],
    floors: { '1': { tiles: [], sconces: [], monsters: [] } },
    flags,
    firedOnce: [],
    goals: {},
    journalPages: [],
    dialogue: {},
    escapeRunActive: false,
    leader: 'brannoc' as const
  };
}

describe('slime frost data and bark flag', () => {
  it('keeps slime and slime_small frostMul 0.5 and the mace/frost copy', () => {
    const m = readMonsters('../public/levels/monsters.json');
    expect(m.slime.behavior.frostMul).toBe(0.5);
    expect(m.slime.behavior.detail).toContain('frost deals half');
    expect(m.slime.behavior.counter).toContain('mace');
    expect(m.slime_small.behavior.frostMul).toBe(0.5);
    expect(m.slime_small.behavior.detail).toBe(m.slime.behavior.detail);
    expect(m.slime_small.damage).toEqual([2, 5]);
    expect(m.slime_small.interval).toBe(2.5);
  });

  it('looks up each kind’s own <idle frame>_frost name, without scaling the big slime', () => {
    expect(slimeFrostFramePath('slime', 'near')).toBe(
      'art/dungeon/monsters_v2/slime_idle_1_near_frost.png'
    );
    expect(slimeFrostFramePath('slime_small', 'close')).toBe(
      'art/dungeon/monsters_v2/slime_small_idle_1_close_frost.png'
    );
    const sprites = readFileSync(resolve(__dirname, '../src/proto3d/sprites.ts'), 'utf8');
    expect(sprites).toContain('slimeFrostFramePath(kind, lod)');
    expect(sprites).toContain("'slime_small'");
    expect(sprites).not.toMatch(/scale.*_frost|frost.*scaled/);
    expect(sprites).not.toMatch(/slimeFrostTex\.get\('slime:/);
    expect(sprites).toMatch(/playSlimeFrostFlash[\s\S]*tintHost:\s*false/);
    expect(sprites).not.toMatch(/playSlimeFrostFlash[\s\S]*tintHost:\s*true/);
    expect(sprites).toMatch(/playSlimeFrostFlash[\s\S]*frostAmount\s*=\s*0/);
    expect(sprites).toMatch(/playSlimeFrostFlash[\s\S]*NormalBlending/);
    expect(sprites).toMatch(/playSlimeFrostFlash[\s\S]*opacity\s*=\s*1/);
    expect(sprites).not.toMatch(/playSlimeFrostFlash[\s\S]*AdditiveBlending/);
    const atlas = readFileSync(resolve(__dirname, '../public/art/atlas/monsters.json'), 'utf8');
    for (const lod of ['close', 'near', 'mid', 'far']) {
      expect(atlas).toContain(`slime_small_idle_1_${lod}_frost.png`);
      expect(atlas).toContain(`slime_idle_1_${lod}_frost.png`);
    }
    const anchors = readFileSync(resolve(__dirname, '../public/art/dungeon/monster_anchor.json'), 'utf8');
    expect(anchors).toContain('slime_small_idle_1_close_frost.png');
    expect(anchors).toContain('"imageW": 82');
  });

  it('stores slime_frost_resist_seen in save flags so it survives reload', () => {
    const flags = new Set<string>();
    expect(isSlimeKind('slime')).toBe(true);
    expect(isSlimeKind('slime_small')).toBe(true);
    expect(takeSlimeFrostBark(flags)).toBe(true);
    expect(flags.has(SLIME_FROST_RESIST_FLAG)).toBe(true);
    expect(takeSlimeFrostBark(flags)).toBe(false);

    const parsed = parseSave(saveWithFlags([...flags]));
    expect(parsed?.flags).toContain(SLIME_FROST_RESIST_FLAG);
    expect(takeSlimeFrostBark(new Set(parsed!.flags))).toBe(false);

    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k)
    });
    expect(writeSlot(1, parsed!)).toBe(true);
    const loaded = loadSlot(1);
    expect(loaded).not.toBe('corrupt');
    expect(loaded).not.toBeNull();
    if (loaded && loaded !== 'corrupt') {
      expect(loaded.flags).toContain(SLIME_FROST_RESIST_FLAG);
      expect(takeSlimeFrostBark(new Set(loaded.flags))).toBe(false);
    }
    vi.unstubAllGlobals();

    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(main).toContain('takeSlimeFrostBark(this.flags)');
    expect(main).toContain("speakBark('slime_frost_resist')");
    expect(main).toContain('flags: [...this.flags]');
    expect(main).toContain('this.flags = new Set(save.flags ?? [])');
  });
});
