import * as THREE from 'three';
import { volumeFromImageData, type VolumeFromPixels } from '../voxel-lab/classify';
import { makeToWorld, tileFlatPose } from '../voxel-lab/faces';
import { loadPng, pbrMap, voxelMaterial, type PngPixels } from '../voxel-lab/materials';
import { greedyMesh, type MeshArrays } from '../voxel-lab/mesher';
import { CELL, CRACKED_CEILING_FILE, CULL_CHEB, LAYER_SIZE, VOXEL_CHEB } from './constants';
import { floor1Sconces, floor1Sunbeams } from './fixtures';
import { canStep, chebyshev, enumerateFaces, type FaceJob, type FloorMap } from './layout';
import { isBeamCeiling, loadCrackedCeiling } from './crack';
import {
  FAR_BAKE_SEGS,
  farBakeMaterial,
  flatGeometryWithBake,
  geometryWithBake,
  litFarBeams,
  litFarTorches,
  patchBakeMaterial,
  setBakeBlends as applyBakeBlends,
  tileInLightFlood,
  type FarBeam,
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
  cacheSize: number;
  lastBuildMs: number;
  /** Shows cached near-ring meshes. False when the party cell did not change. */
  setParty: (x: number, y: number) => boolean;
  /** Build dest cell meshes if missing. True when this call created them. */
  prefetch: (x: number, y: number) => boolean;
  /** Visibility swap only — no new geometry or materials. */
  activate: (x: number, y: number) => void;
  /** Dummy-draw a just-built cell so GPU uploads happen off the arrival frame. */
  warm: (draw: () => void) => void;
  /** Build at most one neighbouring cell while idle. True when it created one. */
  pump: () => boolean;
  setBakeBlends: (blends: Map<string, number>, flick?: number) => void;
}

type PreparedFace = FaceJob & {
  mesh: MeshArrays;
  pose: ReturnType<typeof tileFlatPose>;
};

