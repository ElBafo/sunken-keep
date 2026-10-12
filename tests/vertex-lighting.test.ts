import { describe, expect, it } from 'vitest';
import {
  CELL_SIZE,
  LANTERN_HEIGHT,
  LANTERN_INTENSITY,
  LANTERN_RADIUS_TILES
} from '../src/proto3d/constants';
import { floor1, floor1Sconces } from '../src/proto3d/floor-data';
import { lanternFalloff, partyDistTiles, VertexLightingManager } from '../src/proto3d/vertex-lighting';

/** Desk top centre at (12,9); party one square west at (11,9). */
const DESK = { x: 12, y: 9, wy: 0.34 };
const PARTY = { x: 11, y: 9 };
const LAMP = { x: 13, y: 9 };

/** Quartic puddle from the first lighting pass (radius 2, intensity 0.64). */
const OLD_RADIUS = 2;
const OLD_INTENSITY = 0.64;
const OLD_CORE = 0.28;

function oldQuarticWeight(dist: number): number {
  if (dist >= OLD_RADIUS) return 0;
  if (dist <= OLD_CORE) return OLD_INTENSITY;
  const t = 1 - (dist - OLD_CORE) / (OLD_RADIUS - OLD_CORE);
  return OLD_INTENSITY * t * t * t * t;
}

function lanternWeight(dist: number): number {
  return LANTERN_INTENSITY * lanternFalloff(dist, LANTERN_RADIUS_TILES);
}

describe('lantern quadratic puddle', () => {
  const deskWx = DESK.x * CELL_SIZE;
  const deskWz = DESK.y * CELL_SIZE;

  it('uses a 2.5-tile oil radius and a wide 1−(d/r)² falloff', () => {
    expect(LANTERN_RADIUS_TILES).toBe(2.5);
    expect(LANTERN_INTENSITY).toBe(0.4);
    expect(lanternFalloff(0, 2.5)).toBe(1);
    expect(lanternFalloff(2.5, 2.5)).toBe(0);
    expect(lanternFalloff(1, 2.5)).toBeCloseTo(1 - 1 / (2.5 * 2.5), 5);
  });

  it('hits ~0.32 / ≥0.25 / ~0.12 lantern light at 0, 1, and 2 tiles', () => {
    const lighting = new VertexLightingManager(floor1, [], { floor: 1, bright: 1, oil: () => 2 });
    lighting.setPartyPosition(PARTY.x, PARTY.y);

    const floor0 = lighting.sourceLight(PARTY.x, PARTY.y);
    const floor1Tile = lighting.sourceLight(DESK.x, DESK.y);
    const floor2 = lighting.sourceLight(LAMP.x, LAMP.y);
    const desk = lighting.sampleVertex(deskWx, DESK.wy, deskWz, DESK.x, DESK.y);
    const luma0 = lighting.calculateBrightness(PARTY.x, PARTY.y, false);
    const luma1 = lighting.calculateBrightness(DESK.x, DESK.y, false);
    const luma2 = lighting.calculateBrightness(LAMP.x, LAMP.y, false);
    const fill = lighting.ambientBrightness();

    const distDesk = partyDistTiles(deskWx, DESK.wy, deskWz, PARTY.x, PARTY.y);
    const dist0 = partyDistTiles(PARTY.x * CELL_SIZE, 0.08, PARTY.y * CELL_SIZE, PARTY.x, PARTY.y);
    const dist1 = partyDistTiles(deskWx, 0.08, deskWz, PARTY.x, PARTY.y);
    const dist2 = partyDistTiles(LAMP.x * CELL_SIZE, 0.08, LAMP.y * CELL_SIZE, PARTY.x, PARTY.y);

    console.log('LANTERN_FALLOFF', {
      party: PARTY,
      before: {
        deskWeight: oldQuarticWeight(distDesk),
        floor0: oldQuarticWeight(dist0),
        floor1: oldQuarticWeight(dist1),
        floor2: oldQuarticWeight(dist2)
      },
      after: {
        deskWeight: lanternWeight(distDesk),
        deskLuma: desk.luma,
        floor0,
        floor1: floor1Tile,
        floor2,
        luma0,
        luma1,
        luma2,
        ambient: fill
      }
    });

    expect(floor0, 'party square lantern light ~0.32').toBeGreaterThan(0.3);
    expect(floor0).toBeLessThan(0.42);
    expect(luma0, 'party square shade stays ~0.32, not blown out').toBeGreaterThan(0.3);
    expect(luma0).toBeLessThan(0.36);

    expect(floor1Tile, '1-tile floor lantern light ≥ 0.25').toBeGreaterThanOrEqual(0.25);
    expect(luma1).toBeGreaterThanOrEqual(0.25);
    expect(desk.luma, 'desk top 1 tile away is readable').toBeGreaterThanOrEqual(0.25);

    expect(floor2, '2-tile floor lantern light ~0.12').toBeGreaterThan(0.1);
    expect(floor2).toBeLessThan(0.18);
    expect(luma2).toBeGreaterThan(0.1);
    expect(luma2).toBeLessThan(0.16);

    expect(oldQuarticWeight(distDesk), 'previous quartic left the desk near zero').toBeLessThan(0.08);
  });

  it("Pell's capped lamp at (13,9) still emits nothing", () => {
    expect(floor1Sconces.some((s) => s.x === LAMP.x && s.y === LAMP.y)).toBe(false);

    const far = new VertexLightingManager(floor1, floor1Sconces, { floor: 1, bright: 1, oil: () => 2 });
    far.setPartyPosition(1, 7);
    expect(far.sourceLight(LAMP.x, LAMP.y), 'lamp is not a sconce and is outside the start puddle').toBe(0);

    const near = new VertexLightingManager(floor1, [], { floor: 1, bright: 1, oil: () => 2 });
    near.setPartyPosition(PARTY.x, PARTY.y);
    const lampFromLantern = near.sourceLight(LAMP.x, LAMP.y);
    expect(lampFromLantern, 'party lantern may graze (13,9); the lamp itself adds nothing').toBeCloseTo(
      lanternWeight(2),
      5
    );
  });
});
