import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applySlimeSeeThrough,
  bobSlime,
  buildTexturedChest,
  CHEST_POS,
  CHEST_VOXELS,
  chestFaceMaterialList,
  SLIME_HEIGHT,
  SLIME_POS,
  makeContactShadow,
  prepChestTexture,
  prepShadowPatchTexture,
  SLIME_ALPHA_TEST_SHADOW,
  SLIME_ALPHA_TEST_SOLID,
  SLIME_GHOST_OPACITY,
  SLIME_RENDER_ORDER_GHOST,
  type ChestFaceMaps
} from '../src/voxel-lab/actors';
import {
  CELL,
  CHEST_BOTTOM_COLOR,
  CHEST_FRONT_FILE,
  CHEST_SIDE_FILE,
  CHEST_TOP_FILE,
  CONTACT_Y,
  SHADOW_PATCH_FILE,
  SLIME_SPRITE_FILE
} from '../src/voxel-lab/constants';

function fakeMap(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([120, 70, 30, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

function maps(): ChestFaceMaps {
  return { front: fakeMap(), side: fakeMap(), top: fakeMap() };
}

describe('textured chest box', () => {
  it('is one 10×7×6 caster/receiver with separate front/side/top maps', () => {
    const face = maps();
    const chest = buildTexturedChest(face);
    expect(chest.name).toBe('lab-chest');
    const boxes: THREE.Mesh[] = [];
    chest.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) boxes.push(mesh);
    });
    expect(boxes).toHaveLength(1);
    const box = boxes[0];
    expect(box.name).toBe('lab-chest-box');
    expect(box.castShadow).toBe(true);
    expect(box.receiveShadow).toBe(true);
    expect(box.userData.castWhenOn).toBe(true);
    const mats = box.material as THREE.MeshStandardMaterial[];
    expect(mats).toHaveLength(6);
    // +X/−X side, +Y top, −Y bottom, +Z/−Z front
    expect(mats[0].map).toBe(face.side);
    expect(mats[1].map).toBe(face.side);
    expect(mats[2].map).toBe(face.top);
    expect(mats[3].map).toBeNull();
    expect(mats[3].color.getHex()).toBe(CHEST_BOTTOM_COLOR);
    expect(mats[4].map).toBe(face.front);
    expect(mats[5].map).toBe(face.front);
    const param = box.geometry.parameters as { width: number; height: number; depth: number };
    expect(param.width).toBeCloseTo(CHEST_VOXELS.w * CHEST_VOXELS.size, 5);
    expect(param.height).toBeCloseTo(CHEST_VOXELS.h * CHEST_VOXELS.size, 5);
    expect(param.depth).toBeCloseTo(CHEST_VOXELS.d * CHEST_VOXELS.size, 5);
  });

  it('prepChestTexture is nearest, unmipped, sRGB — easy to swap face files', () => {
    const tex = fakeMap();
    prepChestTexture(tex);
    expect(tex.magFilter).toBe(THREE.NearestFilter);
    expect(tex.minFilter).toBe(THREE.NearestFilter);
    expect(tex.generateMipmaps).toBe(false);
    expect(tex.colorSpace).toBe(THREE.SRGBColorSpace);
    const list = chestFaceMaterialList(maps());
    expect(list[4].map).not.toBe(list[0].map);
    expect(list[2].map).not.toBe(list[4].map);
  });

  it('plants the painted shadow patch above the floor, LinearFilter, painted alpha', () => {
    const map = fakeMap();
    const blob = makeContactShadow({
      name: 'lab-chest-contact',
      width: 0.8,
      depth: 0.4,
      x: 3,
      z: 2,
      map
    });
    const mat = blob.material as THREE.MeshBasicMaterial;
    expect(blob.name).toBe('lab-chest-contact');
    expect(blob.userData.noShadow).toBe(true);
    expect(blob.castShadow).toBe(false);
    expect(blob.receiveShadow).toBe(false);
    expect(blob.position.y).toBe(CONTACT_Y);
    expect(blob.position.y).toBeGreaterThan(0.03);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.opacity).toBe(1);
    expect(map.magFilter).toBe(THREE.LinearFilter);
    expect(map.minFilter).toBe(THREE.LinearFilter);
    expect(map.generateMipmaps).toBe(false);
  });

  it('prepShadowPatchTexture is linear, not nearest', () => {
    const tex = fakeMap();
    prepShadowPatchTexture(tex);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
    expect(tex.minFilter).toBe(THREE.LinearFilter);
  });
});

