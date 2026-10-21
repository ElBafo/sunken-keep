import * as THREE from 'three';
import { CUTOUT_ALPHA_TEST } from './constants';

type Pixels = { width: number; height: number; data: ArrayLike<number> };

/** Darken rubble so it stays below the wall albedo even under a torch. */
export const RUBBLE_TINT = new THREE.Color(0.66, 0.66, 0.66);

export function isPaintedShellFile(file: string): boolean {
  return file.startsWith('floor_') || file.startsWith('ceiling');
}

export function isRubbleCeilingFile(file: string): boolean {
  return file.startsWith('ceiling_rubble_');
}

export function isPlankCeilingFile(file: string): boolean {
  return file.startsWith('ceiling_planks_');
}

export function isWoodCeilingFile(file: string): boolean {
  return isPlankCeilingFile(file) || file.startsWith('ceiling_cracked');
}

/** Grain bump on wood — kept tiny so torch light does not streak like varnish. */
export const WOOD_NORMAL_SCALE = 0.05;

/**
 * Same MeshPhysical lighting contract as the stone walls (ior, fog, no
 * emissive / env / IBL). Spec stays 0 so wood is matte; MeshBasic was
 * skipping lights and staying visible in unlit halls.
 */
export function dungeonWoodMaterial(
  map: THREE.Texture,
  opts?: {
    normal?: THREE.Texture;
    color?: THREE.ColorRepresentation;
    alphaTest?: number;
    name?: string;
  }
): THREE.MeshPhysicalMaterial {
  enableWoodSampling(map);
  const mat = new THREE.MeshPhysicalMaterial({
    map,
    normalMap: opts?.normal,
    normalScale: opts?.normal
      ? new THREE.Vector2(WOOD_NORMAL_SCALE, WOOD_NORMAL_SCALE)
      : new THREE.Vector2(0, 0),
    color: opts?.color ?? 0xffffff,
    roughness: 1,
    metalness: 0,
    ior: 1.45,
    clearcoat: 0,
    clearcoatRoughness: 1,
    sheen: 0,
    specularIntensity: 0,
    envMapIntensity: 0,
    fog: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
    alphaTest: opts?.alphaTest ?? 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  if (opts?.name) mat.name = opts.name;
  return mat;
}

/** Painted 256 tiles: crisp texels up close, nearest mips in the distance. */
export function enablePaintedSampling(tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
}

/**
 * Wood maps match the wall path: sRGB, nearest, no mips.
 * Box-filtered mips turn 1-texel near-black gaps grey at distance.
 */
export function enableWoodSampling(tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
}

/** Repeat so UV scale > 1 does not clamp-smear at cell edges. */
export function enableRubbleRepeat(tex: THREE.Texture): void {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
}

function lumaAt(image: Pixels, x: number, y: number): number {
  const u = Math.min(image.width - 1, Math.max(0, x));
  const v = Math.min(image.height - 1, Math.max(0, y));
  const i = (v * image.width + u) * 4;
  return (0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2]) / 255;
}

/** Very small albedo-derived bump so joints read without voxel steps. */
export function normalFromAlbedo(image: Pixels, strength = 0.55): THREE.DataTexture {
  const W = image.width;
  const H = image.height;
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = lumaAt(image, x + 1, y) - lumaAt(image, x - 1, y);
      const dy = lumaAt(image, x, y + 1) - lumaAt(image, x, y - 1);
      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * W + x) * 4;
      rgba[i] = Math.round((nx * 0.5 + 0.5) * 255);
      rgba[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      rgba[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      rgba[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(rgba, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

export function paintedShellMaterial(
  map: THREE.Texture,
  normal: THREE.Texture | undefined,
  file: string
): THREE.MeshPhysicalMaterial {
  const water = file === 'floor_water.png';
  const cutout = file.startsWith('ceiling_cracked');
  const rubble = isRubbleCeilingFile(file);
  const wood = isWoodCeilingFile(file);
  if (wood || rubble) enableWoodSampling(map);
  else enablePaintedSampling(map);
  if (rubble) {
    enableRubbleRepeat(map);
    if (normal) enableRubbleRepeat(normal);
  }
  if (wood) {
    return dungeonWoodMaterial(map, {
      normal,
      alphaTest: cutout ? CUTOUT_ALPHA_TEST : 0
    });
  }
  const mat = new THREE.MeshPhysicalMaterial({
    map,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.14, 0.14),
    roughness: water ? 0.62 : 0.92,
    metalness: 0,
    ior: 1.45,
    clearcoat: water ? 0.12 : 0,
    clearcoatRoughness: water ? 0.45 : 1,
    envMapIntensity: 0,
    fog: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
    alphaTest: 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  if (rubble) {
    mat.sheen = 0;
    mat.clearcoat = 0;
    mat.envMapIntensity = 0;
    // Default dielectric spec (F0 ~0.04) adds a lantern floor on the flat
    // ceiling and lifts (17,15,13) gaps to mid-grey. Walls keep true-black
    // mortar because those texels are 0. This is a construction uniform.
    mat.specularIntensity = 0;
    mat.color.copy(RUBBLE_TINT);
  }
  return mat;
}
