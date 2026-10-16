import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  CELL_SIZE,
  DARK_LIGHT_THRESHOLD,
  FACE_SEGMENTS,
  LANTERN_INTENSITY,
  LANTERN_RADIUS_TILES,
  PROP_LANTERN_INTENSITY,
  PROP_LANTERN_RADIUS_TILES,
  WALL_LANTERN_INTENSITY,
  WALL_LANTERN_RADIUS_TILES
} from '../src/proto3d/constants';
import { monsterBodyVisible } from '../src/proto3d/dark-fx';
import { floor1, floor1Sconces } from '../src/proto3d/floor-data';
import { lanternFalloff, partyDistTiles, partyFalloff, VertexLightingManager } from '../src/proto3d/vertex-lighting';

function valleyDip(lumas: number[]): number {
  let worst = 0;
  for (let i = 1; i < lumas.length - 1; i++) {
    const left = Math.max(...lumas.slice(0, i));
    const right = Math.max(...lumas.slice(i + 1));
    worst = Math.max(worst, Math.min(left, right) - lumas[i]);
  }
  return worst;
}

const DESK = { x: 12, y: 9, wy: 0.34 };
const RACK = { x: 9, y: 10, wy: 0.4 };
const LAMP = { x: 13, y: 9 };
const PARTY_DESK = { x: 11, y: 9 };
const PARTY_RACK = { x: 11, y: 10 };

function propWeight(dist: number): number {
  return PROP_LANTERN_INTENSITY * lanternFalloff(dist, PROP_LANTERN_RADIUS_TILES);
}

function floorWeight(dist: number): number {
  return LANTERN_INTENSITY * partyFalloff(dist, LANTERN_RADIUS_TILES);
}

