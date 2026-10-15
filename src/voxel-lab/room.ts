import * as THREE from 'three';
import { volumeFromImageData } from './classify';
import {
  CELL,
  CEILING_FILES,
  FLOOR_FILES,
  LAMP_FILE,
  LAYER_SIZE,
  MAT_MOSS,
  MAT_WET,
  ROOM_TILES,
  SCONCE_FILE,
  WALL_FILES
} from './constants';
import { FaceId, flatPlanePose, makeToWorld } from './faces';
import { greedyMesh, mergeMeshes, MeshArrays } from './mesher';

export interface RoomStats {
  voxels: number;
  triangles: number;
  quads: number;
  tiles: number;
}

export interface BuiltRoom {
  voxelGroup: THREE.Group;
  flatGroup: THREE.Group;
  propsGroup: THREE.Group;
  lampMesh: THREE.Mesh;
  lampTargets: THREE.Object3D[];
  torchFlames: THREE.Sprite[];
  stats: RoomStats;
}

interface PngPixels {
  img: HTMLImageElement;
  data: ImageData;
  texture: THREE.Texture;
}

function texUrl(file: string): string {
  const base = import.meta.env.BASE_URL;
  if (file.startsWith('../')) {
    return `${base}proto3d/${file.slice(3)}`;
  }
  return `${base}proto3d/tex3d/${file}`;
}

