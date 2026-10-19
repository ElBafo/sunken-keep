import * as THREE from 'three';
import {
  CELL,
  SCONCE_RADIUS_TILES,
  SUNBEAM_ANGLE,
  SUNBEAM_DECAY,
  SUNBEAM_DISTANCE,
  SUNBEAM_INTENSITY,
  SUNBEAM_PENUMBRA,
  SUNBEAM_RADIUS_TILES,
  SUNBEAM_RGB,
  TORCH_DECAY,
  TORCH_DISTANCE,
  TORCH_INTENSITY,
  TORCH_RGB
} from './constants';
import {
  beamKey,
  floodReach,
  sconceIsLit,
  sconceKey,
  sconceRoom,
  torchWorldPos,
  type SconceSpec,
  type SunbeamSpec
} from './fixtures';
import type { FloorMap } from './layout';

export const FAR_TORCH_SLOTS = 3;
export const FAR_BEAM_SLOTS = 3;
/** Subdivide flood flats so the torch-wall hotspot and beam cone survive the far LOD. */
export const FAR_BAKE_SEGS = 8;

const SUNBEAM_CONE_COS = Math.cos(SUNBEAM_ANGLE);
const SUNBEAM_PENUMBRA_COS = Math.cos(SUNBEAM_ANGLE * (1 - SUNBEAM_PENUMBRA));

export type FarTorch = {
  key: string;
  pos: { x: number; y: number; z: number };
  reach: Set<string>;
};

export type FarBeam = {
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

export function litFarBeams(map: FloorMap, beams: SunbeamSpec[]): FarBeam[] {
  const out: FarBeam[] = [];
  for (const b of beams) {
    out.push({
      key: beamKey(b),
      pos: { x: b.wx, y: CELL, z: b.wz },
      reach: floodReach(map, b.x, b.y, SUNBEAM_RADIUS_TILES)
    });
    if (out.length >= FAR_BEAM_SLOTS) break;
  }
  return out;
}

/** Tile sits in a lit torch's 2.5-tile flood — keep it even past the far cull. */
export function tileInTorchFlood(tx: number, tz: number, torches: FarTorch[]): boolean {
  const key = `${tx},${tz}`;
  for (const t of torches) {
    if (t.reach.has(key)) return true;
  }
  return false;
}

/** Tile sits in a beam's 2-tile flood — keep the patch even past the far cull. */
export function tileInBeamFlood(tx: number, tz: number, beams: FarBeam[]): boolean {
  const key = `${tx},${tz}`;
  for (const b of beams) {
    if (b.reach.has(key)) return true;
  }
  return false;
}

export function tileInLightFlood(
  tx: number,
  tz: number,
  torches: FarTorch[],
  beams: FarBeam[]
): boolean {
  return tileInTorchFlood(tx, tz, torches) || tileInBeamFlood(tx, tz, beams);
}

/**
 * Same windowed inverse-square as Three.js PointLight / SpotLight
 * (getDistanceAttenuation). Shared with the near real lights so the pool
 * does not change size at the switch.
 */
export function torchAttenuation(
  distMeters: number,
  range = TORCH_DISTANCE,
  decay = TORCH_DECAY
): number {
  if (range > 0 && distMeters >= range) return 0;
  const distanceFalloff = 1 / Math.max(Math.pow(distMeters, decay), 0.01);
  if (range <= 0) return distanceFalloff;
  const window = Math.min(1, Math.max(0, 1 - Math.pow(distMeters / range, 4)));
  return distanceFalloff * window * window;
}

/** Same GLSL smoothstep as Three.js getSpotAttenuation. */
export function spotAttenuation(
  angleCos: number,
  coneCos = SUNBEAM_CONE_COS,
  penumbraCos = SUNBEAM_PENUMBRA_COS
): number {
  if (penumbraCos === coneCos) return angleCos >= coneCos ? 1 : 0;
  const t = Math.min(1, Math.max(0, (angleCos - coneCos) / (penumbraCos - coneCos)));
  return t * t * (3 - 2 * t);
}

/** Per-torch PointLight attenuation on a reachable tile. Unreachable → 0 (stays dark). */
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
    w[i] = torchAttenuation(d);
  }
  return w;
}

/**
 * Per-beam SpotLight: distance window × cone/penumbra, same as getSpotLightInfo.
 * Light at ceiling aiming down; unreachable or outside the cone → 0.
 */
export function bakeBeamWeights(
  tx: number,
  tz: number,
  wx: number,
  wy: number,
  wz: number,
  beams: FarBeam[]
): [number, number, number] {
  const key = `${tx},${tz}`;
  const w: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < beams.length && i < FAR_BEAM_SLOTS; i++) {
    if (!beams[i].reach.has(key)) continue;
    const dx = beams[i].pos.x - wx;
    const dy = beams[i].pos.y - wy;
    const dz = beams[i].pos.z - wz;
    const d = Math.hypot(dx, dy, dz);
    const angleCos = d > 1e-8 ? dy / d : 1;
    const cone = spotAttenuation(angleCos);
    if (cone <= 0) continue;
    w[i] = torchAttenuation(d, SUNBEAM_DISTANCE, SUNBEAM_DECAY) * cone;
  }
  return w;
}

