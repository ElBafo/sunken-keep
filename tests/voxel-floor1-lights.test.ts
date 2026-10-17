import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { floor1 } from '../public/levels/floor1';
import dressing from '../public/levels/dressing_act1.json';
import {
  FACE_INTO_ROOM,
  beamKey,
  floodReach,
  floor1Sconces,
  floor1Sunbeams,
  sconceIsLit,
  sconceRoom,
  torchWorldPos
} from '../src/voxel-floor1/fixtures';
import {
  BRACKET_FLAME_OUT,
  CELL,
  CRACKED_CEILING_FILE,
  CULL_CHEB,
  FOG_FAR,
  IRON_COLOR,
  MAX_ACTIVE_SUNBEAMS,
  MAX_ACTIVE_TORCHES,
  SCONCE_RADIUS_TILES,
  SUNBEAM_ANGLE,
  SUNBEAM_DECAY,
  SUNBEAM_DISTANCE,
  SUNBEAM_INTENSITY,
  SUNBEAM_PENUMBRA,
  SUNBEAM_RADIUS_TILES,
  SUNBEAM_RGB,
  TORCH_DECAY,
  TORCH_DISTANCE,
  TORCH_INTENSITY,
  TORCH_RGB
} from '../src/voxel-floor1/constants';
import { floor1Map, enumerateFaces, isWalkableTile, tileAt } from '../src/voxel-floor1/layout';
import { buildBracketOccupancy, MAT_IRON } from '../src/voxel-floor1/bracket';
import { compositeCrackedCeiling, crackedCeilingHasGap, isBeamCeiling } from '../src/voxel-floor1/crack';
import {
  FAR_BAKE_SEGS,
  bakeBeamWeights,
  bakeWeights,
  flatGeometryWithBake,
  litFarBeams,
  litFarTorches,
  spotAttenuation,
  tileInBeamFlood,
  tileInLightFlood,
  tileInTorchFlood,
  torchAttenuation
} from '../src/voxel-floor1/bake';
import {
  allModeSlotCounts,
  parseLightMode,
  parseLightsQuery,
  qualityFromLightMode,
  QUALITY_STORAGE_KEY
} from '../src/voxel-floor1/lights';
import { tileFlatPose } from '../src/voxel-lab/faces';

describe('voxel-floor1 torches match the game sconce table', () => {
  it('uses floor1.sconces at the same squares and walls', () => {
    expect(floor1Sconces).toEqual(floor1.sconces);
    expect(floor1Sconces.filter(sconceIsLit)).toEqual([
      { x: 0, y: 6, face: 'E', lit: true, capped: false },
      { x: 4, y: 1, face: 'W', lit: true, capped: false },
      { x: 6, y: 4, face: 'S', lit: true, capped: false }
    ]);
  });

  it('puts the flame off the wall in the walkable room at (1,6)', () => {
    expect(sconceRoom(floor1Sconces[0])).toEqual({ x: 1, y: 6 });
    expect(isWalkableTile(tileAt(floor1Map, 1, 6))).toBe(true);
    const pos = torchWorldPos(floor1Sconces[0]);
    const wallX = 0 * CELL + FACE_INTO_ROOM.E.nx * (CELL / 2);
    expect(pos.x).toBeCloseTo(wallX + BRACKET_FLAME_OUT, 5);
    expect(pos.x).toBeGreaterThan(wallX + 0.2);
  });

  it('does not leak torch flood through walls to the New Game square', () => {
    const room = sconceRoom(floor1Sconces[0]);
    const reach = floodReach(floor1Map, room.x, room.y, SCONCE_RADIUS_TILES);
    expect(reach.has('1,6')).toBe(true);
    expect(reach.has('3,14')).toBe(false);
    expect(reach.has('19,7')).toBe(false);
  });
});

describe('voxel iron brackets', () => {
  it('greedy-merges a few dark iron cubes, not pale silver', () => {
    const { volume, voxelCount } = buildBracketOccupancy(false);
    expect(voxelCount).toBeGreaterThan(30);
    expect(volume.includes(MAT_IRON)).toBe(true);
    const r = (IRON_COLOR >> 16) & 255;
    const g = (IRON_COLOR >> 8) & 255;
    const b = IRON_COLOR & 255;
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    expect(luma).toBeLessThan(0.12);
    expect(r).toBeLessThan(40);
  });
});