export async function buildFloor1(
  map: FloorMap,
  partyX: number,
  partyY: number,
  realLights = false
): Promise<BuiltLevel> {
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
  const beams: FarBeam[] = litFarBeams(map, floor1Sunbeams);
  const mats = new Map<string, THREE.MeshPhysicalMaterial>();
  const farMats = new Map<string, THREE.Material>();
  for (const file of needed) {
    const png = pngs.get(file);
    const rough = roughByFile.get(file);
    if (!png || !rough) continue;
    const mat = voxelMaterial(png.texture, rough);
    mat.name = file;
    if (!realLights) patchBakeMaterial(mat);
    mats.set(file, mat);
    if (realLights) {
      const farMat = voxelMaterial(png.texture, rough);
      farMat.name = `far:${file}`;
      farMats.set(file, farMat);
    } else {
      const farMat = farBakeMaterial(png.texture);
      farMat.name = `far:${file}`;
      farMats.set(file, farMat);
    }
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

  type CellCache = {
    key: string;
    x: number;
    y: number;
    voxel: THREE.Group;
    flat: THREE.Group;
    voxelFaces: number;
    flatFaces: number;
    triangles: number;
    warmed: boolean;
    used: number;
  };

  const cells = new Map<string, CellCache>();
  const MAX_CELLS = 16;
  const STEP: Array<[number, number]> = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0]
  ];
  let lastX = partyX;
  let lastY = partyY;
  let activeKey = '';
  let pendingWarm: CellCache | null = null;
  let lastBuildMs = 0;
  let useTick = 1;
  const pumpQueue: string[] = [];

  const cellKey = (x: number, y: number): string => `${x},${y}`;

  const disposeGroup = (g: THREE.Group): void => {
    while (g.children.length) {
      const child = g.children[0] as THREE.Mesh;
      g.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
  };

  const buildCell = (px: number, py: number): CellCache => {
    const t0 = performance.now();
    const voxelByFile = new Map<string, PreparedFace[]>();
    const flats: Array<PreparedFace & { segs: number }> = [];
    let voxelFaces = 0;
    for (const face of prepared) {
      const dist = chebyshev(px, py, face.tx, face.tz);
      const inFlood = tileInLightFlood(face.tx, face.tz, torches, beams);
      // Keep each torch/beam pool even when the party is far down the hall.
      if (dist > CULL_CHEB && !inFlood) continue;
      if (dist <= VOXEL_CHEB) {
        const list = voxelByFile.get(face.file) ?? [];
        list.push(face);
        voxelByFile.set(face.file, list);
        voxelFaces += 1;
      } else {
        // Bake: flood stays as subdivided MeshBasic. Max: unbaked
        // MeshPhysical flats so the real lights reach every distance.
        const segs = !realLights && inFlood ? FAR_BAKE_SEGS : 1;
        flats.push({ ...face, segs });
      }
    }

    const voxel = new THREE.Group();
    voxel.name = `voxels:${px},${py}`;
    voxel.visible = false;
    const flat = new THREE.Group();
    flat.name = `flats:${px},${py}`;
    flat.visible = false;

    let liveTris = 0;
    for (const [file, faces] of voxelByFile) {
      const mat = mats.get(file);
      const geo = geometryWithBake(
        faces.map((f) => ({ mesh: f.mesh, tx: f.tx, tz: f.tz })),
        torches,
        beams
      );
      if (!mat || !geo) continue;
      liveTris += (geo.getIndex()?.count ?? 0) / 3;
      const mesh = new THREE.Mesh(geo, mat);
      const isFloor = file.startsWith('floor_');
      mesh.userData.castWhenOn = !isFloor;
      mesh.castShadow = !isFloor;
      mesh.receiveShadow = true;
      mesh.name = `voxel:${file}`;
      voxel.add(mesh);
    }

    const flatsByFile = new Map<string, Array<PreparedFace & { segs: number }>>();
    for (const face of flats) {
      const list = flatsByFile.get(face.file) ?? [];
      list.push(face);
      flatsByFile.set(face.file, list);
    }
    for (const [file, list] of flatsByFile) {
      const mat = farMats.get(file);
      const geo = flatGeometryWithBake(
        list.map((f) => ({ pose: f.pose, tx: f.tx, tz: f.tz, segs: f.segs })),
        torches,
        CELL,
        beams
      );
      if (!mat || !geo) continue;
      liveTris += (geo.getIndex()?.count ?? 0) / 3;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.castWhenOn = false;
      mesh.castShadow = false;
      if (realLights) {
        mesh.receiveShadow = true;
      } else {
        mesh.userData.receiveWhenOn = false;
        mesh.receiveShadow = false;
      }
      mesh.frustumCulled = false;
      mesh.name = `flat:${file}`;
      flat.add(mesh);
    }

    voxelGroup.add(voxel);
    flatGroup.add(flat);
    lastBuildMs = performance.now() - t0;
    return {
      key: cellKey(px, py),
      x: px,
      y: py,
      voxel,
      flat,
      voxelFaces,
      flatFaces: flats.length,
      triangles: liveTris,
      warmed: false,
      used: ++useTick
    };
  };

  const evict = (): void => {
    while (cells.size > MAX_CELLS) {
      let oldest: CellCache | null = null;
      for (const c of cells.values()) {
        if (c.key === activeKey) continue;
        if (!oldest || c.used < oldest.used) oldest = c;
      }
      if (!oldest) break;
      cells.delete(oldest.key);
      voxelGroup.remove(oldest.voxel);
      flatGroup.remove(oldest.flat);
      disposeGroup(oldest.voxel);
      disposeGroup(oldest.flat);
    }
  };

  const prefetch = (x: number, y: number): boolean => {
    const key = cellKey(x, y);
    const hit = cells.get(key);
    if (hit) {
      hit.used = ++useTick;
      lastBuildMs = 0;
      return false;
    }
    const cell = buildCell(x, y);
    cells.set(key, cell);
    pendingWarm = cell;
    evict();
    return true;
  };

  const applyStats = (c: CellCache): void => {
    stats.voxelFaces = c.voxelFaces;
    stats.flatFaces = c.flatFaces;
    stats.triangles = c.triangles;
    stats.draws = c.voxel.children.length + c.flat.children.length;
  };

  const activate = (x: number, y: number): void => {
    const key = cellKey(x, y);
    const cell = cells.get(key);
    if (!cell) return;
    cell.used = ++useTick;
    if (key === activeKey) {
      applyStats(cell);
      return;
    }
    for (const c of cells.values()) {
      const on = c.key === key;
      c.voxel.visible = on;
      c.flat.visible = on;
    }
    activeKey = key;
    lastX = x;
    lastY = y;
    applyStats(cell);
    for (const [dx, dy] of STEP) {
      const nx = x + dx;
      const ny = y + dy;
      if (!canStep(map, nx, ny)) continue;
      const nk = cellKey(nx, ny);
      if (!cells.has(nk) && !pumpQueue.includes(nk)) pumpQueue.push(nk);
    }
  };

  prefetch(partyX, partyY);
  activate(partyX, partyY);
  const boot = cells.get(cellKey(partyX, partyY));
  if (boot) boot.warmed = true;

  return {
    group,
    stats,
    get cacheSize() {
      return cells.size;
    },
    get lastBuildMs() {
      return lastBuildMs;
    },
    setParty: (x, y) => {
      if (x === lastX && y === lastY && cells.has(cellKey(x, y))) return false;
      const created = prefetch(x, y);
      activate(x, y);
      return created;
    },
    prefetch,
    activate,
    warm: (draw) => {
      const cell = pendingWarm;
      if (!cell || cell.warmed) return;
      const show = cell.key === activeKey;
      cell.voxel.visible = true;
      cell.flat.visible = true;
      draw();
      if (!show) {
        cell.voxel.visible = false;
        cell.flat.visible = false;
      }
      cell.warmed = true;
      pendingWarm = null;
    },
    pump: () => {
      while (pumpQueue.length) {
        const key = pumpQueue.shift()!;
        const [sx, sy] = key.split(',').map(Number);
        if (cells.has(key)) continue;
        return prefetch(sx, sy);
      }
      return false;
    },
    setBakeBlends: (blends, flick = 1) => {
      if (realLights) {
        applyBakeBlends([...mats.values(), ...farMats.values()], torches, blends, flick, beams, 'off');
        return;
      }
      applyBakeBlends([...mats.values()], torches, blends, flick, beams, 'complement');
      applyBakeBlends([...farMats.values()], torches, blends, flick, beams, 'full');
    }
  };
}
