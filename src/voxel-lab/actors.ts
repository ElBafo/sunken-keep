import * as THREE from 'three';
import {
  CHEST_BOTTOM_COLOR,
  CHEST_FRONT_FILE,
  CHEST_SIDE_FILE,
  CHEST_TOP_FILE,
  SLIME_SPRITE_FILE,
  TORCH_COLOR
} from './constants';

/**
 * Mid-room, slightly toward the camera so a west-side key light throws
 * umbras onto the open floor to the right of each actor (not under/behind).
 */
export const CHEST_POS: readonly [number, number, number] = [3.22, 0, 2.08];
export const SLIME_POS: readonly [number, number, number] = [4.16, 0, 2.24];
/** Yaw so front + a sliver of the painted side read from the start view. */
export const CHEST_YAW = 0.46;

/** 10×7×6 voxel box, one cell ≈ 6.2 cm. */
export const CHEST_VOXELS = { w: 10, h: 7, d: 6, size: 0.062 } as const;

export const SLIME_RENDER_ORDER_SOLID = 2;
export const SLIME_RENDER_ORDER_GHOST = 10;
export const SLIME_ALPHA_TEST_SOLID = 0.35;
export const SLIME_ALPHA_TEST_GHOST = 0.12;
export const SLIME_ALPHA_TEST_SHADOW = 0.4;
export const SLIME_GHOST_OPACITY = 0.46;
export const SLIME_THICKNESS = 0.06;
export const SLIME_BOB_AMP = 0.028;
export const SLIME_BOB_HZ = 0.35;

/** Off-screen west of the camera; shines across the actors onto visible floor. */
export const ACTOR_KEY_POS: readonly [number, number, number] = [0.82, 1.58, 3.52];
export const ACTOR_KEY_TARGET: readonly [number, number, number] = [3.7, 0.04, 1.9];
export const ACTOR_KEY_ANGLE = Math.PI / 4.4;
export const ACTOR_KEY_DISTANCE = 8.2;
export const ACTOR_KEY_INTENSITY = 11;

export type ChestFaceMaps = {
  front: THREE.Texture;
  side: THREE.Texture;
  top: THREE.Texture;
};

export type LabActors = {
  group: THREE.Group;
  chest: THREE.Group;
  chestBox: THREE.Mesh;
  slime: THREE.Mesh;
  chestContact: THREE.Mesh;
  slimeContact: THREE.Mesh;
  slimeBaseY: number;
  seeThrough: boolean;
  setSeeThrough: (on: boolean) => void;
};

export function prepChestTexture(tex: THREE.Texture): THREE.Texture {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function makeChestFaceMaterial(
  map: THREE.Texture | null,
  color = 0xffffff
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: map ?? undefined,
    color,
    roughness: map ? 0.7 : 0.92,
    metalness: map ? 0.05 : 0,
    flatShading: false
  });
}

/**
 * BoxGeometry group order: +X, −X, +Y, −Y, +Z, −Z.
 * Front/back share `front`, both sides share `side` — swap maps here.
 */
export function chestFaceMaterialList(maps: ChestFaceMaps): THREE.MeshStandardMaterial[] {
  const front = makeChestFaceMaterial(maps.front);
  const side = makeChestFaceMaterial(maps.side);
  const top = makeChestFaceMaterial(maps.top);
  const bottom = makeChestFaceMaterial(null, CHEST_BOTTOM_COLOR);
  return [side, side, top, bottom, front, front];
}

export function buildTexturedChest(maps: ChestFaceMaps): THREE.Group {
  const { w, h, d, size } = CHEST_VOXELS;
  const geo = new THREE.BoxGeometry(w * size, h * size, d * size);
  const mats = chestFaceMaterialList(maps);
  const mesh = new THREE.Mesh(geo, mats);
  mesh.name = 'lab-chest-box';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.castWhenOn = true;
  mesh.userData.receiveWhenOn = true;
  const group = new THREE.Group();
  group.name = 'lab-chest';
  group.add(mesh);
  group.position.set(CHEST_POS[0], h * size * 0.5 + 0.002, CHEST_POS[2]);
  group.rotation.y = CHEST_YAW;
  return group;
}

