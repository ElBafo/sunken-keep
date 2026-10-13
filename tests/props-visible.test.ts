import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { floor1 } from '../src/proto3d/floor-data';
import { floor2 } from '../public/levels/floor2';
import { floor3 } from '../public/levels/floor3';
import { floor4 } from '../public/levels/floor4';
import { PropBuilder } from '../src/proto3d/props';
import type { FloorData } from '../src/proto3d/types';

function propTiles(floor: FloorData): Array<{ x: number; y: number; prop: string }> {
  const out: Array<{ x: number; y: number; prop: string }> = [];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const prop = floor.tiles[y][x].prop;
      if (typeof prop === 'string' && prop.length) out.push({ x, y, prop });
    }
  }
  return out;
}

function visibleAt(scene: THREE.Scene, x: number, y: number): boolean {
  let found = false;
  scene.traverse((obj) => {
    if (found) return;
    if (obj.userData.lightX !== x || obj.userData.lightY !== y) return;
    if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.Sprite)) return;
    if (obj.visible) found = true;
  });
  return found;
}

describe('floor 1-4 prop meshes', () => {
  it('restores Pell\'s jar rack and the mirrored guard-hall beam', () => {
    expect(floor1.tiles[10][9].prop).toBe('jar_rack');
    expect(floor1.tiles[3][10].prop).toBe('beams_fallen');
    expect(floor1.tiles[3][10].mirror).toBe(true);
  });

  it('places a visible mesh for every drawn floor 1-4 prop', () => {
    const drawn = new Set(['beams_fallen', 'desk', 'table', 'jar_rack', 'weapon_rack', 'lamp_capped']);
    const floors: Array<{ id: number; data: FloorData }> = [
      { id: 1, data: floor1 },
      { id: 2, data: floor2 as unknown as FloorData },
      { id: 3, data: floor3 as unknown as FloorData },
      { id: 4, data: floor4 as unknown as FloorData }
    ];
    const missing: string[] = [];
    for (const { id, data } of floors) {
      const scene = new THREE.Scene();
      const props = new PropBuilder();
      props.place(scene, data);
      const tiles = propTiles(data);
      if (id === 1) {
        expect(tiles.some((t) => t.prop === 'jar_rack')).toBe(true);
        expect(tiles.some((t) => t.prop === 'beams_fallen')).toBe(true);
        expect(tiles.every((t) => drawn.has(t.prop))).toBe(true);
      }
      for (const tile of tiles) {
        if (!drawn.has(tile.prop)) continue;
        if (!visibleAt(scene, tile.x, tile.y)) {
          missing.push(`floor ${id} (${tile.x},${tile.y}) ${tile.prop}`);
        }
      }
    }
    expect(missing, missing.join('; ')).toEqual([]);
  });
});
