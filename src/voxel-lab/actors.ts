import * as THREE from 'three';
import { CHEST_SPRITE_FILE, SLIME_SPRITE_FILE } from './constants';
import { greedyMesh, type MeshArrays } from './mesher';

/** Mid-room, crate-depth — in the starting view without filling the lens. */
export const CHEST_POS: readonly [number, number, number] = [3.42, 0, 1.62];
export const SLIME_POS: readonly [number, number, number] = [4.22, 0, 1.86];
/** Yaw so the lid, bands and lock read as a 3D box. */
export const CHEST_YAW = 0.38;

export const SLIME_RENDER_ORDER_SOLID = 2;
export const SLIME_RENDER_ORDER_GHOST = 10;
export const SLIME_ALPHA_TEST_SOLID = 0.35;
export const SLIME_ALPHA_TEST_GHOST = 0.12;
export const SLIME_ALPHA_TEST_SHADOW = 0.4;
export const SLIME_GHOST_OPACITY = 0.46;
export const SLIME_THICKNESS = 0.06;
export const SLIME_BOB_AMP = 0.028;
export const SLIME_BOB_HZ = 0.35;

export const FALLBACK_CHEST_PALETTE: ChestPalette = {
  wood: 0x6b3d1f,
  woodDark: 0x3a2414,
  woodLight: 0x8a5a32,
  iron: 0x2c2418,
  lock: 0xc4a056
};

export type ChestPalette = {
  wood: number;
  woodDark: number;
  woodLight: number;
  iron: number;
  lock: number;
};

export type PixelSource = {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
};

export type LabActors = {
  group: THREE.Group;
  chest: THREE.Group;
  slime: THREE.Mesh;
  slimeBaseY: number;
  seeThrough: boolean;
  setSeeThrough: (on: boolean) => void;
};

function packRgb(r: number, g: number, b: number): number {
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function meanRgb(pixels: Array<[number, number, number]>): [number, number, number] {
  if (pixels.length === 0) return [0, 0, 0];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of pixels) {
    r += p[0];
    g += p[1];
    b += p[2];
  }
  const n = pixels.length;
  return [r / n, g / n, b / n];
}

function percentileLuma(pixels: Array<[number, number, number]>, t: number): [number, number, number] {
  if (pixels.length === 0) return [0, 0, 0];
  const sorted = pixels.slice().sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(t * (sorted.length - 1))));
  return sorted[i];
}

/**
 * Pull wood / iron / lock colours from the game chest sprite.
 * Empty or fully transparent sources fall back to the painted palette.
 */
export function sampleChestPalette(src: PixelSource): ChestPalette {
  const { width, height, data } = src;
  const wood: Array<[number, number, number]> = [];
  const iron: Array<[number, number, number]> = [];
  const lock: Array<[number, number, number]> = [];
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];
    if (a < 24) continue;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max - min;
    const warm = r - b;
    if (luma > 130 && r > 140 && g > 90 && warm > 25) {
      lock.push([r, g, b]);
    } else if (sat < 42 && luma < 95) {
      iron.push([r, g, b]);
    } else if (warm > 8) {
      wood.push([r, g, b]);
    } else {
      iron.push([r, g, b]);
    }
  }
  if (wood.length === 0) return { ...FALLBACK_CHEST_PALETTE };
  const woodMean = meanRgb(wood);
  const woodDark = percentileLuma(wood, 0.18);
  const woodLight = percentileLuma(wood, 0.82);
  let ironMean = iron.length ? meanRgb(iron) : [woodDark[0] * 0.55, woodDark[1] * 0.55, woodDark[2] * 0.5];
  let lockMean = lock.length ? meanRgb(lock) : [
    Math.min(255, woodLight[0] * 1.45),
    Math.min(255, woodLight[1] * 1.15),
    woodLight[2] * 0.55
  ];
  const woodL = 0.2126 * woodDark[0] + 0.7152 * woodDark[1] + 0.0722 * woodDark[2];
  const ironL = 0.2126 * ironMean[0] + 0.7152 * ironMean[1] + 0.0722 * ironMean[2];
  const lockL = 0.2126 * lockMean[0] + 0.7152 * lockMean[1] + 0.0722 * lockMean[2];
  if (Math.abs(woodL - ironL) < 18) {
    ironMean = [
      ((FALLBACK_CHEST_PALETTE.iron >> 16) & 255),
      ((FALLBACK_CHEST_PALETTE.iron >> 8) & 255),
      FALLBACK_CHEST_PALETTE.iron & 255
    ];
  }
  if (lockL < woodL + 40) {
    lockMean = [
      ((FALLBACK_CHEST_PALETTE.lock >> 16) & 255),
      ((FALLBACK_CHEST_PALETTE.lock >> 8) & 255),
      FALLBACK_CHEST_PALETTE.lock & 255
    ];
  }
  return {
    wood: packRgb(woodMean[0], woodMean[1], woodMean[2]),
    woodDark: packRgb(woodDark[0], woodDark[1], woodDark[2]),
    woodLight: packRgb(woodLight[0], woodLight[1], woodLight[2]),
    iron: packRgb(ironMean[0], ironMean[1], ironMean[2]),
    lock: packRgb(lockMean[0], lockMean[1], lockMean[2])
  };
}