describe('voxel-floor1 crack beams match dressing_act1', () => {
  it('places the same three floor-1 sunbeams as Classic', () => {
    const src = dressing.floor1.sunbeam.map((s) => `${s.x},${s.y}`).sort();
    const got = floor1Sunbeams.map((s) => `${s.x},${s.y}`).sort();
    expect(got).toEqual(src);
    expect(floor1Sunbeams.some((s) => s.x === 11 && s.y === 2)).toBe(true);
    expect(floor1Sunbeams[0].wx).toBeCloseTo(floor1Sunbeams[0].x * CELL, 8);
  });

  it('uses a cracked ceiling only on beam squares', () => {
    const jobs = enumerateFaces(floor1Map);
    const cracked = jobs.filter((j) => isBeamCeiling(j.tx, j.tz, floor1Sunbeams) && j.kind === 'ceiling');
    expect(cracked.length).toBe(floor1Sunbeams.length);
    const plainCeil = jobs.filter((j) => j.kind === 'ceiling' && !isBeamCeiling(j.tx, j.tz, floor1Sunbeams));
    expect(plainCeil.every((j) => j.file !== CRACKED_CEILING_FILE)).toBe(true);
  });

  it('punches a jagged light gap through the ceiling texture', () => {
    const W = 16;
    const ceil = { width: W, height: W, data: new Uint8ClampedArray(W * W * 4) };
    const crack = { width: W, height: W, data: new Uint8ClampedArray(W * W * 4) };
    for (let i = 0; i < W * W; i++) {
      ceil.data[i * 4] = 80;
      ceil.data[i * 4 + 1] = 82;
      ceil.data[i * 4 + 2] = 78;
      ceil.data[i * 4 + 3] = 255;
    }
    for (let x = 2; x < 14; x++) {
      const i = (8 * W + x) * 4;
      crack.data[i] = 255;
      crack.data[i + 1] = 236;
      crack.data[i + 2] = 170;
      crack.data[i + 3] = 255;
    }
    const out = compositeCrackedCeiling(ceil, crack);
    expect(crackedCeilingHasGap(out)).toBe(true);
  });
});

describe('far torch bake lights the painted texture', () => {
  it('weights only tiles in the torch flood, so unlit rooms stay dark', () => {
    const torches = litFarTorches(floor1Map, floor1Sconces);
    expect(torches.length).toBe(3);
    const south = torches.find((t) => t.key.endsWith(',S'));
    expect(south).toBeTruthy();
    const near = bakeWeights(6, 5, 6 * CELL, 0.1, 5 * CELL, torches);
    expect(near[0] + near[1] + near[2]).toBeGreaterThan(0.2);
    const wall = bakeWeights(6, 5, 6 * CELL, CELL / 2, 5 * CELL - CELL / 2, torches);
    expect(wall[0] + wall[1] + wall[2]).toBeGreaterThan(0.15);
    const ceil = bakeWeights(6, 5, 6 * CELL, CELL - 0.05, 5 * CELL, torches);
    expect(ceil[0] + ceil[1] + ceil[2]).toBeGreaterThan(0.1);
    const start = bakeWeights(3, 14, 3 * CELL, 0.1, 14 * CELL, torches);
    expect(start[0] + start[1] + start[2]).toBe(0);
  });

  it('does not widen the 2.5-tile bubble, and keeps that pool past the view cull', () => {
    expect(SCONCE_RADIUS_TILES).toBe(2.5);
    expect(CULL_CHEB).toBe(Math.ceil(FOG_FAR / CELL));
    expect(CULL_CHEB).toBeGreaterThanOrEqual(14);
    const torches = litFarTorches(floor1Map, floor1Sconces);
    const south = torches.find((t) => t.key.endsWith(',S'));
    expect(south?.reach.has('6,5')).toBe(true);
    expect(south?.reach.has('4,5')).toBe(true);
    expect(south?.reach.has('3,5')).toBe(false);
    expect(tileInTorchFlood(6, 5, torches)).toBe(true);
    expect(tileInTorchFlood(3, 14, torches)).toBe(false);
  });

  it('keeps the mounting wall in the flood, with a hotspot the 4-vert far quad would miss', () => {
    const east = floor1Sconces.find((s) => s.x === 0 && s.y === 6 && s.face === 'E');
    expect(east).toBeTruthy();
    const room = sconceRoom(east!);
    const torches = litFarTorches(floor1Map, floor1Sconces);
    expect(tileInTorchFlood(room.x, room.y, torches)).toBe(true);
    const flame = torchWorldPos(east!);
    const wallX = east!.x * CELL + FACE_INTO_ROOM[east!.face].nx * (CELL / 2);
    const wallZ = east!.y * CELL + FACE_INTO_ROOM[east!.face].nz * (CELL / 2);
    const hot = bakeWeights(room.x, room.y, wallX, flame.y, wallZ, torches);
    const corner = bakeWeights(room.x, room.y, wallX, 0.05, wallZ - CELL / 2, torches);
    expect(hot[0] + hot[1] + hot[2]).toBeGreaterThan(2);
    expect(hot[0] + hot[1] + hot[2]).toBeGreaterThan((corner[0] + corner[1] + corner[2]) * 4);
  });

  it('shares PointLight colour, range and inverse-square decay with the near lights', () => {
    expect(TORCH_RGB[0]).toBeCloseTo(1, 5);
    expect(TORCH_RGB[1]).toBeLessThan(0.65);
    expect(TORCH_RGB[2]).toBeLessThan(0.35);
    expect(TORCH_DECAY).toBe(2);
    expect(TORCH_DISTANCE).toBe(SCONCE_RADIUS_TILES * CELL);
    expect(torchAttenuation(TORCH_DISTANCE)).toBe(0);
    expect(torchAttenuation(TORCH_DISTANCE + 0.01)).toBe(0);
    expect(torchAttenuation(1)).toBeGreaterThan(torchAttenuation(2));
    expect(torchAttenuation(2)).toBeGreaterThan(torchAttenuation(4));
    const farPool = bakeWeights(4, 5, 4 * CELL, 0.1, 5 * CELL, litFarTorches(floor1Map, floor1Sconces));
    const midPool = bakeWeights(5, 5, 5 * CELL, 0.1, 5 * CELL, litFarTorches(floor1Map, floor1Sconces));
    expect(midPool[0] + midPool[1] + midPool[2]).toBeGreaterThan(farPool[0] + farPool[1] + farPool[2]);
  });
});

