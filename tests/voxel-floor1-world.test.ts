import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { CAVE_IN_STATE } from '../src/proto3d/cave-in';
import { floor1CaveIn } from '../src/proto3d/floor-data';
import { enumerateFaces, floor1Map, setRubbleWall, tileAt } from '../src/voxel-floor1/layout';
import { STAIRS_CELL } from '../src/voxel-floor1/stairs';

const gameplay = readFileSync(resolve(__dirname, '../src/voxel-floor1/gameplay.ts'), 'utf8');
const main = readFileSync(resolve(__dirname, '../src/voxel-floor1/main.ts'), 'utf8');
const html = readFileSync(resolve(__dirname, '../voxel-floor1.html'), 'utf8');
const openings = readFileSync(resolve(__dirname, '../src/voxel-floor1/openings.ts'), 'utf8');
const title = readFileSync(resolve(__dirname, '../src/proto3d/title.ts'), 'utf8');
const props = readFileSync(resolve(__dirname, '../src/voxel-floor1/props.ts'), 'utf8');
const lights = readFileSync(resolve(__dirname, '../src/voxel-floor1/lights.ts'), 'utf8');

describe('voxel floor 1 world ports', () => {
  it('reuses Classic cave-in timing and the floor-1 spec', () => {
    expect(floor1CaveIn).toMatchObject({
      at: { x: 3, y: 14 },
      stepTo: { x: 2, y: 14 },
      rubble: { x: 3, y: 14 },
      endDir: 1,
      state: CAVE_IN_STATE
    });
    expect(gameplay).toContain('CaveInDirector');
    expect(gameplay).toContain('maybeStartCaveIn');
    expect(gameplay).toContain('playCaveIn');
    expect(main).toContain('CaveInWorld');
    expect(main).toContain('playOpeningCaveIn');
  });

  it('blocks the cave-in cell only after rubble is applied', () => {
    setRubbleWall(floor1Map, 3, 14, false);
    expect(tileAt(floor1Map, 3, 14)?.wall).toBeFalsy();
    setRubbleWall(floor1Map, 3, 14, true);
    expect(tileAt(floor1Map, 3, 14)?.wall).toBe(true);
    setRubbleWall(floor1Map, 3, 14, false);
  });

  it('opens a locked door in logical state as soon as the key turns', () => {
    expect(openings).toContain('visual.tile.doorOpen = true');
    expect(openings).toContain('this.pendingUnlock');
    expect(openings).toContain('DOOR_UNLOCK_LEAD_MS');
  });

  it('returns in-game Load Back to the game, not the title menu', () => {
    expect(title).toContain('resumeOnBack');
    expect(title).toContain('this.mode === \'save\' || this.resumeOnBack');
    expect(gameplay).toContain('resumeOnBack: this.playStarted');
  });

  it('rebuilds sconce flames and lights from saved fields', () => {
    expect(props).toContain('syncFromSconces');
    expect(lights).toContain('relight()');
    expect(gameplay).toContain('takeWallTorch');
    expect(gameplay).toContain('snuffTorch');
    expect(html).toContain('id="torch-choice"');
    expect(html).toContain('id="btn-torch-take"');
    expect(html).toContain('id="btn-torch-snuff"');
  });

  it('ports the Classic settings overlay onto the hamburger menu', () => {
    expect(html).toContain('id="settings-overlay"');
    expect(html).toContain('id="btn-settings"');
    expect(html).toContain('id="btn-lang-en"');
    expect(html).toContain('id="btn-sound-on"');
    expect(html).toContain('id="btn-quality-max"');
    expect(html).toContain('id="btn-layout-framed"');
    expect(gameplay).toContain('SettingsMenu');
    expect(main).toContain('openSettings');
  });

  it('cuts the baked floor on the stairs cell so the well is visible', () => {
    expect(STAIRS_CELL).toEqual({ x: 16, y: 10 });
    expect(tileAt(floor1Map, 16, 10)?.stairs).toBe('down');
    const jobs = enumerateFaces(floor1Map);
    expect(jobs.some((j) => j.kind === 'floor' && j.tx === 16 && j.tz === 10)).toBe(false);
    expect(jobs.some((j) => j.kind === 'ceiling' && j.tx === 16 && j.tz === 10)).toBe(true);
    expect(main).toContain('buildFloor1Stairs');
  });
});
