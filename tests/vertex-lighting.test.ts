import { describe, expect, it } from 'vitest';
import {
  CELL_SIZE,
  LANTERN_CORE_TILES,
  LANTERN_HEIGHT,
  LANTERN_INTENSITY,
  LANTERN_RADIUS_TILES
} from '../src/proto3d/constants';
import { floor1 } from '../src/proto3d/floor-data';
import { partyDistTiles, partyFalloff, VertexLightingManager } from '../src/proto3d/vertex-lighting';

/** Desk top centre at (12,9); party one square west at (11,9). */
const DESK = { x: 12, y: 9, wy: 0.34 };
const PARTY = { x: 11, y: 9 };
const LAMP = { x: 13, y: 9, wy: 0.14 };

const OLD_RADIUS = 1.5;
const OLD_PROP_PENALTY = 0.55;

function oldPartyDist(wx: number, wy: number, wz: number, partyX: number, partyY: number): number {
  const dx = wx / CELL_SIZE - partyX;
  const dz = wz / CELL_SIZE - partyY;
  const horiz = Math.sqrt(dx * dx + dz * dz);
  if (wy < 0.28) return horiz;
  const dy = (wy - LANTERN_HEIGHT) / CELL_SIZE;
  return Math.sqrt(horiz * horiz + dy * dy) + OLD_PROP_PENALTY;
}

function lanternWeight(dist: number, radius: number): number {
  return LANTERN_INTENSITY * partyFalloff(dist, radius);
}

describe('lantern reaches lamp-room props', () => {
  const wx = DESK.x * CELL_SIZE;
  const wz = DESK.y * CELL_SIZE;
  const deskWx = wx;
  const deskWz = wz;

  it('drops the prop distance penalty and uses a 2-tile oil radius', () => {
    expect(LANTERN_RADIUS_TILES).toBe(2);
    const after = partyDistTiles(deskWx, DESK.wy, deskWz, PARTY.x, PARTY.y);
    const before = oldPartyDist(deskWx, DESK.wy, deskWz, PARTY.x, PARTY.y);
    expect(after).toBeLessThan(before);
    expect(before).toBeCloseTo(after + OLD_PROP_PENALTY, 5);
    expect(after).toBeLessThan(LANTERN_RADIUS_TILES);
    expect(before).toBeGreaterThan(OLD_RADIUS);
  });

  it('measures desk (12,9) from one square away before and after the lantern fix', () => {
    const distBefore = oldPartyDist(deskWx, DESK.wy, deskWz, PARTY.x, PARTY.y);
    const distAfter = partyDistTiles(deskWx, DESK.wy, deskWz, PARTY.x, PARTY.y);
    const weightBefore = lanternWeight(distBefore, OLD_RADIUS);
    const weightAfter = lanternWeight(distAfter, LANTERN_RADIUS_TILES);
    const floorAfter = lanternWeight(
      partyDistTiles(deskWx, 0.08, deskWz, PARTY.x, PARTY.y),
      LANTERN_RADIUS_TILES
    );

    // Printed for the PR — before was 0: +0.55 pushed the desk past the 1.5 puddle.
    console.log('DESK_LIGHT', {
      party: PARTY,
      desk: DESK,
      core: LANTERN_CORE_TILES,
      before: { dist: distBefore, radius: OLD_RADIUS, weight: weightBefore },
      after: { dist: distAfter, radius: LANTERN_RADIUS_TILES, weight: weightAfter },
      floorAfter
    });

    expect(weightBefore, 'old 1.5-tile puddle + 0.55 penalty left the desk unlit').toBe(0);
    expect(weightAfter, 'desk top now sits inside the oil puddle').toBeGreaterThan(0.05);
    expect(weightAfter).toBeLessThan(LANTERN_INTENSITY);
    expect(floorAfter).toBeGreaterThan(weightAfter * 0.8);
  });

  it('shades the desk above ambient; Pell\'s capped lamp still emits nothing', () => {
    const lighting = new VertexLightingManager(floor1, [], { floor: 1, bright: 1, oil: () => 2 });
    lighting.setPartyPosition(PARTY.x, PARTY.y);
    const desk = lighting.sampleVertex(deskWx, DESK.wy, deskWz, DESK.x, DESK.y);
    const fill = lighting.ambientBrightness();
    const lampTile = lighting.sourceLight(LAMP.x, LAMP.y);
    const deskTile = lighting.sourceLight(DESK.x, DESK.y);

    console.log('DESK_SHADE', {
      deskLuma: desk.luma,
      deskRgb: desk.rgb,
      ambient: fill,
      deskSource: deskTile,
      lampSource: lampTile
    });

    expect(desk.luma).toBeGreaterThan(fill);
    expect(deskTile, 'desk square is inside the lantern reach').toBeGreaterThan(0.04);
    expect(lampTile, 'capped lamp at (13,9) still emits no light').toBe(0);
  });
});