function geometryFrom(mesh: MeshArrays): THREE.BufferGeometry | null {
  if (mesh.indices.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs, 2));
  g.setIndex(mesh.indices);
  g.computeBoundingSphere();
  return g;
}

function shadowMesh(geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.castWhenOn = true;
  mesh.userData.receiveWhenOn = true;
  return mesh;
}

/** ~80-voxel chest: body, lid, two iron bands, lock. One greedy mesh per colour. */
export function buildVoxelChest(palette: ChestPalette): THREE.Group {
  const W = 10;
  const H = 7;
  const D = 6;
  const S = 0.062;
  const n = W * H * D;
  const body = new Uint8Array(n);
  const lid = new Uint8Array(n);
  const iron = new Uint8Array(n);
  const lock = new Uint8Array(n);
  const at = (x: number, y: number, z: number) => x + y * W + z * W * H;

  for (let z = 0; z < D; z++) {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < W; x++) body[at(x, y, z)] = 1;
    }
    for (let y = 4; y < H; y++) {
      for (let x = 0; x < W; x++) lid[at(x, y, z)] = 1;
    }
  }
  for (const bx of [1, 8]) {
    for (let z = 0; z < D; z++) {
      for (let y = 0; y < 5; y++) {
        iron[at(bx, y, z)] = 1;
        body[at(bx, y, z)] = 0;
        lid[at(bx, y, z)] = 0;
      }
    }
  }
  for (let x = 4; x <= 5; x++) {
    for (let y = 1; y <= 2; y++) {
      lock[at(x, y, D - 1)] = 1;
      body[at(x, y, D - 1)] = 0;
      iron[at(x, y, D - 1)] = 0;
    }
  }

  const toWorld = (x: number, y: number, z: number): [number, number, number] => [
    (x - W / 2) * S,
    y * S,
    (z - D / 2) * S
  ];
  const dims: [number, number, number] = [W, H, D];
  const allFaces = { cullNeg: [false, false, false] as [boolean, boolean, boolean] };

  const group = new THREE.Group();
  group.name = 'lab-chest';
  group.position.set(CHEST_POS[0], CHEST_POS[1], CHEST_POS[2]);
  group.rotation.y = CHEST_YAW;

  const parts: Array<[Uint8Array, number, number, number, string]> = [
    [body, palette.woodDark, 0.78, 0.04, 'lab-chest-body'],
    [lid, palette.woodLight, 0.7, 0.04, 'lab-chest-lid'],
    [iron, palette.iron, 0.46, 0.32, 'lab-chest-iron'],
    [lock, palette.lock, 0.4, 0.5, 'lab-chest-lock']
  ];
  for (const [vol, color, roughness, metalness, name] of parts) {
    const meshed = greedyMesh(vol, dims, toWorld, allFaces);
    const geo = geometryFrom(meshed.mesh);
    if (!geo) continue;
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      flatShading: true
    });
    group.add(shadowMesh(geo, mat, name));
  }
  return group;
}