describe('start-pose placement', () => {
  const camX = 1.5 * CELL;
  const camZ = 1.5 * CELL;

  it('puts slime ~1 cell ahead, off to one side, at game height, with a gap to the chest', () => {
    const slimeDist = Math.hypot(SLIME_POS[0] - camX, SLIME_POS[2] - camZ);
    const chestDist = Math.hypot(CHEST_POS[0] - camX, CHEST_POS[2] - camZ);
    const gap = Math.hypot(SLIME_POS[0] - CHEST_POS[0], SLIME_POS[2] - CHEST_POS[2]);
    const chestHalf = (CHEST_VOXELS.w * CHEST_VOXELS.size) / 2;
    const slimeHalf = (SLIME_HEIGHT * (56 / 39)) / 2;
    expect(SLIME_HEIGHT).toBeCloseTo(0.78, 5);
    expect(slimeDist).toBeGreaterThan(2.1);
    expect(chestDist).toBeGreaterThan(2.1);
    expect(SLIME_POS[2]).toBeLessThan(1.7);
    expect(CHEST_POS[2]).toBeLessThan(1.7);
    expect(Math.abs(SLIME_POS[0] - camX)).toBeGreaterThan(0.35);
    expect(gap).toBeGreaterThan(chestHalf + slimeHalf + 0.12);
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
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.9), mat);
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
    const depthVersion = depth.version;

    applySlimeSeeThrough(slime, true);
    const mat = slime.material as THREE.MeshPhysicalMaterial;
    expect(mat.depthWrite).toBe(false);
    expect(mat.opacity).toBe(SLIME_GHOST_OPACITY);
    expect(mat.clearcoat).toBeGreaterThan(0.5);
    expect(slime.userData.castWhenOn).toBe(false);
    expect(slime.renderOrder).toBe(SLIME_RENDER_ORDER_GHOST);
    expect(depth.version).toBeGreaterThan(depthVersion);

    applySlimeSeeThrough(slime, false);
    expect(mat.depthWrite).toBe(true);
    expect(mat.opacity).toBe(1);
    expect(slime.userData.castWhenOn).toBe(true);
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

  it('loads lab chest faces and the game slime sprite by URL, without importing proto3d', () => {
    expect(existsSync(resolve(root, 'public', CHEST_FRONT_FILE))).toBe(true);
    expect(existsSync(resolve(root, 'public', CHEST_SIDE_FILE))).toBe(true);
    expect(existsSync(resolve(root, 'public', CHEST_TOP_FILE))).toBe(true);
    expect(existsSync(resolve(root, 'public', SLIME_SPRITE_FILE))).toBe(true);
    expect(existsSync(resolve(root, 'public', SHADOW_PATCH_FILE))).toBe(true);
    expect(actors).toContain('CHEST_FRONT_FILE');
    expect(actors).toContain('CHEST_SIDE_FILE');
    expect(actors).toContain('CHEST_TOP_FILE');
    expect(actors).toContain('SHADOW_PATCH_FILE');
    expect(actors).not.toContain('createRadialGradient');
    expect(actors).toContain('customDepthMaterial');
    expect(actors).not.toContain('src/proto3d');
    expect(main).not.toContain("from '../proto3d");
  });

  it('primes shadow shaders on first load so WebKit is not solid black', () => {
    expect(main).toContain('recompileShadowShaders');
    expect(main).toMatch(/renderFrame\(\);\s*recompileShadowShaders\(\[scene\]\);/);
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