describe('far beam bake matches the near SpotLight', () => {
  it('lights only the cone on reachable tiles, so unlit rooms stay dark', () => {
    const beams = litFarBeams(floor1Map, floor1Sunbeams);
    expect(beams.length).toBe(3);
    const beam = floor1Sunbeams.find((b) => b.x === 2 && b.y === 6);
    expect(beam).toBeTruthy();
    const centre = bakeBeamWeights(2, 6, beam!.wx, 0.1, beam!.wz, beams);
    expect(centre[0] + centre[1] + centre[2]).toBeGreaterThan(0.15);
    const neighbour = bakeBeamWeights(2, 7, beam!.wx, 0.1, beam!.wz + CELL, beams);
    expect(neighbour[0] + neighbour[1] + neighbour[2]).toBe(0);
    const start = bakeBeamWeights(3, 14, 3 * CELL, 0.1, 14 * CELL, beams);
    expect(start[0] + start[1] + start[2]).toBe(0);
  });

  it('does not widen the 2-tile flood or the spot cone', () => {
    expect(SUNBEAM_RADIUS_TILES).toBe(2);
    expect(SUNBEAM_ANGLE).toBeCloseTo(Math.PI / 7, 8);
    expect(SUNBEAM_PENUMBRA).toBeCloseTo(0.45, 8);
    expect(SUNBEAM_DECAY).toBeCloseTo(1.2, 8);
    expect(SUNBEAM_DISTANCE).toBe(CELL * 2.4);
    const beams = litFarBeams(floor1Map, floor1Sunbeams);
    expect(tileInBeamFlood(2, 6, beams)).toBe(true);
    expect(tileInBeamFlood(2, 7, beams)).toBe(true);
    expect(tileInBeamFlood(3, 14, beams)).toBe(false);
    expect(tileInLightFlood(2, 6, litFarTorches(floor1Map, floor1Sconces), beams)).toBe(true);
    expect(spotAttenuation(1)).toBeCloseTo(1, 5);
    expect(spotAttenuation(Math.cos(SUNBEAM_ANGLE))).toBe(0);
  });

  it('shares SpotLight colour, intensity and falloff with the near lights', () => {
    expect(SUNBEAM_RGB[2]).toBeCloseTo(1, 5);
    expect(SUNBEAM_RGB[0]).toBeGreaterThan(0.65);
    expect(SUNBEAM_RGB[0]).toBeLessThan(SUNBEAM_RGB[2]);
    expect(SUNBEAM_INTENSITY).toBeCloseTo(0.38 * 8, 8);
    expect(torchAttenuation(SUNBEAM_DISTANCE, SUNBEAM_DISTANCE, SUNBEAM_DECAY)).toBe(0);
    expect(torchAttenuation(1, SUNBEAM_DISTANCE, SUNBEAM_DECAY)).toBeGreaterThan(
      torchAttenuation(2, SUNBEAM_DISTANCE, SUNBEAM_DECAY)
    );
    expect(beamKey({ x: 2, y: 6 })).toBe('beam:2,6');
  });
});

