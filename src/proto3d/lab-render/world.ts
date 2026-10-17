import * as THREE from 'three';
import { LAYER_SIZE } from '../../voxel-lab/constants';
import { greedyMesh, mergeMeshes, type MeshArrays } from '../../voxel-lab/mesher';
import { loadTextureCached } from '../asset-cache';
import { CELL_SIZE, CUTOUT_ALPHA_TEST, tileBedY, WALL_BOTTOM, WALL_TOP } from '../constants';
import {
  listedHeightMapFiles,
  listedTex3dFiles,
  pickVariantIndex,
  VARIANT_SURFACES,
  variantFilenames,
  type VariantSurface
} from '../texture-variants';
import type { FloorData, Tile } from '../types';
import { VOXEL_ENTER_CHEB, VOXEL_LEAVE_CHEB, chebyshev, voxelLodWants } from '../voxel-opt-in';
import { flatPlanePose, flatPlaneSize, makeDoorToWorld, makeGameToWorld } from './faces';
import {
  albedoFilenameFromHeight,
  downsampleImageData,
  heightMapFilename,
  makeReliefFactory,
  type ReliefSourceFactory
} from './height-source';
import { dungeonPhysicalMaterial, paintedStandardMaterial, pbrMapFromRoughness } from './materials';
import { enumerateLabFaces, type LabMapFace, type LabSurfaceKind } from './occupancy';

type PngPixels = { data: ImageData; texture: THREE.Texture; file: string };

function texUrl(file: string): string {
  const base = import.meta.env.BASE_URL;
  if (file.startsWith('proto3d/')) return `${base}${file}`;
  return `${base}proto3d/tex3d/${file}`;
}

