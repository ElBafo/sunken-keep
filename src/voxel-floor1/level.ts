import * as THREE from 'three';
import { volumeFromImageData, type VolumeFromPixels } from '../voxel-lab/classify';
import { makeToWorld, tileFlatPose, type FaceId } from '../voxel-lab/faces';
import { loadPng, pbrMap, voxelMaterial, type PngPixels } from '../voxel-lab/materials';
import { greedyMesh, type MeshArrays } from '../voxel-lab/mesher';
import { CELL, CRACKED_CEILING_FILE, CULL_CHEB, LAYER_SIZE, VOXEL_CHEB } from './constants';
import { floor1Sconces, floor1Sunbeams } from './fixtures';
import { chebyshev, enumerateFaces, type FaceJob, type FloorMap } from './layout';
import { isBeamCeiling, loadCrackedCeiling } from './crack';
import {
  geometryWithBake,
  litFarTorches,
  patchBakeMaterial,
  setBakeBlends as applyBakeBlends,
  bakeWeights,
  type FarTorch
} from './bake';

export interface LevelStats {
  voxels: number;
  triangles: number;
  totalTriangles: number;
  quads: number;
  faces: number;
  voxelFaces: number;
  flatFaces: number;
  draws: number;
}

export interface BuiltLevel {
  group: THREE.Group;
  stats: LevelStats;
  /** Rebuilds nearby voxel/flat meshes. False when the party cell did not change. */
  setParty: (x: number, y: number) => boolean;
  setBakeBlends: (blends: Map<string, number>, flick?: number) => void;
}

type PreparedFace = FaceJob & {
  mesh: MeshArrays;
  pose: ReturnType<typeof tileFlatPose>;
};

function applyPose(mesh: THREE.Object3D, face: FaceId, tx: number, tz: number): void {
  const pose = tileFlatPose(face, tx, tz, CELL, 'center');
  mesh.position.set(pose.x, pose.y, pose.z);
  mesh.rotation.set(pose.rotX, pose.rotY, 0);
}

