import * as THREE from 'three';
import { CELL } from './constants';
import { floor1Map } from './layout';
import { enablePaintedSampling } from './painted';
import { loadPng } from '../voxel-lab/materials';

export const STAIRS_CELL = { x: 16, y: 10 } as const;

function stoneMat(map: THREE.Texture, tint = 0xffffff): THREE.MeshPhysicalMaterial {
  enablePaintedSampling(map);
  return new THREE.MeshPhysicalMaterial({
    map,
    color: tint,
    roughness: 1,
    metalness: 0,
    ior: 1.45,
    clearcoat: 0,
    sheen: 0,
    specularIntensity: 0,
    envMapIntensity: 0,
    fog: true,
    emissive: 0x000000
  });
}

/** Voxel well + worn steps on the Classic down-stairs cell. Looks south from (16,9). */
export async function buildFloor1Stairs(): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = 'floor1-stairs';
  const [floorPng, glowPng] = await Promise.all([
    loadPng('floor_stone.png'),
    loadPng('../fx/dark/stairs_glow.png')
  ]);
  const stone = stoneMat(floorPng.texture, 0xb8b0a4);
  const dark = stoneMat(floorPng.texture, 0x3a342e);
  const wx = STAIRS_CELL.x * CELL;
  const wz = STAIRS_CELL.y * CELL;
  const add = (
    mesh: THREE.Mesh,
    x: number,
    y: number,
    z: number,
    name: string
  ): void => {
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = name;
    group.add(mesh);
  };

  add(new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.98, 0.08, CELL * 0.98), dark), wx, -1.15, wz, 'stairs-pit');

  const treads: Array<[number, number, number, number, number, number]> = [
    [1.7, 0.16, 0.42, wx, -0.08, wz - 0.72],
    [1.55, 0.16, 0.42, wx + 0.04, -0.3, wz - 0.28],
    [1.4, 0.16, 0.42, wx - 0.03, -0.52, wz + 0.16],
    [1.25, 0.16, 0.48, wx + 0.02, -0.74, wz + 0.62]
  ];
  treads.forEach(([w, h, d, x, y, z], i) => {
    add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone), x, y, z, `stairs-tread-${i}`);
  });

  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 1.7), dark), wx - 0.88, -0.42, wz + 0.05, 'stairs-wall-w');
  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 1.7), dark), wx + 0.88, -0.42, wz + 0.05, 'stairs-wall-e');
  add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.18), stone), wx, 0.02, wz - 0.94, 'stairs-nosing');

  const glowMap = glowPng.texture;
  glowMap.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 1.15),
    new THREE.MeshBasicMaterial({
      map: glowMap,
      color: 0xc8ffd4,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(wx, -0.64, wz + 0.35);
  glow.userData.kind = 'stairs-glow';
  glow.userData.noShadow = true;
  group.add(glow);
  return group;
}

export function floor1HasStairs(): boolean {
  return floor1Map.tiles[STAIRS_CELL.y]?.[STAIRS_CELL.x]?.stairs === 'down';
}
