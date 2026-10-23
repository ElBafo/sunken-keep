import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { parseSave, SAVE_VERSION, writeSlot, loadSlot } from '../src/proto3d/saves';
import { parseGameplayFlags } from '../src/voxel-floor1/gameplay';
import { floor1Map, resetFloor1Doors, resetFloor1Loot, tileAt } from '../src/voxel-floor1/layout';
import {
  applyFloorTiles,
  FLOOR_NUMBER,
  snapshotFloorTiles
} from '../src/voxel-floor1/saves';
import { wrapLogMessage } from '../src/voxel-floor1/portrait-layout';

const gameplay = readFileSync(resolve(__dirname, '../src/voxel-floor1/gameplay.ts'), 'utf8');
const saves = readFileSync(resolve(__dirname, '../src/voxel-floor1/saves.ts'), 'utf8');
const main = readFileSync(resolve(__dirname, '../src/voxel-floor1/main.ts'), 'utf8');
const html = readFileSync(resolve(__dirname, '../voxel-floor1.html'), 'utf8');
const protoMain = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
const protoSaves = readFileSync(resolve(__dirname, '../src/proto3d/saves.ts'), 'utf8');
const ui = JSON.parse(readFileSync(resolve(__dirname, '../public/story/ui_text.json'), 'utf8')) as {
  stairs: { floor2_soon: string; floor2_soon_short: string };
};

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

describe('voxel floor 1 saves and stairs', () => {
  it('reuses Classic save keys and refuses to treat a v1 slot as empty', () => {
    expect(saves).toContain("from '../proto3d/saves'");
    expect(saves).toContain('export {\n  SAVE_VERSION');
    expect(protoSaves).toContain("const PREFIX = 'proto3d.save.v1.'");
    expect(gameplay).toContain('writeAutosave');
    expect(gameplay).toContain('writeFloorSnapshot');
    expect(gameplay).toContain('newestAutosave');
    expect(gameplay).toContain('visibilitychange');
    expect(gameplay).toContain('pagehide');
    expect(main).toContain('requestManualSave');
    expect(main).toContain('loadFromSlot');
    expect(html).toContain('id="btn-save"');
    expect(html).toContain('id="btn-load"');
    expect(html).toContain('id="btn-go-autosave"');
    expect(html).toContain('id="title-overlay"');
    expect(protoMain).not.toContain('voxel-floor1/saves');
    expect(parseSave({ version: 1, party: [], monsters: [], position: { x: 1, y: 7, dir: 0 } })).toBeNull();
    expect(parseSave(validV2())).toBeTruthy();

    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k)
    });
    store.set('proto3d.save.v1.slot.1', JSON.stringify({ version: 1, party: [], position: { x: 1, y: 7, dir: 0 } }));
    expect(loadSlot(1)).toBe('corrupt');
    expect(writeSlot(2, validV2({ slot: 2 }) as never)).toBe(true);
    expect(store.get('proto3d.save.v1.slot.1')).toContain('"version":1');
    expect(JSON.parse(store.get('proto3d.save.v1.slot.2')!).version).toBe(SAVE_VERSION);
    vi.unstubAllGlobals();
  });

  it('keeps Classic title continue/load on start and skips chrome only for ?test=1', () => {
    expect(parseGameplayFlags('')).toEqual({ skipChrome: false, showTitle: true });
    expect(parseGameplayFlags('?test=1')).toEqual({ skipChrome: true, showTitle: false });
    expect(gameplay).toContain("action.type === 'continue'");
    expect(gameplay).toContain("action.type === 'open_load'");
    expect(gameplay).toContain('runContinue');
    expect(gameplay).toContain('load_last');
    expect(gameplay).toContain('loadAutosave');
    expect(gameplay).toContain('restartFloor');
    expect(main).toContain('loadAutosave');
  });

  it('round-trips opened doors, used keys, and picked-up items on Classic cell coords', () => {
    resetFloor1Loot();
    resetFloor1Doors();
    const key = tileAt(floor1Map, 2, 5);
    const door = tileAt(floor1Map, 4, 2);
    expect(key?.item).toBe('key');
    expect(door?.doorLocked).toBe(true);
    if (key) key.item = undefined;
    if (door) {
      door.doorLocked = false;
      door.doorOpen = true;
    }
    const snap = snapshotFloorTiles(floor1Map);
    expect(snap).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x: 2, y: 5, item: null }),
        expect.objectContaining({ x: 4, y: 2, doorOpen: true, doorLocked: false })
      ])
    );
    resetFloor1Loot();
    resetFloor1Doors();
    expect(tileAt(floor1Map, 2, 5)?.item).toBe('key');
    expect(tileAt(floor1Map, 4, 2)?.doorOpen).toBe(false);
    applyFloorTiles(floor1Map, snap);
    expect(tileAt(floor1Map, 2, 5)?.item).toBeUndefined();
    expect(tileAt(floor1Map, 4, 2)?.doorOpen).toBe(true);
    expect(tileAt(floor1Map, 4, 2)?.doorLocked).toBe(false);
    resetFloor1Loot();
    resetFloor1Doors();
  });

  it('shows the full floor-2-coming-soon stairs line and does not invent a floor 2', () => {
    expect(FLOOR_NUMBER).toBe(1);
    expect(tileAt(floor1Map, 16, 10)?.stairs).toBe('down');
    expect(tileAt(floor1Map, 16, 10)?.stepUi).toBe('stairs.floor2_soon');
    expect(ui.stairs.floor2_soon).toBe('The stairs lead down into darkness... Floor 2 is coming soon.');
    const wrapped = wrapLogMessage(ui.stairs.floor2_soon, 28);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.join('').replace(/\s+/g, '')).toBe(ui.stairs.floor2_soon.replace(/\s+/g, ''));
    expect(gameplay).toContain('fireTileStepUi');
    expect(gameplay).toContain('this.story.uiText(path)');
    expect(gameplay).not.toContain('`${path}_short`');
    expect(main).not.toMatch(/fake.*floor|floor2\.html/i);
  });
});