export async function buildFloor1(map: FloorMap, partyX: number, partyY: number): Promise<BuiltLevel> {
  const jobs = enumerateFaces(map);
  for (const job of jobs) {
    if (job.kind === 'ceiling' && isBeamCeiling(job.tx, job.tz, floor1Sunbeams)) {
      job.file = CRACKED_CEILING_FILE;
    }
  }
  const needed = [...new Set(jobs.map((j) => j.file))];
  const pngs = new Map<string, PngPixels>();
  await Promise.all(
    needed.map(async (file) => {
      pngs.set(file, file === CRACKED_CEILING_FILE ? await loadCrackedCeiling() : await loadPng(file));
    })
  );

  const volumes = new Map<string, VolumeFromPixels>();
  const roughByFile = new Map<string, THREE.DataTexture>();
  let voxels = 0;
  let quads = 0;
  let triangles = 0;

  for (const file of needed) {
    const png = pngs.get(file)!;
    const vol = volumeFromImageData(png.data);
    volumes.set(file, vol);
    voxels += vol.voxelCount;
    roughByFile.set(file, pbrMap(vol.roughness, vol.dims[0], vol.dims[1]));
  }

  const prepared: PreparedFace[] = [];
  for (const job of jobs) {
    const vol = volumes.get(job.file);
    if (!vol) continue;
    const toWorld = makeToWorld(job.face, job.tx, job.tz, vol.dims, LAYER_SIZE, CELL, 'center');
    const meshed = greedyMesh(vol.volume, vol.dims, toWorld);
    quads += meshed.quads;
    triangles += meshed.triangles;
    prepared.push({
      ...job,
      mesh: meshed.mesh,
      pose: tileFlatPose(job.face, job.tx, job.tz, CELL, 'center')
    });
  }

  const torches: FarTorch[] = litFarTorches(map, floor1Sconces);
  const mats = new Map<string, THREE.MeshPhysicalMaterial>();
  for (const file of needed) {
    const png = pngs.get(file);
    const rough = roughByFile.get(file);
    if (!png || !rough) continue;
    const mat = voxelMaterial(png.texture, rough);
    mat.name = file;
    patchBakeMaterial(mat);
    mats.set(file, mat);
  }

  const group = new THREE.Group();
  group.name = 'floor1';
  const voxelGroup = new THREE.Group();
  voxelGroup.name = 'voxels';
  const flatGroup = new THREE.Group();
  flatGroup.name = 'flats';
  group.add(voxelGroup, flatGroup);

  const planeGeo = new THREE.PlaneGeometry(CELL, CELL);
  const stats: LevelStats = {
    voxels,
    triangles: 0,
    totalTriangles: triangles,
    quads,
    faces: jobs.length,
    voxelFaces: 0,
    flatFaces: 0,
    draws: 0
  };

  const clearGroup = (g: THREE.Group): void => {
    while (g.children.length) {
      const child = g.children[0] as THREE.Mesh;
      g.remove(child);
      if (child.geometry && child.geometry !== planeGeo) child.geometry.dispose();
    }
  };

  const remesh = (px: number, py: number): void => {
    clearGroup(voxelGroup);
    clearGroup(flatGroup);
    const voxelByFile = new Map<string, PreparedFace[]>();
    const flats: PreparedFace[] = [];
    let voxelFaces = 0;
    for (const face of prepared) {
      const dist = chebyshev(px, py, face.tx, face.tz);
      if (dist > CULL_CHEB) continue;
      if (dist <= VOXEL_CHEB) {
        const list = voxelByFile.get(face.file) ?? [];
        list.push(face);
        voxelByFile.set(face.file, list);
        voxelFaces += 1;
      } else {
        flats.push(face);
      }
    }

    let liveTris = 0;
    for (const [file, faces] of voxelByFile) {
      const mat = mats.get(file);
      const geo = geometryWithBake(
        faces.map((f) => ({ mesh: f.mesh, tx: f.tx, tz: f.tz })),
        torches
      );
      if (!mat || !geo) continue;
      liveTris += (geo.getIndex()?.count ?? 0) / 3;
      const mesh = new THREE.Mesh(geo, mat);
      const isFloor = file.startsWith('floor_');
      mesh.userData.castWhenOn = !isFloor;
      mesh.castShadow = !isFloor;
      mesh.receiveShadow = true;
      mesh.name = `voxel:${file}`;
      voxelGroup.add(mesh);
    }

    const flatsByFile = new Map<string, PreparedFace[]>();
    for (const face of flats) {
      const list = flatsByFile.get(face.file) ?? [];
      list.push(face);
      flatsByFile.set(face.file, list);
    }
    const dummy = new THREE.Object3D();
    for (const [file, list] of flatsByFile) {
      const mat = mats.get(file);
      if (!mat) continue;
      const geo = planeGeo.clone();
      const farW = new Float32Array(list.length * 3);
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const isFloor = file.startsWith('floor_');
      for (let i = 0; i < list.length; i++) {
        applyPose(dummy, list[i].face, list[i].tx, list[i].tz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const pose = list[i].pose;
        const w = bakeWeights(list[i].tx, list[i].tz, pose.x, pose.y, pose.z, torches);
        farW[i * 3] = w[0];
        farW[i * 3 + 1] = w[1];
        farW[i * 3 + 2] = w[2];
      }
      geo.setAttribute('aFarW', new THREE.InstancedBufferAttribute(farW, 3));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.castWhenOn = !isFloor;
      mesh.castShadow = !isFloor;
      mesh.receiveShadow = true;
      mesh.name = `flat:${file}`;
      flatGroup.add(mesh);
      liveTris += list.length * 2;
    }

    stats.voxelFaces = voxelFaces;
    stats.flatFaces = flats.length;
    stats.triangles = liveTris;
    stats.draws = voxelGroup.children.length + flatGroup.children.length;
  };

  remesh(partyX, partyY);
  let lastX = partyX;
  let lastY = partyY;

  return {
    group,
    stats,
    setParty: (x, y) => {
      if (x === lastX && y === lastY) return false;
      lastX = x;
      lastY = y;
      remesh(x, y);
      return true;
    },
    setBakeBlends: (blends, flick = 1) => {
      applyBakeBlends(mats.values(), torches, blends, flick);
    }
  };
}
