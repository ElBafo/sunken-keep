import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CELL,
  CORNICE_DEPTH,
  CORNICE_HEIGHT,
  CORNICE_SHADOW_ROWS
} from '../src/voxel-floor1/constants';
import {
  CORNICE_U_SCALE,
  corniceFamilyForKind,
  corniceFileForFamily,
  cornicePieces,
  corniceShadowV,
  listCorniceSegments,
  meshCornice,
  setCorniceUvs,
  wearCornicePixels
} from '../src/voxel-floor1/cornice';
import { floor1Map, listDoors, listSecrets, openingViews } from '../src/voxel-floor1/layout';
import { lookForZoneBase, zoneAt } from '../src/voxel-floor1/wall-look';

describe('floor-1 cornice', () => {
  const segs = listCorniceSegments(floor1Map);
  const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/cornice.ts'), 'utf8');
  const props = readFileSync(resolve(__dirname, '../src/voxel-floor1/props.ts'), 'utf8');

  it('is a 0.32 × 0.12 band batched into brick and slab meshes', () => {
    expect(CORNICE_HEIGHT).toBeCloseTo(0.32, 5);
    expect(CORNICE_DEPTH).toBeCloseTo(0.12, 5);
    expect(segs.length).toBeGreaterThan(40);
    for (const s of segs) {
      expect(s.sy).toBeCloseTo(CORNICE_HEIGHT, 5);
      expect(Math.min(s.sx, s.sz)).toBeCloseTo(CORNICE_DEPTH, 5);
      expect(Math.max(s.sx, s.sz)).toBeCloseTo(CELL, 5);
      expect(s.y).toBeCloseTo(CELL - CORNICE_HEIGHT / 2, 5);
    }
    expect(segs.some((s) => s.family === 'brick')).toBe(true);
    expect(segs.some((s) => s.family === 'slab')).toBe(true);
    expect(corniceFamilyForKind('brick')).toBe('brick');
    expect(corniceFamilyForKind('ashlar')).toBe('slab');
    expect(corniceFamilyForKind('banded')).toBe('slab');
    expect(corniceFamilyForKind('etched')).toBe('slab');
    expect(corniceFileForFamily('brick')).toBe('cornice_brick.png');
    expect(corniceFileForFamily('slab')).toBe('cornice_slab.png');
    const group = meshCornice(new THREE.Texture(), new THREE.Texture(), segs);
    expect(group).not.toBeNull();
    expect(group!.getObjectByName('ceiling-cornice-brick')).toBeTruthy();
    expect(group!.getObjectByName('ceiling-cornice-slab')).toBeTruthy();
    const brick = group!.getObjectByName('ceiling-cornice-brick') as THREE.Mesh;
    expect(brick.castShadow).toBe(false);
    expect(brick.receiveShadow).toBe(true);
    expect(brick.userData.castWhenOn).toBe(false);
    expect(props).toContain('meshCornice');
    expect(props).toContain('listCorniceSegments');
    expect(src).toContain('mergeGeometries');
    expect(src).toContain('wearCornicePixels');
    expect(src).toContain('cornicePieces');
    expect(src).not.toContain('ShaderMaterial');
    expect(brick.material).toMatchObject({ roughness: 1, specularIntensity: 0 });
  });

  it('follows the zone wall family and covers secret and door faces', () => {
    const pantry = segs.find((s) => zoneAt(s.tx, s.tz) === 'pantry');
    const gate = segs.find((s) => zoneAt(s.tx, s.tz) === 'entry_gate');
    expect(pantry?.family).toBe('brick');
    expect(gate?.family).toBe('slab');
    expect(lookForZoneBase(2, 11).kind).toBe('ashlar');
    expect(lookForZoneBase(6, 6).kind).toBe('brick');
    for (const secret of listSecrets(floor1Map)) {
      for (const view of openingViews(floor1Map, secret.x, secret.y)) {
        expect(
          segs.some((s) => s.tx === view.tx && s.tz === view.tz && s.face === view.face),
          `secret ${secret.x},${secret.y} ${view.face}`
        ).toBe(true);
      }
    }
    for (const door of listDoors(floor1Map)) {
      for (const view of openingViews(floor1Map, door.x, door.y)) {
        expect(
          segs.some((s) => s.tx === view.tx && s.tz === view.tz && s.face === view.face),
          `door ${door.x},${door.y} ${view.face}`
        ).toBe(true);
      }
    }
  });

  it('maps the painted shadow line onto the underside only', () => {
    expect(CORNICE_SHADOW_ROWS.brick).toBe(10);
    expect(CORNICE_SHADOW_ROWS.slab).toBe(12);
    expect(corniceShadowV('brick')).toBeCloseTo(10 / 64, 5);
    expect(corniceShadowV('slab')).toBeCloseTo(12 / 64, 5);
    const sample = segs.find((s) => s.face === 'N' && s.family === 'slab');
    expect(sample).toBeTruthy();
    const geo = new THREE.BoxGeometry(sample!.sx, sample!.sy, sample!.sz);
    setCorniceUvs(geo, sample!);
    const uv = geo.getAttribute('uv');
    const underside = [12, 13, 14, 15].map((i) => uv.getY(i));
    const front = [16, 17, 18, 19].map((i) => uv.getY(i));
    expect(Math.max(...underside)).toBeLessThanOrEqual(corniceShadowV('slab') + 1e-6);
    expect(Math.min(...underside)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...front)).toBeGreaterThan(corniceShadowV('slab') + 0.05);
    expect(src).toContain('shadowV');
    expect(src).toContain('frontV0');
    expect(CORNICE_U_SCALE).toBeCloseTo(0.5, 5);
    expect(sample!.uOffset).toBe(sample!.tx);
  });

  it('wears the strip and splits each band so corners chip', () => {
    const data = new Uint8ClampedArray(16 * 8 * 4);
    data.fill(200);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    wearCornicePixels({ width: 16, height: 8, data }, 'slab');
    const luma = data[0] * 0.2126 + data[1] * 0.7152 + data[2] * 0.0722;
    expect(luma).toBeLessThan(180);
    const sample = segs.find((s) => s.face === 'N' && s.family === 'brick');
    expect(sample).toBeTruthy();
    const pieces = cornicePieces(sample!);
    expect(pieces.length).toBeGreaterThan(3);
    expect(pieces.some((p) => p.sy < CORNICE_HEIGHT - 0.01 || Math.min(p.sx, p.sz) < CORNICE_DEPTH - 0.01)).toBe(true);
  });
});