describe('active light cap', () => {
  it('keeps a small torch/sunbeam pool so the shader cannot blow up', () => {
    expect(MAX_ACTIVE_TORCHES).toBe(2);
    expect(MAX_ACTIVE_SUNBEAMS).toBe(1);
    expect(MAX_ACTIVE_TORCHES).toBeLessThan(floor1Sconces.filter(sconceIsLit).length);
    expect(TORCH_INTENSITY).toBeLessThan(6);
  });
});

describe('far flood stays on subdivided MeshBasic, not dense voxels', () => {
  it('subdivides flood flats so the torch-wall hotspot is not a 4-vert miss', () => {
    expect(FAR_BAKE_SEGS).toBe(8);
    const torches = litFarTorches(floor1Map, floor1Sconces);
    const beams = litFarBeams(floor1Map, floor1Sunbeams);
    const pose = tileFlatPose('W', 1, 6, CELL, 'center');
    const geo = flatGeometryWithBake([{ pose, tx: 1, tz: 6, segs: FAR_BAKE_SEGS }], torches, CELL, beams);
    expect(geo).toBeTruthy();
    const verts = geo!.getAttribute('position').count;
    expect(verts).toBe((FAR_BAKE_SEGS + 1) * (FAR_BAKE_SEGS + 1));
    const farW = geo!.getAttribute('aFarW');
    let maxW = 0;
    for (let i = 0; i < farW.count; i++) {
      maxW = Math.max(maxW, farW.getX(i) + farW.getY(i) + farW.getZ(i));
    }
    expect(maxW).toBeGreaterThan(2);
  });
});

describe('light modes', () => {
  it('defaults to Max (all real lights); ?lights=all|bake still override', () => {
    expect(parseLightMode('')).toBe('all');
    expect(parseLightMode('test=1&dev=1')).toBe('all');
    expect(parseLightMode('?lights=pool')).toBe('all');
    expect(parseLightMode('lights=all&test=1')).toBe('all');
    expect(parseLightMode('lights=bake')).toBe('bake');
    expect(parseLightMode('?lights=bake&dev=1')).toBe('bake');
    expect(parseLightMode('lights=nope')).toBe('all');
    expect(parseLightsQuery('')).toBeNull();
    expect(parseLightsQuery('lights=pool')).toBeNull();
  });

  it('keeps stored Medium unless the URL overrides', () => {
    expect(parseLightMode('', 'medium')).toBe('bake');
    expect(parseLightMode('test=1', 'max')).toBe('all');
    expect(parseLightMode('lights=bake', 'max')).toBe('bake');
    expect(parseLightMode('lights=all', 'medium')).toBe('all');
    expect(qualityFromLightMode('all')).toBe('max');
    expect(qualityFromLightMode('bake')).toBe('medium');
    expect(QUALITY_STORAGE_KEY).toBe('voxel-floor1-quality');
  });

  it('gives all-mode a real light for every lit torch and beam, not a cap of 3', () => {
    const n = allModeSlotCounts(floor1Sconces, floor1Sunbeams);
    expect(n.torches).toBe(floor1Sconces.filter(sconceIsLit).length);
    expect(n.beams).toBe(floor1Sunbeams.length);
    expect(n.torches).toBeGreaterThan(MAX_ACTIVE_TORCHES);
    expect(n.beams).toBeGreaterThan(MAX_ACTIVE_SUNBEAMS);
    expect(n.torches).toBe(3);
    expect(n.beams).toBe(3);
    const extra = allModeSlotCounts(
      [...floor1Sconces, { x: 9, y: 9, face: 'N', lit: true, capped: false }],
      [...floor1Sunbeams, { x: 0, y: 0, wx: 0, wy: 0, wz: 0 }]
    );
    expect(extra.torches).toBe(4);
    expect(extra.beams).toBe(4);
  });
});

