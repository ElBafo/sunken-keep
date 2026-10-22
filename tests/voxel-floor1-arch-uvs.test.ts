import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CELL, CORNICE_HEIGHT, DOOR_WALL_DEPTH } from '../src/voxel-floor1/constants';
import { greedyMesh } from '../src/voxel-lab/mesher';
import {
  makeArchHoleMask,
  holeMaskToVolume,
  makeArchToWorld,
  maskVolumeWithOpening,
  meshDoorOpening,
  solidifyArchVolume
} from '../src/voxel-floor1/openings';
import {
  BRICK_COURSE,
  doorHasLeaf,
  doorOpeningStyle,
  FLOOR1_DOOR_STYLES,
  FRONT_PROUD,
  inOpeningVoid,
  JAMB_TOP,
  JAMB_TOP_LINTEL,
  LINTEL_BEAR,
  LINTEL_H,
  LINTEL_PROUD,
  LEAF_BACK,
  LEAF_FRONT,
  LEAF_PAD,
  LEAF_REVEAL,
  listHeadRoles,
  listIronQuads,
  listLeafQuads,
  listOpeningQuads,
  lintelTop,
  OPEN_U0,
  OPEN_U1,
  OPEN_WIDTH,
  openingPlateRect,
  openingPunchRect,
  openingWallCovered,
  openingWallIsWatertight,
  ROOM_DEPTH,
  wallAboveOpening
} from '../src/voxel-floor1/door-opening';
import { enumerateFaces, floor1Map, listDoors, openingViews } from '../src/voxel-floor1/layout';
import {
  listSkewedQuads,
  projectArchOpeningUvs,
  quadIsStreaked,
  quadTexelDensityRatio
} from '../src/voxel-floor1/uv-audit';

const W = 32;
const H = 32;
const D = 3;

function solidWall(): { volume: Uint8Array; dims: [number, number, number] } {
  return { volume: new Uint8Array(W * H * D).fill(1), dims: [W, H, D] };
}

function archOpening(): { volume: Uint8Array; dims: [number, number, number] } {
  return { volume: holeMaskToVolume(makeArchHoleMask(W, H), W, H, D), dims: [W, H, D] };
}

function rawArchMesh(face: 'N' | 'E' | 'S' | 'W', tx: number, tz: number) {
  const wall = solidWall();
  const opening = archOpening();
  const punched = maskVolumeWithOpening(wall.volume, wall.dims, opening.volume, opening.dims);
  const arch = solidifyArchVolume(punched, wall.dims);
  const toWorld = makeArchToWorld(face, tx, tz, arch.dims);
  return greedyMesh(arch.volume, arch.dims, toWorld, { cullNeg: [false, false, false] });
}

