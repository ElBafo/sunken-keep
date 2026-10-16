import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applySlimeSeeThrough,
  bobSlime,
  buildVoxelChest,
  FALLBACK_CHEST_PALETTE,
  sampleChestPalette,
  SLIME_ALPHA_TEST_GHOST,
  SLIME_ALPHA_TEST_SHADOW,
  SLIME_ALPHA_TEST_SOLID,
  SLIME_GHOST_OPACITY,
  SLIME_RENDER_ORDER_GHOST
} from '../src/voxel-lab/actors';
import { CHEST_SPRITE_FILE, SLIME_SPRITE_FILE } from '../src/voxel-lab/constants';

function paint(data: Uint8ClampedArray, i: number, r: number, g: number, b: number, a = 255): void {
  const o = i * 4;
  data[o] = r;
  data[o + 1] = g;
  data[o + 2] = b;
  data[o + 3] = a;
}

describe('voxel-lab chest palette', () => {
  it('falls back when the sprite is empty', () => {
    const data = new Uint8ClampedArray(16);
    expect(sampleChestPalette({ width: 2, height: 2, data })).toEqual(FALLBACK_CHEST_PALETTE);
  });

  it('samples wood, dark iron and a gold lock from opaque pixels', () => {
    const w = 4;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) paint(data, i, 110, 62, 28);
    paint(data, 0, 40, 36, 32);
    paint(data, 1, 38, 34, 30);
    paint(data, 2, 210, 170, 70);
    paint(data, 3, 200, 160, 64);
    const pal = sampleChestPalette({ width: w, height: h, data });
    const woodR = (pal.wood >> 16) & 255;
    const woodB = pal.wood & 255;
    const ironLuma =
      0.2126 * ((pal.iron >> 16) & 255) + 0.7152 * ((pal.iron >> 8) & 255) + 0.0722 * (pal.iron & 255);
    const lockLuma =
      0.2126 * ((pal.lock >> 16) & 255) + 0.7152 * ((pal.lock >> 8) & 255) + 0.0722 * (pal.lock & 255);
    expect(woodR).toBeGreaterThan(woodB);
    expect(ironLuma).toBeLessThan(90);
    expect(lockLuma).toBeGreaterThan(120);
  });
});

describe('voxel chest mesh', () => {
  it('is a low-poly caster/receiver named lab-chest', () => {
    const chest = buildVoxelChest(FALLBACK_CHEST_PALETTE);
    expect(chest.name).toBe('lab-chest');
    let meshes = 0;
    let tris = 0;
    chest.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes += 1;
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
      expect(mesh.userData.castWhenOn).toBe(true);
      expect(mesh.userData.receiveWhenOn).toBe(true);
      const geo = mesh.geometry as THREE.BufferGeometry;
      tris += (geo.index?.count ?? 0) / 3;
    });
    expect(meshes).toBeGreaterThanOrEqual(3);
    expect(meshes).toBeLessThanOrEqual(6);
    expect(tris).toBeGreaterThan(12);
    expect(tris).toBeLessThan(180);
  });
});