describe('voxel-floor1 still does not import proto3d', () => {
  it('keeps new torch files off proto3d renderer modules', () => {
    const dir = resolve(__dirname, '../src/voxel-floor1');
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.ts')) continue;
      const src = readFileSync(resolve(dir, name), 'utf8');
      expect(src, name).not.toContain("from '../proto3d/");
      expect(src, name).not.toContain('lab-render');
    }
  });

  it('builds voxel brackets and camera-facing flame sprites', () => {
    const props = readFileSync(resolve(__dirname, '../src/voxel-floor1/props.ts'), 'utf8');
    expect(props).toContain('meshBracket');
    expect(props).toContain('alphaTest');
    expect(props).toContain('premultipliedAlpha');
    expect(props).toContain('applyWallMountNearCull');
    expect(props).not.toContain('hideWallProp');
    expect(props).not.toContain('THREE.Sprite');
    expect(props).not.toContain('bracket_lit_front');
    const main = readFileSync(resolve(__dirname, '../src/voxel-floor1/main.ts'), 'utf8');
    expect(main).toContain('setBakeBlends');
    expect(main).toContain('CAMERA_VIEW_ASPECT');
    expect(main).toContain('CAMERA_VIEW_W');
    expect(main).toContain('setLookPitch');
    expect(main).toContain('renderer.setSize(CAMERA_VIEW_W, CAMERA_VIEW_H, false)');
    expect(main).not.toContain('TorchLightPools');
    expect(main).toContain('parseLightMode');
    expect(main).toContain('readStoredQuality');
    expect(main).toContain('writeStoredQuality');
    expect(main).toContain('btn-quality');
    expect(main).toContain("lightMode === 'all'");
    expect(main).toContain('beginStep');
    expect(main).toContain('prepareCell');
    expect(main).toContain('setScissor');
    expect(main).toContain("mover.kind === 'step' ? mover.toX");
    expect(main).toContain('stepWorstWorkMs');
    expect(main).not.toContain('shadowMap.enabled = false');
    expect(main).not.toContain('lastLightKey');
    expect(main).not.toContain('if (remeshed) syncShadows()');
    const bake = readFileSync(resolve(__dirname, '../src/voxel-floor1/bake.ts'), 'utf8');
    expect(bake).toContain('farBakeMaterial');
    expect(bake).toContain('MeshBasicMaterial');
    expect(bake).toContain('TORCH_RGB');
    expect(bake).toContain('TORCH_INTENSITY');
    expect(bake).toContain('torchAttenuation');
    expect(bake).toContain('RECIPROCAL_PI');
    expect(bake).toContain('flatGeometryWithBake');
    expect(bake).toContain('tileInTorchFlood');
    expect(bake).toContain('tileInBeamFlood');
    expect(bake).toContain('aFarB');
    expect(bake).toContain('SUNBEAM_RGB');
    expect(bake).toContain('SUNBEAM_INTENSITY');
    expect(bake).toContain('#include <fog_fragment>');
    expect(bake).toContain('farCover');
    expect(bake).toContain('#include <opaque_fragment>');
    expect(bake).toContain('FAR_BAKE_SEGS');
    expect(bake).toContain("kind === 'full'");
    expect(bake).toContain("kind !== 'off'");
    expect(bake).not.toContain('GAME_TORCH_RGB');
    expect(bake).not.toContain('FAR_AMBIENT');
    expect(bake).not.toContain('0.068');
    expect(bake).not.toContain('AdditiveBlending');
    const lights = readFileSync(resolve(__dirname, '../src/voxel-floor1/lights.ts'), 'utf8');
    expect(lights).toContain('TORCH_RGB');
    expect(lights).toContain('TORCH_DECAY');
    expect(lights).toContain('SUNBEAM_RGB');
    expect(lights).toContain('SUNBEAM_DECAY');
    expect(lights).toContain('SUNBEAM_PENUMBRA');
    expect(lights).toContain('beamKey');
    expect(lights).toContain("mode === 'all'");
    expect(lights).not.toContain("mode === 'pool'");
    expect(lights).not.toContain('placePool');
    expect(lights).toContain('allModeSlotCounts');
    expect(lights).toContain('QUALITY_STORAGE_KEY');
    expect(lights).toContain('SLOT_HOLD');
    expect(lights).not.toContain('FAR_TORCH_SLOTS');
    expect(lights).not.toContain('castShadow = row.blend');
    expect(lights).not.toContain('slot.spot.castShadow = false');
    const level = readFileSync(resolve(__dirname, '../src/voxel-floor1/level.ts'), 'utf8');
    expect(level).toContain('flatGeometryWithBake');
    expect(level).toContain('tileInLightFlood');
    expect(level).toContain('inFlood');
    expect(level).toContain('FAR_BAKE_SEGS');
    expect(level).toContain('realLights');
    expect(level).toContain(", 'off'");
    expect(level).toContain('dist <= VOXEL_CHEB');
    expect(level).toContain('prefetch');
    expect(level).toContain('MAX_CELLS');
    expect(level).toContain('pendingWarm');
    expect(level).toContain('pumpQueue');
    expect(level).toContain('receiveWhenOn = false');
    expect(level).toContain('frustumCulled = false');
    expect(level).not.toContain('inFlood) {');
    expect(level).not.toContain('InstancedMesh');
  });
});
