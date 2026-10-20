import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BEAM_CEIL_GAP,
  BEAM_DEPTH,
  BEAM_GRID,
  BEAM_WIDTH,
  BEAM_Y,
  STRAP_M,
  TEXEL_M,
  WOOD_TILE_M,
  auditCeilingBeams,
  cellOverlapsBeam,
  isBeamGridLine,
  listBeamStraps,
  listCeilingBeams,
  meshCeilingBeams,
  skipCeilingBeamCell
} from '../src/voxel-floor1/ceiling-beams';
import { CELL } from '../src/voxel-floor1/constants';
import { floor1Sunbeams } from '../src/voxel-floor1/fixtures';
import { floor1Map, listDoors, listSecrets } from '../src/voxel-floor1/layout';

describe('floor-1 ceiling timber', () => {
  const beams = listCeilingBeams(floor1Map);
  const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/ceiling-beams.ts'), 'utf8');

  it('uses a shallow 0.14 × 0.09 rib just below the ceiling', () => {
    expect(BEAM_WIDTH).toBeCloseTo(0.14, 5);
    expect(BEAM_DEPTH).toBeGreaterThanOrEqual(0.08);
    expect(BEAM_DEPTH).toBeLessThanOrEqual(0.1);
    expect(BEAM_Y).toBeCloseTo(CELL - BEAM_CEIL_GAP - BEAM_DEPTH / 2, 5);
    expect(BEAM_Y).toBeGreaterThan(CELL - 0.16);
    expect(beams.length).toBeGreaterThan(12);
    for (const b of beams) {
      expect(b.y).toBeCloseTo(BEAM_Y, 5);
      expect(b.sy).toBeCloseTo(BEAM_DEPTH, 5);
      const cross = Math.min(b.sx, b.sz);
      expect(cross).toBeCloseTo(BEAM_WIDTH, 5);
    }
  });

  it('does not depend on the ceiling tile map', () => {
    expect(src).not.toContain('floor1_floorceil');
    expect(src).not.toContain('mappedCeilingFile');
    expect(src).not.toContain('ceiling_2');
    expect(src).not.toContain('ceiling_cracked');
  });

  it('spans the start corridor short axis every 2 cells', () => {
    const corridor = beams.filter((b) => b.kind === 'corridor' && Math.abs(b.x - 2 * CELL) < 0.2);
    const rows = corridor.map((b) => Math.round(b.z / CELL)).sort((a, b) => a - b);
    expect(rows).toEqual([9, 11, 13]);
    for (const b of corridor) {
      expect(b.sx).toBeCloseTo(CELL, 5);
      expect(b.sz).toBeCloseTo(BEAM_WIDTH, 5);
      expect(b.x - b.sx / 2).toBeCloseTo(1.5 * CELL, 5);
      expect(b.x + b.sx / 2).toBeCloseTo(2.5 * CELL, 5);
    }
  });

  it('gives rooms a parallel pair plus crossing joists', () => {
    const muster = beams.filter((b) => {
      const cx = Math.round(b.x / CELL);
      const cz = Math.round(b.z / CELL);
      return cx >= 1 && cx <= 4 && cz >= 5 && cz <= 7;
    });
    expect(muster.filter((b) => b.kind === 'room').length).toBeGreaterThanOrEqual(2);
    expect(muster.filter((b) => b.kind === 'joist').length).toBeGreaterThanOrEqual(2);
    const guard = beams.filter((b) => b.kind === 'room' && b.x > 8 * CELL && b.x < 13 * CELL);
    expect(guard.length).toBeGreaterThanOrEqual(2);
  });

  it('skips cistern squares and crack sunbeam cells', () => {
    expect(skipCeilingBeamCell(floor1Map, 2, 2)).toBe(true);
    expect(skipCeilingBeamCell(floor1Map, 1, 3)).toBe(true);
    expect(skipCeilingBeamCell(floor1Map, 5, 11)).toBe(true);
    for (const beam of floor1Sunbeams) {
      expect(skipCeilingBeamCell(floor1Map, beam.x, beam.y)).toBe(true);
    }
    for (const b of beams) {
      for (let y = 1; y <= 4; y++) {
        for (let x = 1; x <= 3; x++) {
          expect(cellOverlapsBeam(x, y, b), `${b.kind} over cistern ${x},${y}`).toBe(false);
        }
      }
      for (const sun of floor1Sunbeams) {
        expect(cellOverlapsBeam(sun.x, sun.y, b), `${b.kind} over sunbeam ${sun.x},${sun.y}`).toBe(false);
      }
    }
  });

  it('places 2–3 uneven iron straps per beam, scaled to the slim rib', () => {
    expect(TEXEL_M).toBeCloseTo(0.01, 8);
    expect(WOOD_TILE_M).toBeCloseTo(0.64, 5);
    expect(STRAP_M).toBeCloseTo(0.028, 5);
    for (const b of beams) {
      const straps = listBeamStraps([b]);
      const len = Math.max(b.sx, b.sz);
      expect(straps.length).toBe(len < 2.4 ? 2 : 3);
      const along = b.sx >= b.sz;
      const start = along ? b.x - b.sx / 2 : b.z - b.sz / 2;
      const ts = straps.map((s) => ((along ? s.x : s.z) - start) / len);
      expect(Math.min(...ts)).toBeGreaterThan(0.05);
      expect(Math.max(...ts)).toBeLessThan(0.95);
      for (const s of straps) {
        expect(Math.min(s.sx, s.sz)).toBeCloseTo(STRAP_M, 5);
        expect(s.sy).toBeGreaterThan(b.sy);
      }
    }
    const firsts = beams.map((beam) => {
      const s = listBeamStraps([beam])[0];
      const run = beam.sx >= beam.sz;
      const a = run ? beam.x - beam.sx / 2 : beam.z - beam.sz / 2;
      return ((run ? s.x : s.z) - a) / Math.max(beam.sx, beam.sz);
    });
    expect(new Set(firsts.map((t) => t.toFixed(2))).size).toBeGreaterThan(4);
  });

  it('batches wood and straps into MeshPhysical meshes at 1 cm per texel', () => {
    expect(src).toContain('MeshPhysicalMaterial');
    expect(src).toContain('mergeGeometries');
    expect(src).toContain('castWhenOn = false');
    expect(src).toContain('castShadow = false');
    expect(src).toContain('receiveShadow = true');
    expect(src).toContain('sootyOakMap');
    expect(src).toContain('listBeamStraps');
    expect(src).toContain('setWoodUvs');
    expect(src).toContain('[0.27, 0.71]');
    expect(src).toContain('[0.15, 0.49, 0.83]');
    expect(src).toContain('auditCeilingBeams');
    expect(src).not.toContain('chunkCeilingBeams');
    expect(src).not.toContain('UV_TILE');
    const html = readFileSync(resolve(__dirname, '../voxel-floor1.html'), 'utf8');
    expect(html).not.toMatch(/#floor1-canvas[\s\S]*?translate\(-50%/);
    const props = readFileSync(resolve(__dirname, '../src/voxel-floor1/props.ts'), 'utf8');
    expect(props).toContain('meshCeilingBeams');
    expect(props).toContain('listCeilingBeams');
    expect(props).toContain('wood_beam.png');

    const tex = new THREE.Texture();
    const group = meshCeilingBeams(tex, beams);
    expect(group).not.toBeNull();
    expect(group!.isGroup).toBe(true);
    expect(group!.userData.castWhenOn).toBe(false);
    const wood = group!.getObjectByName('ceiling-beams-wood') as THREE.Mesh;
    const straps = group!.getObjectByName('ceiling-beams-straps') as THREE.Mesh;
    expect(wood.isMesh).toBe(true);
    expect(straps.isMesh).toBe(true);
    expect(wood.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(straps.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    for (const mesh of [wood, straps]) {
      expect(mesh.castShadow).toBe(false);
      expect(mesh.userData.castWhenOn).toBe(false);
      expect(mesh.receiveShadow).toBe(true);
    }
    const woodIdx = wood.geometry.getIndex();
    expect(woodIdx && woodIdx.count % 12).toBe(0);
    expect(woodIdx && woodIdx.count / 3).toBe(beams.length * 12);
    wood.geometry.computeBoundingBox();
    const bb = wood.geometry.boundingBox!;
    expect(bb.max.x - bb.min.x).toBeGreaterThan(10);
    expect(bb.max.z - bb.min.z).toBeGreaterThan(10);
    expect(bb.min.y).toBeGreaterThan(1.5);

    const hall = beams.find((b) => b.kind === 'corridor' && Math.abs(b.x - 2 * CELL) < 0.2)!;
    const one = meshCeilingBeams(tex, [hall])!;
    const oneWood = one.getObjectByName('ceiling-beams-wood') as THREE.Mesh;
    const uv = oneWood.geometry.getAttribute('uv');
    const faceU = [16, 17, 18, 19].map((i) => uv.getX(i));
    const faceV = [16, 17, 18, 19].map((i) => uv.getY(i));
    expect(Math.max(...faceU) - Math.min(...faceU)).toBeCloseTo(hall.sx / WOOD_TILE_M, 3);
    expect(Math.max(...faceV) - Math.min(...faceV)).toBeCloseTo(hall.sy / WOOD_TILE_M, 3);
    expect(one.getObjectByName('ceiling-beams-straps')).toBeTruthy();
    const strapIdx = (one.getObjectByName('ceiling-beams-straps') as THREE.Mesh).geometry.getIndex();
    expect(strapIdx && strapIdx.count / 3).toBe(listBeamStraps([hall]).length * 12);
  });

  it('asserts every beam sits on the grid, ends on a wall or the pair, and misses openings', () => {
    expect(BEAM_GRID).toBeCloseTo(CELL / 2, 8);
    expect(isBeamGridLine(2 * CELL)).toBe(true);
    expect(isBeamGridLine(2.5 * CELL)).toBe(true);
    expect(isBeamGridLine(2.28 * CELL)).toBe(false);
    const issues = auditCeilingBeams(floor1Map, beams);
    expect(issues, issues.map((i) => i.message).join('\n')).toEqual([]);
    for (const b of beams) {
      const cross = b.sx >= b.sz ? b.z : b.x;
      expect(isBeamGridLine(cross), `${b.kind} cross ${(cross / CELL).toFixed(3)}`).toBe(true);
    }
    for (const spec of [...listDoors(floor1Map), ...listSecrets(floor1Map)]) {
      expect(skipCeilingBeamCell(floor1Map, spec.x, spec.y)).toBe(true);
      for (const b of beams) {
        expect(cellOverlapsBeam(spec.x, spec.y, b), `${b.kind} over opening ${spec.x},${spec.y}`).toBe(false);
      }
    }
  });
});
