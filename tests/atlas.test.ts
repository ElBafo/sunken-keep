import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ATLAS_SHEETS,
  atlasFallbackPaths,
  atlasRelPaths,
  coveredSingleFileLoads,
  frameOffsetRepeat,
  installAtlasMaps,
  lookupFrame,
  resetAtlases,
  type AtlasSheetName
} from '../src/proto3d/atlas';
import { resetAssetCache } from '../src/proto3d/asset-cache';
import { floor1PlayableRelPaths } from '../src/proto3d/floor1-prefetch';

type AtlasMapFile = {
  image: string;
  size: { w: number; h: number };
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
};

const ROOT = resolve(__dirname, '../public');

function readMap(name: AtlasSheetName): AtlasMapFile {
  return JSON.parse(readFileSync(resolve(ROOT, `art/atlas/${name}.json`), 'utf8')) as AtlasMapFile;
}

function installFromDisk(): void {
  installAtlasMaps(ATLAS_SHEETS.map((name) => [name, readMap(name)]));
}

describe('floor 1 sprite atlases', () => {
  afterEach(() => {
    resetAssetCache();
    resetAtlases();
  });

  it('ships five sheets and looks frames up by the old path', () => {
    installFromDisk();
    for (const name of ATLAS_SHEETS) {
      const map = readMap(name);
      expect(map.image).toBe(`art/atlas/${name}.png`);
      expect(Object.keys(map.frames).length).toBeGreaterThan(0);
    }
    expect(lookupFrame('art/dungeon/monsters_v2/keep_rat_idle_1_near.png')?.sheet).toBe('monsters');
    expect(lookupFrame('art/portraits/wren_healthy.png')?.sheet).toBe('portraits');
    expect(lookupFrame('art/ui/layout585/panel_585.png')?.sheet).toBe('ui');
    expect(lookupFrame('proto3d/tex3d/torch/flame_calm_1.png')?.sheet).toBe('props');
    expect(lookupFrame('proto3d/atmo/dust.png')?.sheet).toBe('fx');
    expect(lookupFrame('art/font/font_5x7.png')).toBeNull();
    expect(lookupFrame('art/ui/title/title_bg.png')).toBeNull();
    expect(lookupFrame('proto3d/atmo/water_edge.png')).toBeNull();
    expect(lookupFrame('proto3d/atmo/water_line.png')).toBeNull();
    expect(lookupFrame('proto3d/tex3d/wall_plain.png')).toBeNull();
    expect(lookupFrame('proto3d/fx/dark/eyes_green_1.png')?.sheet).toBe('fx');
    expect(lookupFrame('proto3d/fx/dark/glint_1.png')?.sheet).toBe('fx');
    expect(lookupFrame('proto3d/fx/dark/stairs_glow.png')?.sheet).toBe('fx');
    expect(lookupFrame('art/intro/shot1_keep.png')).toBeNull();
    const darkFrames = Object.keys(readMap('fx').frames).filter((p) => p.startsWith('proto3d/fx/dark/'));
    expect(darkFrames).toHaveLength(37);
  });

  it('scales dust’s 2×2 cells onto its fx-sheet rect', () => {
    installFromDisk();
    const hit = lookupFrame('proto3d/atmo/dust.png');
    expect(hit).toBeTruthy();
    const full = frameOffsetRepeat(hit!.frame, hit!.size);
    const cell = frameOffsetRepeat(
      { x: hit!.frame.x, y: hit!.frame.y, w: hit!.frame.w / 2, h: hit!.frame.h / 2 },
      hit!.size
    );
    expect(cell.repeat.x).toBeCloseTo(full.repeat.x * 0.5, 8);
    expect(cell.repeat.y).toBeCloseTo(full.repeat.y * 0.5, 8);
    expect(full.repeat.x).not.toBeCloseTo(0.5, 5);
    expect(full.repeat.y).not.toBeCloseTo(0.5, 5);
  });

  it('lists a packed path fetched as a single file, and stays empty for sheet fetches', () => {
    installFromDisk();
    expect(
      coveredSingleFileLoads([
        '/sunken-keep/art/portraits/wren_healthy.png',
        '/sunken-keep/art/atlas/ui.png',
        '/sunken-keep/art/font/font_5x7.png',
        '/sunken-keep/proto3d/atmo/water_edge.png'
      ])
    ).toEqual(['art/portraits/wren_healthy.png']);
    expect(atlasFallbackPaths()).toEqual([]);
  });

  it('puts the five sheets in the floor 1 early group instead of 192 monster frames', () => {
    const paths = floor1PlayableRelPaths();
    for (const rel of atlasRelPaths()) expect(paths).toContain(rel);
    expect(paths.filter((p) => p.startsWith('art/dungeon/monsters_v2/'))).toEqual([]);
  });

  it('packs every skip-to-first-fight sprite that used to be a single file', () => {
    installFromDisk();
    const skipPacked = [
      'art/portraits/wren_healthy.png',
      'art/ui/layout585/panel_585.png',
      'art/ui/layout585/stone_strip_tile.png',
      'art/ui/hands/hand_axe.png',
      'art/dungeon/item_key_near.png',
      'proto3d/tex3d/torch/bracket_lit_front.png',
      'proto3d/atmo/dust.png',
      'proto3d/atmo/desk_note.png',
      'art/dungeon/monsters_v2/slime_idle_1_near.png',
      'art/fx/hits/resist_goo_1_near.png',
      'proto3d/fx/dark/eyes_amber_1.png',
      'proto3d/fx/dark/eyes_green_1.png',
      'proto3d/fx/dark/eyes_pale_1.png',
      'proto3d/fx/dark/glint_1.png',
      'proto3d/fx/dark/stairs_glow.png'
    ];
    for (const path of skipPacked) {
      expect(lookupFrame(path), path).toBeTruthy();
    }
    expect(coveredSingleFileLoads(skipPacked.map((p) => `/sunken-keep/${p}`))).toEqual(skipPacked.slice().sort());
  });
});
