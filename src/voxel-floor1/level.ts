import * as THREE from 'three';
import { volumeFromImageData, type VolumeFromPixels } from '../voxel-lab/classify';
import { makeToWorld, tileFlatPose } from '../voxel-lab/faces';
import { loadPng, pbrMap, voxelMaterial, type PngPixels } from '../voxel-lab/materials';
import { greedyMesh, type MeshArrays } from '../voxel-lab/mesher';
import { CELL, CRACKED_CEILING_FILE, CULL_CHEB, LAYER_SIZE, VOXEL_CHEB } from './constants';
import { floor1Sconces, floor1Sunbeams } from './fixtures';
import { chebyshev, enumerateFaces, type FaceJob, type FloorMap } from './layout';
import { isBeamCeiling, loadCrackedCeiling } from './crack';
import {
  farBakeMaterial,
  flatGeometryWithBake,
  geometryWithBake,
  litFarTorches,
  patchBakeMaterial,
  setBakeBlends as applyBakeBlends,
  tileInTorchFlood,
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
  const farMats = new Map<string, THREE.MeshBasicMaterial>();
  for (const file of needed) {
    const png = pngs.get(file);
    const rough = roughByFile.get(file);
    if (!png || !rough) continue;
    const mat = voxelMaterial(png.texture, rough);
    mat.name = file;
    patchBakeMaterial(mat);
    mats.set(file, mat);
    const farMat = farBakeMaterial(png.texture);
    farMat.name = `far:${file}`;
    farMats.set(file, farMat);
  }

  const group = new THREE.Group();
  group.name = 'floor1';
  const voxelGroup = new THREE.Group();
  voxelGroup.name = 'voxels';
  const flatGroup = new THREE.Group();
  flatGroup.name = 'flats';
  group.add(voxelGroup, flatGroup);

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
      if (child.geometry) child.geometry.dispose();
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
      // Keep each torch's 2.5-tile pool even when the party is far down the hall.
      if (dist > CULL_CHEB && !tileInTorchFlood(face.tx, face.tz, torches)) continue;
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
    for (const [file, list] of flatsByFile) {
      const mat = farMats.get(file);
      const geo = flatGeometryWithBake(
        list.map((f) => ({ pose: f.pose, tx: f.tx, tz: f.tz })),
        torches,
        CELL
      );
      if (!mat || !geo) continue;
      liveTris += (geo.getIndex()?.count ?? 0) / 3;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.castWhenOn = false;
      mesh.userData.receiveWhenOn = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.name = `flat:${file}`;
      flatGroup.add(mesh);
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
      applyBakeBlends([...mats.values(), ...farMats.values()], torches, blends, flick);
    }
  };
}