function weightsFromPositions(
  positions: number[],
  tx: number,
  tz: number,
  torches: FarTorch[],
  beams: FarBeam[]
): { farW: number[]; farB: number[] } {
  const farW = new Array((positions.length / 3) * 3);
  const farB = new Array((positions.length / 3) * 3);
  for (let i = 0; i < positions.length; i += 3) {
    const tw = bakeWeights(tx, tz, positions[i], positions[i + 1], positions[i + 2], torches);
    const bw = bakeBeamWeights(tx, tz, positions[i], positions[i + 1], positions[i + 2], beams);
    farW[i] = tw[0];
    farW[i + 1] = tw[1];
    farW[i + 2] = tw[2];
    farB[i] = bw[0];
    farB[i + 1] = bw[1];
    farB[i + 2] = bw[2];
  }
  return { farW, farB };
}

function mergeFar(
  items: Array<{
    positions: number[];
    normals: number[];
    uvs: number[];
    indices: number[];
    farW: number[];
    farB: number[];
  }>
): {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  farW: number[];
  farB: number[];
} {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const farW: number[] = [];
  const farB: number[] = [];
  for (const m of items) {
    const base = positions.length / 3;
    for (let i = 0; i < m.positions.length; i++) positions.push(m.positions[i]);
    for (let i = 0; i < m.normals.length; i++) normals.push(m.normals[i]);
    for (let i = 0; i < m.uvs.length; i++) uvs.push(m.uvs[i]);
    for (let i = 0; i < m.farW.length; i++) farW.push(m.farW[i]);
    for (let i = 0; i < m.farB.length; i++) farB.push(m.farB[i]);
    for (let i = 0; i < m.indices.length; i++) indices.push(m.indices[i] + base);
  }
  return { positions, normals, uvs, indices, farW, farB };
}

function rotateOffset(
  x: number,
  y: number,
  z: number,
  rotX: number,
  rotY: number
): [number, number, number] {
  const cx = Math.cos(rotX);
  const sx = Math.sin(rotX);
  const cy = Math.cos(rotY);
  const sy = Math.sin(rotY);
  const y1 = y * cx - z * sx;
  const z1 = y * sx + z * cx;
  return [x * cy + z1 * sy, y1, -x * sy + z1 * cy];
}

function geometryFromMerged(merged: ReturnType<typeof mergeFar>): THREE.BufferGeometry | null {
  if (merged.indices.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(merged.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(merged.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(merged.uvs, 2));
  g.setAttribute('aFarW', new THREE.Float32BufferAttribute(merged.farW, 3));
  g.setAttribute('aFarB', new THREE.Float32BufferAttribute(merged.farB, 3));
  g.setIndex(merged.indices);
  g.computeBoundingSphere();
  return g;
}

function packFlatQuad(
  pose: { x: number; y: number; z: number; rotX: number; rotY: number },
  tx: number,
  tz: number,
  size: number,
  segs: number,
  torches: FarTorch[],
  beams: FarBeam[]
): {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  farW: number[];
  farB: number[];
} {
  const hw = size / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const n = rotateOffset(0, 0, 1, pose.rotX, pose.rotY);
  const cols = segs + 1;
  for (let j = 0; j <= segs; j++) {
    const v = j / segs;
    const py = -hw + v * size;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const px = -hw + u * size;
      const p = rotateOffset(px, py, 0, pose.rotX, pose.rotY);
      positions.push(p[0] + pose.x, p[1] + pose.y, p[2] + pose.z);
      normals.push(n[0], n[1], n[2]);
      uvs.push(u, v);
    }
  }
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(c, a, d, a, b, d);
    }
  }
  const { farW, farB } = weightsFromPositions(positions, tx, tz, torches, beams);
  return { positions, normals, uvs, indices, farW, farB };
}

/** Far-ring quads with the same aFarW / aFarB path as near voxels — no instanced attrs. */
export function flatGeometryWithBake(
  items: Array<{
    pose: { x: number; y: number; z: number; rotX: number; rotY: number };
    tx: number;
    tz: number;
    segs?: number;
    size?: number;
  }>,
  torches: FarTorch[],
  cell: number,
  beams: FarBeam[] = []
): THREE.BufferGeometry | null {
  const packed = items.map((item) =>
    packFlatQuad(item.pose, item.tx, item.tz, item.size ?? cell, item.segs ?? 1, torches, beams)
  );
  return geometryFromMerged(mergeFar(packed));
}

export function geometryWithBake(
  items: Array<{
    mesh: { positions: number[]; normals: number[]; uvs: number[]; indices: number[] };
    tx: number;
    tz: number;
  }>,
  torches: FarTorch[],
  beams: FarBeam[] = []
): THREE.BufferGeometry | null {
  const packed = items.map((item) => ({
    ...item.mesh,
    ...weightsFromPositions(item.mesh.positions, item.tx, item.tz, torches, beams)
  }));
  return geometryFromMerged(mergeFar(packed));
}