async function loadPng(file: string): Promise<PngPixels | null> {
  try {
    const url = texUrl(file);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const texture = new THREE.Texture(img);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return { data, texture, file };
  } catch {
    return null;
  }
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

function surfaceFor(face: LabMapFace): VariantSurface | 'secret_closed' | 'secret_open' | 'rubble' | 'water' {
  if (face.kind === 'secret') return 'secret_closed';
  if (face.kind === 'secret-open') return 'secret_open';
  if (face.kind === 'rubble') return 'rubble';
  if (face.kind === 'water-shallow' || face.kind === 'water-deep') return 'water';
  if (face.face === 'floor') return 'floor_stone';
  if (face.face === 'ceiling') return 'ceiling';
  return 'wall_plain';
}

export class LabWorld {
  group = new THREE.Group();
  voxelGroup = new THREE.Group();
  flatGroup = new THREE.Group();
  triangles = 0;
  faceCount = 0;
  voxelFaces = 0;
  private pngs = new Map<string, PngPixels>();
  private pbr = new Map<string, THREE.Texture>();
  private relief!: ReliefSourceFactory;
  private rubbleTex: THREE.Texture | null = null;
  private secretClosed: THREE.Texture | null = null;
  private secretOpen: THREE.Texture | null = null;
  private waterShallow: THREE.Texture[] = [];
  private waterDeep: THREE.Texture[] = [];
  private variants = new Map<VariantSurface, THREE.Texture[]>();
  private variantFiles = new Map<VariantSurface, string[]>();
  private floor: FloorData | null = null;
  private rubble = new Set<string>();
  private partyX = 0;
  private partyY = 0;
  private voxelKeys = new Set<string>();
  private lastFaces: LabMapFace[] = [];
  private voxelGeom = new Map<string, MeshArrays>();
  private voxelFile = new Map<string, string>();
  private heightFiles = new Set<string>();
  private doorVoxelGeo = new Map<string, THREE.BufferGeometry>();
  reliefEnabled = true;

  constructor() {
    this.group.name = 'lab-world';
    this.voxelGroup.name = 'lab-voxels';
    this.flatGroup.name = 'lab-flat';
    this.group.add(this.voxelGroup, this.flatGroup);
  }

  async load(): Promise<void> {
    const files = listedTex3dFiles();
    const jobs: string[] = [];
    for (const surface of VARIANT_SURFACES) {
      const names = variantFilenames(surface, files);
      this.variantFiles.set(surface, names);
      for (const n of names) jobs.push(n);
    }
    for (const extra of ['secret_closed.png', 'secret_open.png', 'door_open.png', 'door_panel.png']) {
      jobs.push(extra);
    }
    const heightByAlbedo = new Map<string, ImageData>();
    await Promise.all(
      [...new Set(jobs)].map(async (file) => {
        const png = await loadPng(file);
        if (png) this.pngs.set(file, png);
      })
    );
    const heightJobs = new Set([
      ...listedHeightMapFiles(),
      ...[...this.pngs.keys()].map((file) => heightMapFilename(file))
    ]);
    await Promise.all(
      [...heightJobs].map(async (heightName) => {
        const h = await loadPng(heightName);
        if (!h) return;
        const albedo = albedoFilenameFromHeight(heightName);
        heightByAlbedo.set(albedo, h.data);
        this.heightFiles.add(albedo);
      })
    );
    this.relief = makeReliefFactory(heightByAlbedo);
    this.secretClosed = this.pngs.get('secret_closed.png')?.texture ?? null;
    this.secretOpen = this.pngs.get('secret_open.png')?.texture ?? null;
    for (const surface of VARIANT_SURFACES) {
      const names = this.variantFiles.get(surface) ?? [];
      this.variants.set(
        surface,
        names.map((n) => this.pngs.get(n)?.texture).filter((t): t is THREE.Texture => !!t)
      );
    }
    const shallowNames = ['water/floor_submerged.png', 'water/floor_submerged_2.png', 'water/floor_submerged_3.png'];
    const deepNames = [
      'water/floor_submerged_deep.png',
      'water/floor_submerged_deep_2.png',
      'water/floor_submerged_deep_3.png'
    ];
    this.waterShallow = [];
    this.waterDeep = [];
    for (const n of shallowNames) {
      const png = await loadPng(n);
      if (png) this.waterShallow.push(png.texture);
    }
    for (const n of deepNames) {
      const png = await loadPng(n);
      if (png) this.waterDeep.push(png.texture);
    }
    try {
      this.rubbleTex = await loadTextureCached(`${import.meta.env.BASE_URL}art/dungeon_v2/rubble_front_near.png`);
      this.rubbleTex.colorSpace = THREE.SRGBColorSpace;
      this.rubbleTex.magFilter = THREE.NearestFilter;
      this.rubbleTex.minFilter = THREE.NearestFilter;
      this.rubbleTex.generateMipmaps = false;
    } catch {
      this.rubbleTex = this.pickTex('wall_plain', 0, 0, 'N');
    }
    for (const [file, png] of this.pngs) {
      const src = this.relief(file, png.data);
      const vol = src.volume(downsampleImageData(png.data));
      this.pbr.set(file, pbrMapFromRoughness(vol.roughness, vol.dims[0], vol.dims[1]));
    }
  }

  setRubble(x: number, y: number, on: boolean): void {
    const key = `${x},${y}`;
    if (on) this.rubble.add(key);
    else this.rubble.delete(key);
  }

  clearRubble(): void {
    this.rubble.clear();
  }

  build(floor: FloorData, partyX: number, partyY: number): void {
    this.floor = floor;
    this.partyX = partyX;
    this.partyY = partyY;
    this.voxelGeom.clear();
    this.voxelFile.clear();
    this.voxelKeys.clear();
    this.remesh();
  }

  /** Full rebuild after secrets / doors / stairs / rubble. Every wall face is re-emitted. */
  rebuild(floor = this.floor): void {
    if (!floor) return;
    this.build(floor, this.partyX, this.partyY);
  }

  hasHeightMap(albedoFile: string): boolean {
    return this.heightFiles.has(albedoFile);
  }

  setReliefEnabled(on: boolean): void {
    if (this.reliefEnabled === on) return;
    this.reliefEnabled = on;
    this.voxelGeom.clear();
    this.voxelFile.clear();
    this.voxelKeys.clear();
    this.remesh();
  }

  setParty(x: number, y: number): void {
    this.partyX = x;
    this.partyY = y;
    if (!this.floor) return;
    const faces = enumerateLabFaces(this.floor, { rubble: this.rubble });
    let changed = false;
    const next = new Set<string>();
    for (const face of faces) {
      const dist = chebyshev(x, y, face.cellX, face.cellY);
      const was = this.voxelKeys.has(face.key);
      const want = this.wantsVoxel(face, dist, was);
      if (want) next.add(face.key);
      if (want !== was) changed = true;
    }
    if (changed) {
      this.voxelKeys = next;
      this.remesh(faces);
    }
  }

  listFaceKeys(): string[] {
    return this.lastFaces.map((f) => f.key).sort();
  }

  facesOfKind(kind: LabSurfaceKind): LabMapFace[] {
    return this.lastFaces.filter((f) => f.kind === kind);
  }

  private remesh(faces?: LabMapFace[]): void {
    this.clearMeshes();
    if (!this.floor) return;
    const list = faces ?? enumerateLabFaces(this.floor, { rubble: this.rubble });
    this.lastFaces = list;
    this.faceCount = list.length;
    if (this.voxelKeys.size === 0) {
      for (const face of list) {
        const dist = chebyshev(this.partyX, this.partyY, face.cellX, face.cellY);
        if (this.wantsVoxel(face, dist, false)) this.voxelKeys.add(face.key);
      }
    }
    const voxelByFile = new Map<string, MeshArrays[]>();
    const flatByMat = new Map<string, THREE.Mesh[]>();
    this.voxelFaces = 0;
    let tris = 0;

    for (const face of list) {
      const voxel = this.voxelKeys.has(face.key) && face.voxelOk;
      if (voxel) {
        const built = this.ensureVoxel(face);
        if (built) {
          this.voxelFaces += 1;
          const listFor = voxelByFile.get(built.file) ?? [];
          listFor.push(built.mesh);
          voxelByFile.set(built.file, listFor);
        }
      } else {
        const mesh = this.makeFlat(face);
        if (!mesh) continue;
        const matKey = `${face.kind}:${(mesh.material as THREE.MeshStandardMaterial).uuid}`;
        const bucket = flatByMat.get(matKey) ?? [];
        bucket.push(mesh);
        flatByMat.set(matKey, bucket);
      }
    }

    for (const [file, meshes] of voxelByFile) {
      const png = this.pngs.get(file);
      const pbr = this.pbr.get(file);
      const geo = geometryFrom(mergeMeshes(meshes));
      if (!png || !geo) continue;
      const isFloor = file.startsWith('floor_');
      const mesh = new THREE.Mesh(geo, dungeonPhysicalMaterial(png.texture, pbr ?? null));
      mesh.name = `lab-voxel:${file}`;
      mesh.userData.labMesh = true;
      mesh.userData.skipVertexLighting = true;
      mesh.userData.kind = isFloor ? 'floor' : 'wall';
      mesh.userData.castWhenOn = !isFloor;
      mesh.castShadow = !isFloor;
      mesh.receiveShadow = true;
      const idx = geo.getIndex();
      tris += idx ? idx.count / 3 : 0;
      this.voxelGroup.add(mesh);
    }

    for (const meshes of flatByMat.values()) {
      for (const mesh of meshes) {
        const geo = mesh.geometry;
        const idx = geo.getIndex();
        tris += idx ? idx.count / 3 : geo.attributes.position.count / 3;
        this.flatGroup.add(mesh);
      }
    }
    this.triangles = tris;
  }

  private wantsVoxel(face: LabMapFace, dist: number, was: boolean): boolean {
    if (!this.reliefEnabled || !face.voxelOk) return false;
    if (!this.heightFiles.has(this.fileFor(face))) return false;
    return voxelLodWants(dist, was, VOXEL_ENTER_CHEB, VOXEL_LEAVE_CHEB);
  }

  private ensureVoxel(face: LabMapFace): { file: string; mesh: MeshArrays } | null {
    const cached = this.voxelGeom.get(face.key);
    const fileCached = this.voxelFile.get(face.key);
    if (cached && fileCached) return { file: fileCached, mesh: cached };
    const file = this.fileFor(face);
    const png = this.pngs.get(file);
    if (!png) return null;
    const src = this.relief(file, png.data);
    if (src.kind !== 'height-map') return null;
    const vol = src.volume(downsampleImageData(png.data));
    const toWorld = makeGameToWorld(face.face, face.cellX, face.cellY, vol.dims, LAYER_SIZE);
    const meshed = greedyMesh(vol.volume, vol.dims, toWorld);
    this.voxelGeom.set(face.key, meshed.mesh);
    this.voxelFile.set(face.key, file);
    return { file, mesh: meshed.mesh };
  }

  /**
   * Swap DoorSystem painted planes for height-mapped voxel meshes (frame =
   * door_open, sliding panel = door_panel). Restores the painted planes when
   * relief is off so Classic/lab-flat stay identical.
   */
  applyDoorRelief(root: THREE.Object3D, on: boolean): void {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const kind = mesh.userData.kind;
      if (kind !== 'door-frame' && kind !== 'door-panel') return;
      const file = kind === 'door-frame' ? 'door_open.png' : 'door_panel.png';
      const want = on && this.reliefEnabled && this.heightFiles.has(file);
      if (want) this.voxelizeDoorMesh(mesh, file);
      else this.restoreDoorMesh(mesh);
    });
  }

  private voxelizeDoorMesh(mesh: THREE.Mesh, file: string): void {
    if (!mesh.userData.labPaintedGeo) {
      mesh.userData.labPaintedGeo = mesh.geometry;
      mesh.userData.labPaintedMat = mesh.material;
    }
    const geo = this.doorVoxelGeometry(file);
    const png = this.pngs.get(file);
    if (!geo || !png) return;
    if (mesh.userData.labReliefGeo && mesh.userData.labReliefGeo !== geo) {
      (mesh.userData.labReliefGeo as THREE.BufferGeometry).dispose();
    }
    const mat = dungeonPhysicalMaterial(png.texture, this.pbr.get(file) ?? null, { cutout: true });
    if (mesh.userData.labReliefMat) (mesh.userData.labReliefMat as THREE.Material).dispose();
    mesh.geometry = geo.clone();
    mesh.material = mat;
    mesh.userData.labReliefGeo = mesh.geometry;
    mesh.userData.labReliefMat = mat;
    mesh.userData.skipVertexLighting = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  private restoreDoorMesh(mesh: THREE.Mesh): void {
    if (!mesh.userData.labPaintedGeo) return;
    if (mesh.userData.labReliefGeo) {
      (mesh.userData.labReliefGeo as THREE.BufferGeometry).dispose();
      mesh.userData.labReliefGeo = null;
    }
    if (mesh.userData.labReliefMat) {
      (mesh.userData.labReliefMat as THREE.Material).dispose();
      mesh.userData.labReliefMat = null;
    }
    mesh.geometry = mesh.userData.labPaintedGeo;
    mesh.material = mesh.userData.labPaintedMat;
    mesh.userData.skipVertexLighting = false;
  }

  private doorVoxelGeometry(file: string): THREE.BufferGeometry | null {
    const cached = this.doorVoxelGeo.get(file);
    if (cached) return cached;
    const png = this.pngs.get(file);
    if (!png) return null;
    const src = this.relief(file, png.data);
    if (src.kind !== 'height-map') return null;
    const vol = src.volume(downsampleImageData(png.data));
    const toWorld = makeDoorToWorld(vol.dims, LAYER_SIZE);
    const meshed = greedyMesh(vol.volume, vol.dims, toWorld);
    const geo = geometryFrom(meshed.mesh);
    if (!geo) return null;
    this.doorVoxelGeo.set(file, geo);
    return geo;
  }

  private makeFlat(face: LabMapFace): THREE.Mesh | null {
    const tex = this.textureFor(face);
    if (!tex) return null;
    const cutout = face.kind === 'secret-open';
    const painted = face.kind === 'secret-open' || face.kind === 'rubble' || face.kind.startsWith('water');
    const file = this.fileFor(face);
    const pbr = !painted ? this.pbr.get(file) ?? null : null;
    const { w, h } = flatPlaneSize(face.face);
    const geo = new THREE.PlaneGeometry(w, h);
    if (face.face !== 'floor' && face.face !== 'ceiling') {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const v = uv.getY(i);
        const worldY = WALL_BOTTOM + v * (WALL_TOP - WALL_BOTTOM);
        uv.setY(i, worldY / CELL_SIZE);
      }
      uv.needsUpdate = true;
    }
    const mat = painted
      ? paintedStandardMaterial(tex, { cutout })
      : dungeonPhysicalMaterial(tex, pbr, { cutout });
    const mesh = new THREE.Mesh(geo, mat);
    const pose = flatPlanePose(face.face, face.cellX, face.cellY);
    let y = pose.y;
    if (face.face === 'floor' && this.floor) {
      const tile = this.floor.tiles[face.cellY]?.[face.cellX];
      if (tile) y = tileBedY(tile);
    }
    mesh.position.set(pose.x, y, pose.z);
    mesh.rotation.set(pose.rotX, pose.rotY, 0);
    mesh.name = `lab-flat:${face.key}`;
    mesh.userData.labMesh = true;
    mesh.userData.skipVertexLighting = true;
    mesh.userData.kind = userKind(face.kind);
    mesh.userData.lightX = face.lightX;
    mesh.userData.lightY = face.lightY;
    mesh.userData.cellX = face.cellX;
    mesh.userData.cellY = face.cellY;
    mesh.userData.face = face.face;
    mesh.userData.labKey = face.key;
    mesh.userData.castWhenOn = face.face !== 'floor';
    mesh.castShadow = face.face !== 'floor';
    mesh.receiveShadow = true;
    if (cutout) {
      mat.transparent = true;
      mat.alphaTest = CUTOUT_ALPHA_TEST;
    }
    return mesh;
  }

  private fileFor(face: LabMapFace): string {
    const surface = surfaceFor(face);
    if (surface === 'secret_closed') return 'secret_closed.png';
    if (surface === 'secret_open') return 'secret_open.png';
    if (surface === 'rubble') return 'wall_plain.png';
    if (surface === 'water') return 'floor_stone.png';
    const names = this.variantFiles.get(surface) ?? [`${surface}.png`];
    if (names.length === 0) return `${surface}.png`;
    return names[pickVariantIndex(names.length, face.cellX, face.cellY, face.face)];
  }

  private textureFor(face: LabMapFace): THREE.Texture | null {
    if (face.kind === 'secret') return this.secretClosed;
    if (face.kind === 'secret-open') return this.secretOpen;
    if (face.kind === 'rubble') return this.rubbleTex;
    if (face.kind === 'water-shallow' || face.kind === 'water-deep') {
      const list = face.kind === 'water-deep' ? this.waterDeep : this.waterShallow;
      if (!list.length) return this.pickTex('floor_stone', face.cellX, face.cellY, 'F');
      return list[pickVariantIndex(list.length, face.cellX, face.cellY, 'F')];
    }
    const surface = surfaceFor(face);
    if (surface === 'floor_stone' || surface === 'ceiling' || surface === 'wall_plain') {
      return this.pickTex(surface, face.cellX, face.cellY, face.face);
    }
    return this.pngs.get(this.fileFor(face))?.texture ?? null;
  }

  private pickTex(surface: VariantSurface, x: number, y: number, face: string): THREE.Texture | null {
    const list = this.variants.get(surface);
    if (!list || list.length === 0) return this.pngs.get(`${surface}.png`)?.texture ?? null;
    return list[pickVariantIndex(list.length, x, y, face)];
  }

  private clearMeshes(): void {
    const drop = (group: THREE.Group) => {
      while (group.children.length) {
        const child = group.children[0] as THREE.Mesh;
        group.remove(child);
        child.geometry?.dispose();
      }
    };
    drop(this.voxelGroup);
    drop(this.flatGroup);
  }
}

function userKind(kind: LabSurfaceKind): string {
  if (kind === 'secret' || kind === 'secret-open') return 'secret';
  if (kind === 'water-shallow' || kind === 'water-deep') return kind;
  return kind;
}

export function stairsOnFloor(floor: FloorData): Array<{ x: number; y: number; dir: Tile['stairs'] }> {
  const out: Array<{ x: number; y: number; dir: Tile['stairs'] }> = [];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const tile = floor.tiles[y][x];
      if (tile.stairs) out.push({ x, y, dir: tile.stairs });
    }
  }
  return out;
}
