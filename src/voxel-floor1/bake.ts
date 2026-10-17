import * as THREE from 'three';
import { CELL, SCONCE_RADIUS_TILES } from './constants';
import {
  floodReach,
  sconceIsLit,
  sconceKey,
  sconceRoom,
  torchWorldPos,
  type SconceSpec
} from './fixtures';
import { GAME_TORCH_RGB } from '../voxel-lab/look';
import type { FloorMap } from './layout';

/**
 * Classic TORCH_INTENSITY. Far surfaces are MeshBasic-style: texture × this
 * warm factor, falling off from the flame. Not a halo, not an untextured add.
 */
export const BAKE_GAIN = 1.45;
export const FAR_TORCH_SLOTS = 3;

export type FarTorch = {
  key: string;
  pos: { x: number; y: number; z: number };
  reach: Set<string>;
};

export function litFarTorches(map: FloorMap, sconces: SconceSpec[]): FarTorch[] {
  const out: FarTorch[] = [];
  for (const s of sconces) {
    if (!sconceIsLit(s)) continue;
    const room = sconceRoom(s);
    out.push({
      key: sconceKey(s),
      pos: torchWorldPos(s),
      reach: floodReach(map, room.x, room.y, SCONCE_RADIUS_TILES)
    });
    if (out.length >= FAR_TORCH_SLOTS) break;
  }
  return out;
}

export function smoothFalloff(distTiles: number, radius: number): number {
  if (distTiles >= radius) return 0;
  const t = 1 - distTiles / radius;
  return t * t;
}

/** Per-torch falloff on a reachable tile. Channels map to the 3 lit floor-1 torches. */
export function bakeWeights(
  tx: number,
  tz: number,
  wx: number,
  wy: number,
  wz: number,
  torches: FarTorch[]
): [number, number, number] {
  const key = `${tx},${tz}`;
  const w: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < torches.length && i < FAR_TORCH_SLOTS; i++) {
    if (!torches[i].reach.has(key)) continue;
    const d = Math.hypot(wx - torches[i].pos.x, wy - torches[i].pos.y, wz - torches[i].pos.z);
    w[i] = smoothFalloff(d / CELL, SCONCE_RADIUS_TILES);
  }
  return w;
}

export function weightsFromPositions(
  positions: number[],
  tx: number,
  tz: number,
  torches: FarTorch[]
): number[] {
  const out = new Array((positions.length / 3) * 3);
  for (let i = 0; i < positions.length; i += 3) {
    const w = bakeWeights(tx, tz, positions[i], positions[i + 1], positions[i + 2], torches);
    const o = i;
    out[o] = w[0];
    out[o + 1] = w[1];
    out[o + 2] = w[2];
  }
  return out;
}

function mergeFar(
  items: Array<{ positions: number[]; normals: number[]; uvs: number[]; indices: number[]; farW: number[] }>
): {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  farW: number[];
} {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const farW: number[] = [];
  for (const m of items) {
    const base = positions.length / 3;
    for (let i = 0; i < m.positions.length; i++) positions.push(m.positions[i]);
    for (let i = 0; i < m.normals.length; i++) normals.push(m.normals[i]);
    for (let i = 0; i < m.uvs.length; i++) uvs.push(m.uvs[i]);
    for (let i = 0; i < m.farW.length; i++) farW.push(m.farW[i]);
    for (let i = 0; i < m.indices.length; i++) indices.push(m.indices[i] + base);
  }
  return { positions, normals, uvs, indices, farW };
}

export function geometryWithBake(
  items: Array<{
    mesh: { positions: number[]; normals: number[]; uvs: number[]; indices: number[] };
    tx: number;
    tz: number;
  }>,
  torches: FarTorch[]
): THREE.BufferGeometry | null {
  const packed = items.map((item) => ({
    ...item.mesh,
    farW: weightsFromPositions(item.mesh.positions, item.tx, item.tz, torches)
  }));
  const merged = mergeFar(packed);
  if (merged.indices.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(merged.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(merged.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(merged.uvs, 2));
  g.setAttribute('aFarW', new THREE.Float32BufferAttribute(merged.farW, 3));
  g.setIndex(merged.indices);
  g.computeBoundingSphere();
  return g;
}

export function patchBakeMaterial(mat: THREE.MeshPhysicalMaterial): void {
  // Classic vertex bake is sRGB torch × 1.45, then albedo multiply. Keep the
  // same numbers so far bricks read warm-yellow, not a linear-orange wash.
  mat.userData.uFarColor = {
    value: new THREE.Vector3(GAME_TORCH_RGB[0], GAME_TORCH_RGB[1], GAME_TORCH_RGB[2]).multiplyScalar(BAKE_GAIN)
  };
  mat.userData.uFarBlend = { value: new THREE.Vector3() };
  mat.customProgramCacheKey = () => 'floor1-far-bake-v2';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFarColor = mat.userData.uFarColor;
    shader.uniforms.uFarBlend = mat.userData.uFarBlend;
    if (!shader.vertexShader.includes('attribute vec3 aFarW')) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec3 aFarW;
varying vec3 vFarW;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vFarW = aFarW;`
        );
    }
    if (!shader.fragmentShader.includes('uFarColor')) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vFarW;
uniform vec3 uFarColor;
uniform vec3 uFarBlend;`
        )
        .replace(
          '#include <opaque_fragment>',
          `outgoingLight += diffuseColor.rgb * uFarColor * max(dot(vFarW, uFarBlend), 0.0);
#include <opaque_fragment>`
        );
    }
  };
  mat.needsUpdate = true;
}

export function setBakeBlends(
  mats: Iterable<THREE.MeshPhysicalMaterial>,
  torches: FarTorch[],
  blends: Map<string, number>,
  flick = 1
): void {
  const v = new THREE.Vector3();
  for (let i = 0; i < FAR_TORCH_SLOTS; i++) {
    const t = torches[i];
    const real = t ? (blends.get(t.key) ?? 0) : 1;
    v.setComponent(i, t ? Math.max(0, 1 - real) * flick : 0);
  }
  for (const mat of mats) {
    const u = mat.userData.uFarBlend as { value: THREE.Vector3 } | undefined;
    if (u) u.value.copy(v);
  }
}