/** Lambert irradiance from the shared lights: color × intensity × attenuation. No ambient floor. */
const FAR_IRRADIANCE = `( uFarColor * max( dot( vFarW, uFarBlend ), 0.0 ) + uFarBeamColor * max( dot( vFarB, uFarBeamBlend ), 0.0 ) )`;

const FOG_LIT_SKIP = `{
#ifdef USE_FOG
#ifdef FOG_EXP2
	float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
#else
	float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
#endif
	float farCover = max( vFarW.x, max( vFarW.y, vFarW.z ) ) + max( vFarB.x, max( vFarB.y, vFarB.z ) );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor * ( 1.0 - saturate( farCover * 12.0 ) ) );
#endif
}`;

export function patchBakeMaterial(mat: THREE.Material): void {
  mat.userData.uFarColor = {
    value: new THREE.Vector3(TORCH_RGB[0], TORCH_RGB[1], TORCH_RGB[2]).multiplyScalar(TORCH_INTENSITY)
  };
  mat.userData.uFarBlend = { value: new THREE.Vector3() };
  mat.userData.uFarBeamColor = {
    value: new THREE.Vector3(SUNBEAM_RGB[0], SUNBEAM_RGB[1], SUNBEAM_RGB[2]).multiplyScalar(
      SUNBEAM_INTENSITY
    )
  };
  mat.userData.uFarBeamBlend = { value: new THREE.Vector3() };
  mat.customProgramCacheKey = () => 'floor1-far-bake-v8';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFarColor = mat.userData.uFarColor;
    shader.uniforms.uFarBlend = mat.userData.uFarBlend;
    shader.uniforms.uFarBeamColor = mat.userData.uFarBeamColor;
    shader.uniforms.uFarBeamBlend = mat.userData.uFarBeamBlend;
    if (!shader.vertexShader.includes('attribute vec3 aFarW')) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec3 aFarW;
attribute vec3 aFarB;
varying vec3 vFarW;
varying vec3 vFarB;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vFarW = aFarW;
vFarB = aFarB;`
        );
    }
    if (shader.fragmentShader.includes('uFarBeamColor')) return;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vFarW;
varying vec3 vFarB;
uniform vec3 uFarColor;
uniform vec3 uFarBlend;
uniform vec3 uFarBeamColor;
uniform vec3 uFarBeamBlend;`
    );
    if (shader.fragmentShader.includes('vec3 outgoingLight = reflectedLight.indirectDiffuse;')) {
      // MeshBasic far: same Lambert term as the near real light. Unlit → black.
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec3 outgoingLight = reflectedLight.indirectDiffuse;',
        `vec3 outgoingLight = reflectedLight.indirectDiffuse * ${FAR_IRRADIANCE} * RECIPROCAL_PI;`
      );
    } else {
      // MeshPhysical: add the same Lambert term after clearcoat. Do not max() with a floor.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `outgoingLight += diffuseColor.rgb * ${FAR_IRRADIANCE} * RECIPROCAL_PI;
#include <opaque_fragment>`
      );
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', FOG_LIT_SKIP);
  };
  mat.needsUpdate = true;
}

export function farBakeMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map,
    fog: true,
    toneMapped: false
  });
  patchBakeMaterial(mat);
  return mat;
}

export type BakeBlendKind = 'complement' | 'full' | 'off';

export function setBakeBlends(
  mats: Iterable<THREE.Material>,
  torches: FarTorch[],
  blends: Map<string, number>,
  flick = 1,
  beams: FarBeam[] = [],
  kind: BakeBlendKind = 'complement'
): void {
  const torchV = new THREE.Vector3();
  const beamV = new THREE.Vector3();
  if (kind !== 'off') {
    for (let i = 0; i < FAR_TORCH_SLOTS; i++) {
      const t = torches[i];
      if (!t) {
        torchV.setComponent(i, 0);
        continue;
      }
      const real = blends.get(t.key) ?? 0;
      const w = kind === 'full' ? 1 : Math.max(0, 1 - real);
      torchV.setComponent(i, w * flick);
    }
    for (let i = 0; i < FAR_BEAM_SLOTS; i++) {
      const b = beams[i];
      if (!b) {
        beamV.setComponent(i, 0);
        continue;
      }
      const real = blends.get(b.key) ?? 0;
      beamV.setComponent(i, kind === 'full' ? 1 : Math.max(0, 1 - real));
    }
  }
  for (const mat of mats) {
    const u = mat.userData.uFarBlend as { value: THREE.Vector3 } | undefined;
    if (u) u.value.copy(torchV);
    const b = mat.userData.uFarBeamBlend as { value: THREE.Vector3 } | undefined;
    if (b) b.value.copy(beamV);
  }
}