describe('see-through slime material', () => {
  function makeSlime(): THREE.Mesh {
    const mat = new THREE.MeshPhysicalMaterial({
      transparent: true,
      alphaTest: SLIME_ALPHA_TEST_SOLID,
      opacity: 1,
      depthWrite: true
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.06), mat);
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      alphaTest: SLIME_ALPHA_TEST_SHADOW,
      depthPacking: THREE.RGBADepthPacking
    });
    mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial({
      alphaTest: SLIME_ALPHA_TEST_SHADOW
    });
    mesh.userData.castWhenOn = true;
    return mesh;
  }

  it('uses a cutout customDepthMaterial and drops depth-write when see-through', () => {
    const slime = makeSlime();
    const depth = slime.customDepthMaterial as THREE.MeshDepthMaterial;
    expect(depth.alphaTest).toBe(SLIME_ALPHA_TEST_SHADOW);
    expect(depth.depthPacking).toBe(THREE.RGBADepthPacking);

    applySlimeSeeThrough(slime, true);
    const mat = slime.material as THREE.MeshPhysicalMaterial;
    expect(mat.depthWrite).toBe(false);
    expect(mat.opacity).toBe(SLIME_GHOST_OPACITY);
    expect(mat.clearcoat).toBeGreaterThan(0.5);
    expect(mat.roughness).toBeLessThan(0.25);
    expect(slime.userData.castWhenOn).toBe(false);
    expect(slime.renderOrder).toBe(SLIME_RENDER_ORDER_GHOST);
    expect(slime.renderOrder).toBeGreaterThan(0);

    applySlimeSeeThrough(slime, false);
    expect(mat.depthWrite).toBe(true);
    expect(mat.opacity).toBe(1);
    expect(slime.userData.castWhenOn).toBe(true);
    expect(mat.alphaTest).toBe(SLIME_ALPHA_TEST_SOLID);
  });

  it('bobs only when enabled, and stays at base Y otherwise', () => {
    const slime = makeSlime();
    slime.position.y = 0.4;
    bobSlime(slime, 0.4, 800, false);
    expect(slime.position.y).toBe(0.4);
    bobSlime(slime, 0.4, 800, true);
    expect(slime.position.y).not.toBe(0.4);
    expect(Math.abs(slime.position.y - 0.4)).toBeLessThan(0.05);
  });
});

describe('lab actors stay on the voxel-lab page', () => {
  const root = resolve(__dirname, '..');
  const html = readFileSync(resolve(root, 'voxel-lab.html'), 'utf8');
  const actors = readFileSync(resolve(root, 'src/voxel-lab/actors.ts'), 'utf8');
  const main = readFileSync(resolve(root, 'src/voxel-lab/main.ts'), 'utf8');
  const room = readFileSync(resolve(root, 'src/voxel-lab/room.ts'), 'utf8');
  const look = readFileSync(resolve(root, 'src/voxel-lab/look.ts'), 'utf8');

  it('reuses the game chest and slime sprites by URL, without importing proto3d', () => {
    expect(existsSync(resolve(root, 'public', CHEST_SPRITE_FILE))).toBe(true);
    expect(existsSync(resolve(root, 'public', SLIME_SPRITE_FILE))).toBe(true);
    expect(actors).toContain('CHEST_SPRITE_FILE');
    expect(actors).toContain('SLIME_SPRITE_FILE');
    expect(actors).toContain('customDepthMaterial');
    expect(actors).toContain('alphaTest: SLIME_ALPHA_TEST_SHADOW');
    expect(actors).not.toContain('src/proto3d');
    expect(actors).not.toContain("from '../proto3d");
    expect(main).not.toContain('src/proto3d');
    expect(main).not.toContain("from '../proto3d");
  });

  it('adds a See-through slime toggle without renaming the existing ones', () => {
    expect(html).toContain('id="btn-see-through"');
    expect(html).toContain('See-through slime');
    expect(html).toContain('>Shadows on</button>');
    expect(html).toContain('>Lantern on</button>');
    expect(html).toContain('>Voxels</button>');
    expect(html).toContain('>Match game</button>');
    expect(html).toContain('Light warmth');
  });

  it('does not restyle the room crate, pillar, or look stack', () => {
    expect(room).toContain("const crate = makeOccluder('lab-crate', floorTex, 0.7, 0.55, 0.7, 2.55, 0.275, 1.35)");
    expect(room).toContain("const pillar = makeOccluder('lab-pillar', wallTex, 0.4, 1.85, 0.4, 4.95, 0.925, 1.55)");
    expect(look).toContain('export const GAME_TORCH_RGB: Rgb = [1.0, 0.86, 0.58]');
    expect(look).toContain('export const GAME_LANTERN_RGB: Rgb = [0.92, 0.82, 0.64]');
  });
});