describe('floor-1 door opening styles', () => {
  const doors = listDoors(floor1Map);
  const views = doors.flatMap((spec) =>
    openingViews(floor1Map, spec.x, spec.y).map((view) => ({
      door: `${spec.x},${spec.y}`,
      style: doorOpeningStyle(spec.x, spec.y),
      ...view
    }))
  );

  it('gives every floor-1 door the same lintel style', () => {
    expect(doors.map((d) => `${d.x},${d.y}`).sort()).toEqual(['14,2', '19,5', '4,2', '6,8']);
    expect(doorOpeningStyle(4, 2)).toBe('lintel');
    expect(doorOpeningStyle(14, 2)).toBe('lintel');
    expect(doorOpeningStyle(6, 8)).toBe('lintel');
    expect(doorOpeningStyle(19, 5)).toBe('lintel');
    expect(Object.keys(FLOOR1_DOOR_STYLES)).toHaveLength(4);
    expect(Object.values(FLOOR1_DOOR_STYLES).every((s) => s === 'lintel')).toBe(true);
  });

  it('cuts a tall rectangle under a heavy lintel and no arch', () => {
    expect(listHeadRoles('lintel')).toEqual(['lintel']);
    const quads = listOpeningQuads('lintel');
    expect(quads.filter((q) => q.role === 'lintel' && q.kind === 'front')).toHaveLength(1);
    expect(quads.every((q) => q.role === 'lintel' || q.role === 'chip' || q.role === 'jamb-soffit')).toBe(true);
    for (const q of quads) {
      expect(q.corners).toHaveLength(4);
    }
    expect(FRONT_PROUD).toBeLessThanOrEqual(0.03);
    expect(LINTEL_PROUD).toBeGreaterThan(FRONT_PROUD);
    expect(LINTEL_PROUD).toBeGreaterThanOrEqual(0.08);
    expect(LINTEL_H).toBeGreaterThanOrEqual(0.25);
    expect(LINTEL_H).toBeLessThanOrEqual(0.3);
    expect(LINTEL_BEAR).toBeGreaterThanOrEqual(0.15);
    expect(LINTEL_BEAR).toBeLessThanOrEqual(0.2);
    expect(OPEN_WIDTH).toBeGreaterThanOrEqual(1.1);
    expect(OPEN_WIDTH).toBeLessThanOrEqual(1.2);
    expect(JAMB_TOP).toBeCloseTo(1.54, 5);
    expect(JAMB_TOP).toBeGreaterThan(OPEN_WIDTH);
    expect(JAMB_TOP + LINTEL_H).toBeCloseTo(lintelTop(), 5);
    expect(lintelTop()).toBeLessThanOrEqual(CELL - CORNICE_HEIGHT + 1e-6);
    expect(openingPlateRect('lintel').v1).toBeCloseTo(lintelTop(), 5);
    expect(openingPlateRect('lintel').v1).toBeGreaterThan(openingPunchRect('lintel').v1);
    expect(wallAboveOpening('lintel')).toBeGreaterThanOrEqual(-1e-6);
    expect(inOpeningVoid('lintel', (OPEN_U0 + OPEN_U1) / 2, 0.6)).toBe(true);
    expect(inOpeningVoid('lintel', (OPEN_U0 + OPEN_U1) / 2, JAMB_TOP - 0.02)).toBe(true);
    expect(inOpeningVoid('lintel', (OPEN_U0 + OPEN_U1) / 2, JAMB_TOP + 0.02)).toBe(false);
    expect(inOpeningVoid('lintel', (OPEN_U0 + OPEN_U1) / 2, lintelTop() - 0.02)).toBe(false);
    expect(inOpeningVoid('lintel', OPEN_U0 + 0.02, JAMB_TOP - 0.02)).toBe(true);
    expect(inOpeningVoid('lintel', (OPEN_U0 + OPEN_U1) / 2, CELL - CORNICE_HEIGHT - 0.01)).toBe(false);
  });

  it('cuts a lintel into the wall under the cornice', () => {
    const quads = listOpeningQuads('lintel');
    expect(quads.filter((q) => q.role === 'lintel' && q.kind === 'front')).toHaveLength(1);
    expect(quads.some((q) => q.role === 'jamb-soffit')).toBe(true);
    expect(wallAboveOpening('lintel')).toBeGreaterThanOrEqual(0);
    expect(lintelTop()).toBeLessThan(CELL - CORNICE_HEIGHT + 1e-6);
    const punch = openingPunchRect('lintel');
    expect(punch.v1).toBeLessThanOrEqual(lintelTop() + 1e-6);
    expect(punch.v1).toBeLessThan(CELL - CORNICE_HEIGHT);
  });

  it('punches only the inner void — no circular soffit and no teeth under the cornice', () => {
    const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/openings.ts'), 'utf8');
    const door = readFileSync(resolve(__dirname, '../src/voxel-floor1/door-opening.ts'), 'utf8');
    expect(src).not.toMatch(/dx \* dx \+ dy \* dy/);
    expect(src).not.toContain('inArch');
    expect(door).not.toMatch(/Math\.sin|Math\.cos|BoxGeometry/);
    expect(door).toContain('listLintelQuads');
    expect(door).not.toContain('listFacetedHeadQuads');
    const punch = openingPunchRect('lintel');
    expect(punch.v1).toBeLessThan(CELL - CORNICE_HEIGHT);
    expect(CELL - CORNICE_HEIGHT - punch.v1).toBeGreaterThanOrEqual(BRICK_COURSE - 1e-6);
  });

  it('fails the density audit on raw mesher UVs (one texel row along the reveal)', () => {
    const raw = rawArchMesh('W', 5, 2);
    const skewed = listSkewedQuads(raw.mesh.positions, raw.mesh.uvs);
    expect(skewed.length).toBeGreaterThan(0);
    expect(skewed.some((q) => q.worldA > 0.12 || q.worldB > 0.12)).toBe(true);
    expect(quadIsStreaked(raw.mesh.positions, raw.mesh.uvs, skewed[0].index, 0.05, 0.02) || skewed[0].ratio < 0.5).toBe(
      true
    );
  });

  it('projects every floor-1 door opening at even wall/floor density', () => {
    const wall = solidWall();
    const failures: string[] = [];
    for (const view of views) {
      const face = view.face as 'N' | 'E' | 'S' | 'W';
      const mesh = meshDoorOpening(wall.volume, wall.dims, face, view.tx, view.tz, view.style);
      expect(mesh.quads).toBeGreaterThan(4);
      const skewed = listSkewedQuads(mesh.positions, mesh.uvs, 0.5);
      if (skewed.length) {
        failures.push(
          `${view.door} ${view.style} ${face} @ ${view.tx},${view.tz}: ${skewed.length} skewed (min ${skewed
            .map((q) => q.ratio)
            .reduce((a, b) => Math.min(a, b), 1)
            .toFixed(3)})`
        );
      }
      for (let v = 0; v + 3 < mesh.positions.length / 3; v += 4) {
        const ratio = quadTexelDensityRatio(mesh.positions, mesh.uvs, v);
        if (ratio === null) continue;
        expect(ratio).toBeGreaterThanOrEqual(0.5);
      }
    }
    expect(failures).toEqual([]);
  });

  it('gives every floor-1 door a leaf that matches its opening, and no plain archways', () => {
    expect(doors.every((d) => doorHasLeaf(d.x, d.y))).toBe(true);
    expect(doors).toHaveLength(4);
    const lintel = listLeafQuads('lintel');
    expect(lintel.filter((q) => q.kind === 'front')).toHaveLength(1);
    const lTop = Math.max(...lintel.flatMap((q) => q.corners.map((c) => c[1])));
    expect(lTop).toBeLessThanOrEqual(JAMB_TOP_LINTEL);
    expect(lTop).toBeCloseTo(JAMB_TOP_LINTEL - LEAF_PAD, 5);
    expect(lTop).toBeLessThan(lintelTop());
    expect(LEAF_REVEAL).toBeCloseTo(DOOR_WALL_DEPTH * 0.25, 5);
    expect(ROOM_DEPTH).toBeCloseTo(0.15, 5);
    expect(DOOR_WALL_DEPTH).toBeCloseTo(0.3, 5);
    expect(Math.abs(LEAF_FRONT - LEAF_BACK)).toBeLessThanOrEqual(ROOM_DEPTH + 1e-6);
    expect(listIronQuads('lintel').length).toBeGreaterThan(8);
    const doorSrc = readFileSync(resolve(__dirname, '../src/voxel-floor1/door-opening.ts'), 'utf8');
    expect(doorSrc).toContain('door_panel');
    expect(doorSrc).toContain('fillLeafArchCorners');
    expect(doorSrc).toContain('woodUv');
    const art = readFileSync(resolve(__dirname, '../docs/ART_DIRECTION.md'), 'utf8');
    expect(art).toContain('No arches');
    expect(art).toContain('slides up');
    expect(art).toContain('rectangular under the lintel');
    expect(art).toContain('plank-column');
    expect(art).toContain('padlock');
    expect(art).toContain('door_panel.png');
    expect(art).toContain('exempt from the antique-oak');
    expect(art).toContain('never near white');
  });

  it('keeps painted doorway floors at 1 UV per cell and documents the styles', () => {
    const floors = enumerateFaces(floor1Map).filter((j) => j.kind === 'floor' && j.file.startsWith('floor_'));
    const doorKeys = new Set(doors.map((d) => `${d.x},${d.y}`));
    const doorFloors = floors.filter((j) => doorKeys.has(`${j.tx},${j.tz}`));
    expect(doorFloors.length).toBe(doors.length);
    const art = readFileSync(resolve(__dirname, '../docs/ART_DIRECTION.md'), 'utf8');
    expect(art).toContain('no relieving arch');
    expect(art).toContain('30 cm');
    expect(art).toContain('carved knot');
    expect(art).toContain('flush');
    expect(art).toContain('one wall between two directly adjacent room cells');
    const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/openings.ts'), 'utf8');
    expect(src).toContain('openingSlabMeshes');
    expect(src).toContain('leafMeshes');
    expect(src).toContain('ceiling_planks_1.png');
    expect(src).toContain('specularIntensity: 0');
    expect(src).toContain('wrapT = THREE.RepeatWrapping');
    expect(src).toContain('door_panel_aged.png');
  });

  it('keeps every lintel doorway watertight from both sides', () => {
    expect(openingWallIsWatertight('lintel', 'front')).toBe(true);
    expect(openingWallIsWatertight('lintel', 'back')).toBe(true);
    const leftU = OPEN_U0 + 0.03;
    const rightU = OPEN_U1 - 0.03;
    const midV = JAMB_TOP + LINTEL_H * 0.5;
    expect(inOpeningVoid('lintel', leftU, midV)).toBe(false);
    expect(inOpeningVoid('lintel', rightU, midV)).toBe(false);
    expect(openingWallCovered('lintel', leftU, midV, 'front')).toBe(true);
    expect(openingWallCovered('lintel', leftU, midV, 'back')).toBe(true);
    expect(openingWallCovered('lintel', rightU, midV, 'front')).toBe(true);
    expect(openingWallCovered('lintel', rightU, midV, 'back')).toBe(true);

    expect(views.length).toBeGreaterThanOrEqual(4);
    for (const view of views) {
      const face = view.face as 'N' | 'E' | 'S' | 'W';
      expect(view.style).toBe('lintel');
      const mesh = meshDoorOpening(solidWall().volume, solidWall().dims, face, view.tx, view.tz, 'lintel');
      expect(mesh.quads).toBeGreaterThan(4);
    }
  });

  it('reprojects a soffit strip that only sampled one texture row', () => {
    const positions = [0, 1.8, 0, 0.03, 1.8, 0, 0.03, 1.8, 0.96, 0, 1.8, 0.96];
    const normals = [0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0];
    const uvs = [0.4, 0.81, 0.42, 0.81, 0.42, 0.81, 0.4, 0.81];
    expect(listSkewedQuads(positions, uvs, 0.5, 0.02).length).toBe(1);
    projectArchOpeningUvs(positions, normals, uvs, 'N', CELL, 0);
    expect(listSkewedQuads(positions, uvs, 0.5, 0.02)).toEqual([]);
    expect(CELL).toBe(2);
  });
});