export function applySlimeSeeThrough(slime: THREE.Mesh, on: boolean, contact?: THREE.Mesh): void {
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
  if (slime.customDepthMaterial) slime.customDepthMaterial.needsUpdate = true;
  if (slime.customDistanceMaterial) slime.customDistanceMaterial.needsUpdate = true;
  if (contact) {
    const cMat = contact.material as THREE.MeshBasicMaterial;
    cMat.opacity = on ? 0.35 : 1;
  }
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

export function makeContactShadow(opts: {
  name: string;
  width: number;
  depth: number;
  x: number;
  z: number;
  map?: THREE.Texture;
}): THREE.Mesh {
  let map = opts.map;
  if (!map && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(32, 32, 3, 32, 32, 30);
      g.addColorStop(0, 'rgba(0,0,0,0.62)');
      g.addColorStop(0.45, 'rgba(0,0,0,0.28)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      map = new THREE.CanvasTexture(canvas);
      map.needsUpdate = true;
    }
  }
  const mat = new THREE.MeshBasicMaterial({
    map: map ?? undefined,
    color: map ? 0xffffff : 0x000000,
    transparent: true,
    opacity: map ? 1 : 0.35,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(opts.width, opts.depth), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(opts.x, 0.014, opts.z);
  mesh.name = opts.name;
  mesh.userData.noShadow = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  return mesh;
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
  const depthMap = map.clone();
  depthMap.needsUpdate = true;
  const depthMat = new THREE.MeshDepthMaterial({
    map: depthMap,
    alphaTest: SLIME_ALPHA_TEST_SHADOW,
    depthPacking: THREE.RGBADepthPacking
  });
  const distanceMat = new THREE.MeshDistanceMaterial({
    map: depthMap,
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

export function createActorKeyLight(shadowMapSize: number): THREE.SpotLight {
  const spot = new THREE.SpotLight(
    TORCH_COLOR,
    ACTOR_KEY_INTENSITY,
    ACTOR_KEY_DISTANCE,
    ACTOR_KEY_ANGLE,
    0.38,
    1.35
  );
  spot.name = 'actor-key-spot';
  spot.position.set(ACTOR_KEY_POS[0], ACTOR_KEY_POS[1], ACTOR_KEY_POS[2]);
  spot.target.position.set(ACTOR_KEY_TARGET[0], ACTOR_KEY_TARGET[1], ACTOR_KEY_TARGET[2]);
  spot.castShadow = true;
  spot.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  spot.shadow.bias = -0.00018;
  spot.shadow.normalBias = 0.014;
  spot.shadow.radius = 1;
  spot.shadow.intensity = 1;
  spot.shadow.camera.near = 0.35;
  spot.shadow.camera.far = 8;
  spot.shadow.camera.updateProjectionMatrix();
  return spot;
}

export async function buildLabActors(): Promise<LabActors> {
  const [frontPng, sidePng, topPng, slimePng] = await Promise.all([
    loadArtPng(CHEST_FRONT_FILE),
    loadArtPng(CHEST_SIDE_FILE),
    loadArtPng(CHEST_TOP_FILE),
    loadArtPng(SLIME_SPRITE_FILE)
  ]);
  const maps: ChestFaceMaps = {
    front: prepChestTexture(frontPng.texture),
    side: prepChestTexture(sidePng.texture),
    top: prepChestTexture(topPng.texture)
  };
  const group = new THREE.Group();
  group.name = 'lab-actors';
  const chest = buildTexturedChest(maps);
  const chestBox = chest.children[0] as THREE.Mesh;
  const slimeBuilt = buildSlime(slimePng.texture, slimePng.img);
  const { w, d, size } = CHEST_VOXELS;
  const chestContact = makeContactShadow({
    name: 'lab-chest-contact',
    width: w * size * 1.35,
    depth: d * size * 1.45,
    x: CHEST_POS[0],
    z: CHEST_POS[2]
  });
  const slimeContact = makeContactShadow({
    name: 'lab-slime-contact',
    width: 0.82,
    depth: 0.42,
    x: SLIME_POS[0],
    z: SLIME_POS[2]
  });
  group.add(chest, slimeBuilt.mesh, chestContact, slimeContact);

  const actors: LabActors = {
    group,
    chest,
    chestBox,
    slime: slimeBuilt.mesh,
    chestContact,
    slimeContact,
    slimeBaseY: slimeBuilt.baseY,
    seeThrough: false,
    setSeeThrough: (on: boolean) => {
      actors.seeThrough = on;
      applySlimeSeeThrough(actors.slime, on, actors.slimeContact);
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