export function applySlimeSeeThrough(slime: THREE.Mesh, on: boolean): void {
  const mat = slime.material as THREE.MeshPhysicalMaterial;
  const order = on ? SLIME_RENDER_ORDER_GHOST : SLIME_RENDER_ORDER_SOLID;
  slime.renderOrder = order;
  slime.userData.castWhenOn = !on;
  slime.userData.receiveWhenOn = true;
  slime.traverse((obj) => {
    obj.renderOrder = order;
  });
  mat.transparent = true;
  mat.alphaTest = on ? SLIME_ALPHA_TEST_GHOST : SLIME_ALPHA_TEST_SOLID;
  mat.opacity = on ? SLIME_GHOST_OPACITY : 1;
  mat.depthWrite = !on;
  mat.roughness = on ? 0.14 : 0.58;
  mat.metalness = on ? 0.12 : 0;
  mat.clearcoat = on ? 0.92 : 0.06;
  mat.clearcoatRoughness = on ? 0.08 : 0.45;
  mat.needsUpdate = true;
}

function artUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

async function loadArtPng(file: string): Promise<{ img: HTMLImageElement; data: ImageData; texture: THREE.Texture }> {
  const img = new Image();
  img.decoding = 'async';
  img.src = artUrl(file);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const texture = new THREE.Texture(img);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { img, data, texture };
}

function buildSlime(map: THREE.Texture, img: HTMLImageElement): { mesh: THREE.Mesh; baseY: number } {
  const h = 0.7;
  const aspect = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
  const w = h * aspect;
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshPhysicalMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    alphaTest: SLIME_ALPHA_TEST_SOLID,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    roughness: 0.58,
    metalness: 0,
    clearcoat: 0.06,
    clearcoatRoughness: 0.45,
    envMapIntensity: 0,
    side: THREE.DoubleSide
  });
  const depthMat = new THREE.MeshDepthMaterial({
    map,
    alphaTest: SLIME_ALPHA_TEST_SHADOW,
    depthPacking: THREE.RGBADepthPacking
  });
  const distanceMat = new THREE.MeshDistanceMaterial({
    map,
    alphaTest: SLIME_ALPHA_TEST_SHADOW
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'lab-slime';
  mesh.customDepthMaterial = depthMat;
  mesh.customDistanceMaterial = distanceMat;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.castWhenOn = true;
  mesh.userData.receiveWhenOn = true;
  mesh.renderOrder = SLIME_RENDER_ORDER_SOLID;
  const baseY = h * 0.5;
  mesh.position.set(SLIME_POS[0], baseY, SLIME_POS[2]);
  // Tiny extra card so the sprite has a hint of thickness without a green box.
  const back = new THREE.Mesh(geo, mat);
  back.name = 'lab-slime-card';
  back.position.z = -SLIME_THICKNESS;
  back.castShadow = false;
  back.receiveShadow = false;
  back.userData.noShadow = true;
  back.renderOrder = SLIME_RENDER_ORDER_SOLID;
  mesh.add(back);
  return { mesh, baseY };
}

export async function buildLabActors(): Promise<LabActors> {
  const [chestPng, slimePng] = await Promise.all([
    loadArtPng(CHEST_SPRITE_FILE),
    loadArtPng(SLIME_SPRITE_FILE)
  ]);
  const palette = sampleChestPalette(chestPng.data);
  const group = new THREE.Group();
  group.name = 'lab-actors';
  const chest = buildVoxelChest(palette);
  const slimeBuilt = buildSlime(slimePng.texture, slimePng.img);
  group.add(chest, slimeBuilt.mesh);

  const actors: LabActors = {
    group,
    chest,
    slime: slimeBuilt.mesh,
    slimeBaseY: slimeBuilt.baseY,
    seeThrough: false,
    setSeeThrough: (on: boolean) => {
      actors.seeThrough = on;
      applySlimeSeeThrough(actors.slime, on);
    }
  };
  return actors;
}

export function faceSlimeToCamera(slime: THREE.Object3D, camera: THREE.Object3D): void {
  const dx = camera.position.x - slime.position.x;
  const dz = camera.position.z - slime.position.z;
  slime.rotation.y = Math.atan2(dx, dz);
}

export function bobSlime(slime: THREE.Mesh, baseY: number, nowMs: number, enabled: boolean): void {
  if (!enabled) {
    slime.position.y = baseY;
    return;
  }
  slime.position.y = baseY + Math.sin(nowMs * 0.001 * Math.PI * 2 * SLIME_BOB_HZ) * SLIME_BOB_AMP;
}