describe('lantern: steep floors, soft props', () => {
  it('keeps the main oil puddle on floors (quartic, r=1.5, I=0.64)', () => {
    expect(LANTERN_RADIUS_TILES).toBe(1.5);
    expect(LANTERN_INTENSITY).toBe(0.64);
    const lighting = new VertexLightingManager(floor1, [], { floor: 1, bright: 1, oil: () => 2 });
    lighting.setPartyPosition(PARTY_DESK.x, PARTY_DESK.y);

    const own = lighting.sourceLight(PARTY_DESK.x, PARTY_DESK.y);
    const one = lighting.sourceLight(DESK.x, DESK.y);
    const two = lighting.sourceLight(LAMP.x, LAMP.y);
    const luma0 = lighting.calculateBrightness(PARTY_DESK.x, PARTY_DESK.y, false);
    const luma1 = lighting.calculateBrightness(DESK.x, DESK.y, false);
    const luma2 = lighting.calculateBrightness(LAMP.x, LAMP.y, false);

    console.log('FLOOR_LANTERN', { own, one, two, luma0, luma1, luma2 });

    expect(own).toBeCloseTo(0.64, 2);
    expect(luma0).toBeGreaterThan(0.45);
    expect(one, '1-tile floor stays near-ambient').toBeLessThan(0.08);
    expect(luma1).toBeLessThan(0.08);
    expect(two, '2-tile floor is outside the oil puddle').toBe(0);
    expect(luma2).toBeCloseTo(lighting.ambientBrightness(), 3);
    expect(floorWeight(1)).toBeLessThan(0.08);
    expect(floorWeight(2)).toBe(0);
  });

  it('lights tagged props with 1−(d/r)² at r=2.5 (desk 1 tile, rack 2 tiles)', () => {
    expect(PROP_LANTERN_RADIUS_TILES).toBe(2.5);
    expect(PROP_LANTERN_INTENSITY).toBe(0.4);

    const lighting = new VertexLightingManager(floor1, [], { floor: 1, bright: 1, oil: () => 2 });

    lighting.setPartyPosition(PARTY_DESK.x, PARTY_DESK.y);
    const deskDist = partyDistTiles(
      DESK.x * CELL_SIZE,
      DESK.wy,
      DESK.y * CELL_SIZE,
      PARTY_DESK.x,
      PARTY_DESK.y,
      { prop: true }
    );
    const desk = lighting.sampleVertex(
      DESK.x * CELL_SIZE,
      DESK.wy,
      DESK.y * CELL_SIZE,
      DESK.x,
      DESK.y,
      false,
      true
    );
    const deskFloor = lighting.sampleVertex(
      DESK.x * CELL_SIZE,
      0.08,
      DESK.y * CELL_SIZE,
      DESK.x,
      DESK.y,
      false,
      false
    );

    lighting.setPartyPosition(PARTY_RACK.x, PARTY_RACK.y);
    const rackDist = partyDistTiles(
      RACK.x * CELL_SIZE,
      RACK.wy,
      RACK.y * CELL_SIZE,
      PARTY_RACK.x,
      PARTY_RACK.y,
      { prop: true }
    );
    const rack = lighting.sampleVertex(
      RACK.x * CELL_SIZE,
      RACK.wy,
      RACK.y * CELL_SIZE,
      RACK.x,
      RACK.y,
      false,
      true
    );
    const rackFloor = lighting.sourceLight(RACK.x, RACK.y);

    console.log('PROP_LANTERN', {
      desk: { dist: deskDist, weight: propWeight(deskDist), luma: desk.luma, floorLuma: deskFloor.luma },
      rack: { dist: rackDist, weight: propWeight(rackDist), luma: rack.luma, floorLight: rackFloor }
    });

    expect(deskDist).toBeLessThan(1.1);
    expect(propWeight(deskDist)).toBeGreaterThanOrEqual(0.25);
    expect(desk.luma, 'desk top at 1 tile').toBeGreaterThanOrEqual(0.25);
    expect(deskFloor.luma, 'floor under the desk stays on the steep puddle').toBeLessThan(0.08);

    expect(rackDist).toBeGreaterThan(1.9);
    expect(rackDist).toBeLessThan(PROP_LANTERN_RADIUS_TILES);
    expect(propWeight(rackDist)).toBeGreaterThan(0.1);
    expect(propWeight(rackDist)).toBeLessThan(0.18);
    expect(rack.luma, 'rack at (9,10) from (11,10) — 2 tiles').toBeGreaterThan(0.1);
    expect(rack.luma).toBeLessThan(0.16);
    expect(rackFloor, 'floor at the rack stays unlit at 2 tiles').toBe(0);
  });

  it('softens the oil lantern on side walls instead of a sliding mid-wall smear', () => {
    expect(WALL_LANTERN_RADIUS_TILES).toBe(2);
    expect(WALL_LANTERN_INTENSITY).toBe(0.4);

    const lighting = new VertexLightingManager(floor1, [], { floor: 1, bright: 1, oil: () => 2 });
    const party = { x: 7, y: 1 };
    lighting.setPartyPosition(party.x, party.y);

    const wallX = party.x * CELL_SIZE - CELL_SIZE / 2;
    const wallZ = party.y * CELL_SIZE;
    const sample = (wy: number, dzTiles: number, tileY = party.y) =>
      lighting.sampleVertex(wallX, wy, wallZ + dzTiles * CELL_SIZE, party.x, tileY, false, false, true)
        .luma;

    const bottom = sample(0.2, 0);
    const mid = sample(0.88, 0);
    const top = sample(1.6, 0);
    const along1 = sample(0.88, 1, party.y + 1);
    const along2 = sample(0.88, 2, party.y + 2);
    const floorAhead = lighting.calculateBrightness(party.x, party.y + 1, false);

    console.log('WALL_LANTERN', { bottom, mid, top, along1, along2, floorAhead });

    expect(mid, 'adjacent side wall is lantern-lit').toBeGreaterThan(0.18);
    expect(Math.abs(mid - bottom), 'no baseboard-vs-mid height hole').toBeLessThan(0.08);
    expect(Math.abs(mid - top), 'ceiling-adjacent wall matches mid-wall').toBeLessThan(0.12);
    expect(along1, '1-tile wall still has a soft tail').toBeGreaterThan(0.08);
    expect(along1).toBeLessThan(mid);
    expect(along2, '2-tile wall is at the lantern edge').toBeLessThan(along1);
    expect(along2).toBeLessThan(0.08);
    expect(floorAhead, 'floor puddle stays steep').toBeLessThan(0.08);
  });

  it('keeps the slime lair unlit and (19,8) at ambient', () => {
    const lighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: 1,
      bright: 1,
      oil: () => 2
    });
    const ambient = lighting.ambientBrightness();
    expect(ambient).toBeCloseTo(0.05848, 5);

    for (const [px, py] of [
      [19, 5],
      [19, 6]
    ] as const) {
      lighting.setPartyPosition(px, py);
      expect(lighting.isSquareLit(19, 7), `slime (19,7) unlit from (${px},${py})`).toBe(false);
      expect(lighting.sourceLight(19, 7), `slime floor has no lantern/torch from (${px},${py})`).toBeLessThan(
        0.08
      );
      expect(
        lighting.calculateBrightness(19, 8, false),
        `(19,8) stays ambient from (${px},${py})`
      ).toBeCloseTo(0.05848, 5);
    }
  });

  it('torch-lit west wall has no mid-wall height hole while stepping north', () => {
    const lighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: 1,
      bright: 1,
      oil: () => 2
    });
    const wallX = 1 * CELL_SIZE - CELL_SIZE / 2;
    for (const py of [7, 6, 5]) {
      lighting.setPartyPosition(1, py);
      const sample = (wy: number) =>
        lighting.sampleVertex(wallX, wy, py * CELL_SIZE, 1, py, false, false, true).luma;
      const bottom = sample(0.2);
      const mid = sample(0.88);
      const top = sample(1.6);
      expect(Math.abs(mid - bottom), `height hole beside party at y=${py}`).toBeLessThan(0.12);
      expect(Math.abs(mid - top), `top vs mid at y=${py}`).toBeLessThan(0.12);
    }
  });

  it('QA wall at (4,5) has no lantern-torch valley toward the (6,4) S sconce', () => {
    expect(FACE_SEGMENTS).toBe(8);
    const lighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: 1,
      bright: 1,
      oil: () => 2
    });
    lighting.setPartyPosition(4, 5);
    const wz = 5 * CELL_SIZE - CELL_SIZE / 2;
    const lumas: number[] = [];
    for (let i = 0; i <= 20; i++) {
      const x = 4 + i * 0.1;
      const tileX = Math.floor(x + 1e-6);
      lumas.push(lighting.sampleVertex(x * CELL_SIZE, 0.88, wz, tileX, 5, false, false, true).luma);
    }
    expect(lumas[0], 'lantern on the near wall').toBeGreaterThan(0.2);
    expect(lumas[lumas.length - 1], 'torch under the (6,4) sconce').toBeGreaterThan(0.7);
    expect(valleyDip(lumas), `lantern-torch wall dip`).toBeLessThanOrEqual(0.04);
  });

  it('multiplies MeshBasic by a lighting factor (no fragment wall shader)', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/vertex-lighting.ts'), 'utf8');
    expect(FACE_SEGMENTS, '8-seg Gouraud keeps torch glow on side walls (matches main)').toBe(8);
    expect(src).toContain('sourceLight(tileX');
    expect(src).not.toContain('patchSurfaceLightMaterial');
    expect(src).toContain('if (this.lightDebug === \'albedo\') return [1, 1, 1]');
  });

  it('isolates albedo as white vertex colour so the (2,1)E dip can be compared to texture', () => {
    const lighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: 1,
      bright: 1,
      oil: () => 2
    });
    lighting.setPartyPosition(2, 1);
    const wx = 2 * CELL_SIZE;
    const wz = 1 * CELL_SIZE - CELL_SIZE / 2;
    const lit = lighting.sampleVertex(wx, 0.88, wz, 2, 1, false, false, true);
    expect(lit.luma).toBeGreaterThan(0.05);
    lighting.setLightDebug('albedo');
    const albedo = lighting.sampleVertex(wx, 0.88, wz, 2, 1, false, false, true);
    expect(albedo.rgb).toEqual([1, 1, 1]);
    lighting.setLightDebug('ambient');
    const amb = lighting.sampleVertex(wx, 0.88, wz, 2, 1, false, false, true);
    expect(amb.luma).toBeCloseTo(lighting.ambientBrightness(), 3);
    lighting.setLightDebug('lantern');
    const lantern = lighting.sampleVertex(wx, 0.88, wz, 2, 1, false, false, true);
    expect(lantern.luma).toBeGreaterThan(0.05);
    lighting.setLightDebug('torch');
    const torch = lighting.sampleVertex(wx, 0.88, wz, 2, 1, false, false, true);
    expect(torch.luma).toBeGreaterThan(lantern.luma);
  });

  it('has no lantern-torch valley at the QA viewpoints', () => {
    const lighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: 1,
      bright: 1,
      oil: () => 2
    });

    const alongX = (partyX: number, partyY: number, x0: number, x1: number, wz: number, tileY: number) => {
      lighting.setPartyPosition(partyX, partyY);
      const lumas: number[] = [];
      const steps = 20;
      for (let i = 0; i <= steps; i++) {
        const x = x0 + ((x1 - x0) * i) / steps;
        const tileX = Math.floor(x + 1e-6);
        lumas.push(lighting.sampleVertex(x * CELL_SIZE, 0.88, wz, tileX, tileY, false, false, true).luma);
      }
      return lumas;
    };
    const alongZ = (partyX: number, partyY: number, z0: number, z1: number, wx: number, tileX: number) => {
      lighting.setPartyPosition(partyX, partyY);
      const lumas: number[] = [];
      const steps = 20;
      for (let i = 0; i <= steps; i++) {
        const z = z0 + ((z1 - z0) * i) / steps;
        const tileY = Math.floor(z + 1e-6);
        lumas.push(lighting.sampleVertex(wx, 0.88, z * CELL_SIZE, tileX, tileY, false, false, true).luma);
      }
      return lumas;
    };

    const spots: Array<{ name: string; lumas: number[] }> = [
      {
        name: '(2,1) east — north wall toward torch (4,1)',
        lumas: alongX(2, 1, 2, 3.6, 1 * CELL_SIZE - CELL_SIZE / 2, 1)
      },
      {
        name: '(4,5) east — north wall toward torch (6,4)',
        lumas: alongX(4, 5, 4, 6, 5 * CELL_SIZE - CELL_SIZE / 2, 5)
      },
      {
        // Own square (3,5) is outside torch flood (origin 6,5). Sample the
        // receding north wall that actually mixes lantern + torch.
        name: '(3,5) east — north wall of (4,5)–(6,5) toward torch (6,4)',
        lumas: alongX(3, 5, 4, 6, 5 * CELL_SIZE - CELL_SIZE / 2, 5)
      },
      {
        name: '(1,4) south — west wall toward torch (0,6)',
        lumas: alongZ(1, 4, 4, 6, 1 * CELL_SIZE - CELL_SIZE / 2, 1)
      },
      {
        name: '(3,2) north — east wall toward door (4,2) / torch (4,1)',
        lumas: alongZ(3, 2, 2, 1, 3 * CELL_SIZE + CELL_SIZE / 2, 3)
      },
      {
        name: '(3,3) north — east wall toward door (4,2) / torch (4,1)',
        lumas: alongZ(3, 3, 3, 1, 3 * CELL_SIZE + CELL_SIZE / 2, 3)
      }
    ];

    for (const { name, lumas } of spots) {
      const dip = valleyDip(lumas);
      expect(dip, `${name} dip ${dip.toFixed(3)}`).toBeLessThanOrEqual(0.04);
      expect(Math.max(...lumas), `${name} has some light`).toBeGreaterThan(0.12);
    }
  });

  it('keeps gameplay tile-light on max() so no floor-1 square flips dark/lit', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/vertex-lighting.ts'), 'utf8');
    const dark = readFileSync(resolve(__dirname, '../src/proto3d/dark-fx.ts'), 'utf8');
    const shade = src.slice(src.indexOf('private shadeVertex'), src.indexOf('private lightTileOf'));
    const gameplay = src.slice(src.indexOf('sourceLight(tileX'), src.indexOf('isSquareLit'));
    expect(gameplay).toContain('Math.max(maxW');
    expect(gameplay).not.toContain('screenAccum');
    expect(src).toContain('screenAccum');
    expect(shade).toContain('const geometry = !isProp');
    expect(shade).toContain('if (geometry) this.screenAccum');
    expect(shade).toContain('else this.maxAccum');
    expect(dark).toContain('squareLit: lighting.isSquareLit(sprite.x, sprite.y)');

    const snapshot = JSON.parse(
      readFileSync(resolve(__dirname, './fixtures/floor1-gameplay-source-light.json'), 'utf8')
    ) as {
      width: number;
      height: number;
      poses: Record<string, Record<string, number>>;
    };
    expect(snapshot.width).toBe(floor1.width);
    expect(snapshot.height).toBe(floor1.height);

    const lighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: 1,
      bright: 1,
      oil: () => 2
    });
    const expectedLit: Record<string, string> = {
      '4,5': '2,1|3,1|2,2|3,2|3,3|1,4|1,5|2,5|4,5|5,5|6,5|7,5|1,6|2,6|5,6|6,6|7,6|1,7|2,7',
      '1,7': '2,1|3,1|2,2|3,2|3,3|1,4|1,5|2,5|4,5|5,5|6,5|7,5|1,6|2,6|5,6|6,6|7,6|1,7|2,7',
      '19,5': '2,1|3,1|2,2|3,2|3,3|1,4|1,5|2,5|4,5|5,5|6,5|7,5|19,5|1,6|2,6|5,6|6,6|7,6|1,7|2,7',
      '19,6': '2,1|3,1|2,2|3,2|3,3|1,4|1,5|2,5|4,5|5,5|6,5|7,5|1,6|2,6|5,6|6,6|7,6|19,6|1,7|2,7',
      '11,9': '2,1|3,1|2,2|3,2|3,3|1,4|1,5|2,5|4,5|5,5|6,5|7,5|1,6|2,6|5,6|6,6|7,6|1,7|2,7|11,9',
      '3,14': '2,1|3,1|2,2|3,2|3,3|1,4|1,5|2,5|4,5|5,5|6,5|7,5|1,6|2,6|5,6|6,6|7,6|1,7|2,7|3,14'
    };
    expect(Object.keys(snapshot.poses).sort()).toEqual(Object.keys(expectedLit).sort());
    for (const [pose, want] of Object.entries(expectedLit)) {
      const [px, py] = pose.split(',').map(Number);
      lighting.setPartyPosition(px, py);
      const frozen = snapshot.poses[pose];
      expect(frozen, `snapshot pose ${pose}`).toBeTruthy();
      const lit: string[] = [];
      for (let y = 0; y < floor1.height; y++) {
        for (let x = 0; x < floor1.width; x++) {
          const w = lighting.sourceLight(x, y);
          const wantW = frozen[`${x},${y}`] ?? 0;
          expect(w, `sourceLight(${x},${y}) from lantern (${pose})`).toBeCloseTo(wantW, 10);
          expect(lighting.isSquareLit(x, y)).toBe(w >= DARK_LIGHT_THRESHOLD);
          expect(
            monsterBodyVisible({ adjacent: false, squareLit: lighting.isSquareLit(x, y) }),
            `monster body at (${x},${y}) from (${pose})`
          ).toBe(wantW >= DARK_LIGHT_THRESHOLD);
          if (w >= DARK_LIGHT_THRESHOLD) lit.push(`${x},${y}`);
        }
      }
      expect(lit.join('|'), `gameplay lit set from (${pose})`).toBe(want);
      expect(lighting.isSquareLit(19, 7), `lair body square stays unlit from (${pose})`).toBe(false);
    }
  });

  it("Pell's capped lamp at (13,9) still emits nothing", () => {
    expect(floor1Sconces.some((s) => s.x === LAMP.x && s.y === LAMP.y)).toBe(false);

    const lighting = new VertexLightingManager(floor1, floor1Sconces, { floor: 1, bright: 1, oil: () => 2 });
    lighting.setPartyPosition(1, 7);
    expect(lighting.sourceLight(LAMP.x, LAMP.y)).toBe(0);

    lighting.setPartyPosition(PARTY_DESK.x, PARTY_DESK.y);
    expect(lighting.sourceLight(LAMP.x, LAMP.y), 'lamp tile floor is outside the oil puddle').toBe(0);
  });
});