async function loadPng(file: string): Promise<PngPixels> {
  const url = texUrl(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
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

function hashPick<T>(list: readonly T[], x: number, z: number, salt: number): T {
  let h = Math.imul(x + salt, 374761393) + Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return list[(h >>> 0) % list.length];
}

function materialFor(kind: number): THREE.MeshStandardMaterial {
  const roughness = kind === MAT_MOSS ? 0.96 : kind === MAT_WET ? 0.16 : 0.7;
  return new THREE.MeshStandardMaterial({
    roughness,
    metalness: 0,
    vertexColors: true,
    flatShading: true,
    envMapIntensity: 0
  });
}

function geometryFrom(mesh: MeshArrays): THREE.BufferGeometry | null {
  if (mesh.indices.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(mesh.colors, 3));
  g.setIndex(mesh.indices);
  g.computeBoundingSphere();
  return g;
}

type TileJob = { face: FaceId; tx: number; tz: number; file: string };

function tileJobs(): TileJob[] {
  const jobs: TileJob[] = [];
  for (let i = 0; i < ROOM_TILES; i++) {
    jobs.push({ face: 'N', tx: i, tz: 0, file: hashPick(WALL_FILES, i, 0, 1) });
    jobs.push({ face: 'S', tx: i, tz: ROOM_TILES - 1, file: hashPick(WALL_FILES, i, 2, 2) });
    jobs.push({ face: 'W', tx: 0, tz: i, file: hashPick(WALL_FILES, 0, i, 3) });
    jobs.push({ face: 'E', tx: ROOM_TILES - 1, tz: i, file: hashPick(WALL_FILES, 2, i, 4) });
  }
  for (let z = 0; z < ROOM_TILES; z++) {
    for (let x = 0; x < ROOM_TILES; x++) {
      jobs.push({ face: 'floor', tx: x, tz: z, file: hashPick(FLOOR_FILES, x, z, 5) });
      jobs.push({ face: 'ceiling', tx: x, tz: z, file: hashPick(CEILING_FILES, x, z, 6) });
    }
  }
  return jobs;
}

function spriteMat(map: THREE.Texture, additive = false): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.15,
    depthTest: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
}

export async function buildRoom(): Promise<BuiltRoom> {
  const jobs = tileJobs();
  const needed = [...new Set(jobs.map((j) => j.file))];
  needed.push(SCONCE_FILE, LAMP_FILE);
  const pngs = new Map<string, PngPixels>();
  await Promise.all(
    needed.map(async (file) => {
      pngs.set(file, await loadPng(file));
    })
  );

  const perMat: MeshArrays[][] = [[], [], []];
  let voxels = 0;
  let quads = 0;
  let triangles = 0;

  const voxelGroup = new THREE.Group();
  voxelGroup.name = 'voxels';
  const flatGroup = new THREE.Group();
  flatGroup.name = 'flat';

  const planeGeo = new THREE.PlaneGeometry(CELL, CELL);

  for (const job of jobs) {
    const png = pngs.get(job.file);
    if (!png) continue;
    const vol = volumeFromImageData(png.data);
    voxels += vol.voxelCount;
    const toWorld = makeToWorld(job.face, job.tx, job.tz, vol.dims, LAYER_SIZE);
    const meshed = greedyMesh(vol.volume, vol.dims, toWorld);
    quads += meshed.quads;
    triangles += meshed.triangles;
    perMat[0].push(meshed.groups[0]);
    perMat[1].push(meshed.groups[1]);
    perMat[2].push(meshed.groups[2]);

    const pose = flatPlanePose(job.face, job.tx, job.tz);
    const mat = new THREE.MeshStandardMaterial({
      map: png.texture,
      roughness: 0.7,
      metalness: 0,
      flatShading: true
    });
    const mesh = new THREE.Mesh(planeGeo, mat);
    mesh.position.set(pose.x, pose.y, pose.z);
    mesh.rotation.set(pose.rotX, pose.rotY, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    flatGroup.add(mesh);
  }

  for (let i = 0; i < 3; i++) {
    const merged = mergeMeshes(perMat[i]);
    const geo = geometryFrom(merged);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, materialFor(i));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    voxelGroup.add(mesh);
  }

  const propsGroup = new THREE.Group();
  const sconce = pngs.get(SCONCE_FILE)!;
  const lampPng = pngs.get(LAMP_FILE)!;

  const torchFlames: THREE.Sprite[] = [];
  const placeSconce = (x: number, y: number, z: number, rotY: number, inward: [number, number, number]) => {
    const h = 0.95;
    const w = h * (sconce.img.naturalWidth / sconce.img.naturalHeight);
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshStandardMaterial({
      map: sconce.texture,
      transparent: true,
      alphaTest: 0.2,
      roughness: 0.55,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    propsGroup.add(mesh);

    const flame = new THREE.Sprite(spriteMat(sconce.texture));
    flame.position.set(x + inward[0], y + 0.4, z + inward[2]);
    flame.scale.set(0.38, 0.48, 1);
    propsGroup.add(flame);
    torchFlames.push(flame);
  };

  placeSconce(0.07, 1.32, CELL * 1.5, Math.PI / 2, [0.14, 0, 0]);
  placeSconce(CELL * ROOM_TILES - 0.07, 1.32, CELL * 1.5, -Math.PI / 2, [-0.14, 0, 0]);

  const lampH = 0.72;
  const lampW = lampH * (lampPng.img.naturalWidth / lampPng.img.naturalHeight);
  const lampMat = new THREE.MeshStandardMaterial({
    map: lampPng.texture,
    transparent: true,
    alphaTest: 0.12,
    roughness: 0.45,
    metalness: 0.08,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
    side: THREE.DoubleSide
  });
  const lampMesh = new THREE.Mesh(new THREE.PlaneGeometry(lampW, lampH), lampMat);
  lampMesh.position.set(CELL * 1.5, 1.22, 0.08);
  lampMesh.userData.isLamp = true;
  lampMesh.name = 'pell-lamp';
  const lampHit = new THREE.Mesh(
    new THREE.PlaneGeometry(lampW * 1.6, lampH * 1.5),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  lampHit.position.copy(lampMesh.position);
  lampHit.userData.isLamp = true;
  lampHit.name = 'pell-lamp-hit';
  propsGroup.add(lampMesh, lampHit);

  flatGroup.visible = false;

  return {
    voxelGroup,
    flatGroup,
    propsGroup,
    lampMesh,
    lampTargets: [lampMesh, lampHit],
    torchFlames,
    stats: { voxels, triangles, quads, tiles: jobs.length }
  };
}

export async function loadFlameTextures(): Promise<THREE.Texture[]> {
  const out: THREE.Texture[] = [];
  for (const file of [
    'torch/flame_calm_1.png',
    'torch/flame_calm_2.png',
    'torch/flame_calm_3.png',
    'torch/flame_calm_4.png'
  ]) {
    const png = await loadPng(file);
    out.push(png.texture);
  }
  return out;
}
