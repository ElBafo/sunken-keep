import * as THREE from 'three';
import { isSurfaceLitKind, VOXEL_SUNBEAM_INTENSITY, type SurfaceLightLocal } from './surface-light';
import { floorFlipX, floorQuarterTurns } from './texture-variants';
import { FloorData } from './types';
import type { VertexLightingManager } from './vertex-lighting';
import {
  disposeVoxelGeomCache,
  emptyRaycast,
  getPbrForTexture,
  getVoxelGeometry,
  type VoxelKind
} from './voxel-geom';
import { surfaceChebyshev, voxelLodWants } from './voxel-opt-in';
import { makeVoxelLocal, makeVoxelShared, patchVoxelLookMaterial, unpatchVoxelLookMaterial } from './voxel-surface';
import type { SpriteManager } from './sprites';

interface SurfaceEntry {
  mesh: THREE.Mesh;
  key: string;
  kind: VoxelKind;
  tileX: number;
  tileY: number;
  cellX: number;
  cellY: number;
  isWall: boolean;
  isDark: boolean;
  lightGround: boolean;
  local: SurfaceLightLocal;
  voxel: THREE.Mesh | null;
}

function asBasic(mat: THREE.Material | THREE.Material[]): THREE.MeshBasicMaterial | null {
  const m = Array.isArray(mat) ? mat[0] : mat;
  if (!m || !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial) return null;
  return m as THREE.MeshBasicMaterial;
}

function voxelKindOf(kind: unknown): VoxelKind | null {
  if (kind === 'floor' || kind === 'water-deep' || kind === 'water-shallow' || kind === 'water-surface') {
    return 'floor';
  }
  if (kind === 'ceiling') return 'ceiling';
  if (kind === 'wall' || kind === 'secret') return 'wall';
  if (typeof kind === 'string' && kind.startsWith('door')) return 'wall';
  return null;
}

function canVoxelize(mesh: THREE.Mesh, floorData: FloorData): boolean {
  if (mesh.userData.voxelMesh || mesh.userData.rubble) return false;
  if (mesh.userData.skipVertexLighting) return false;
  const raw = mesh.userData.kind;
  if (typeof raw === 'string' && raw.startsWith('door')) return false;
  const kind = voxelKindOf(raw);
  if (!kind) return false;
  const mat = asBasic(mesh.material);
  if (!mat?.map) return false;
  if (mat.alphaTest > 0) return false;
  if (kind === 'floor') {
    const x = mesh.userData.lightX;
    const y = mesh.userData.lightY;
    const tile = floorData.tiles[y]?.[x];
    if (tile?.deepWater || tile?.shallowWater) return false;
  }
  return true;
}

export class VoxelMode {
  enabled = false;
  private scene: THREE.Scene;
  private lighting: VertexLightingManager;
  private sprites: SpriteManager;
  private floorData: FloorData;
  private renderer: THREE.WebGLRenderer;
  private shared = makeVoxelShared();
  private group = new THREE.Group();
  private entries: SurfaceEntry[] = [];
  private active = new Set<string>();
  private partyX = 0;
  private partyY = 0;
  private paletteWas = true;
  private setPalette: (on: boolean) => void;
  private getPalette: () => boolean;
  triangles = 0;
  voxelMeshes = 0;

  constructor(opts: {
    scene: THREE.Scene;
    lighting: VertexLightingManager;
    sprites: SpriteManager;
    floorData: FloorData;
    renderer: THREE.WebGLRenderer;
    getPalette: () => boolean;
    setPalette: (on: boolean) => void;
  }) {
    this.scene = opts.scene;
    this.lighting = opts.lighting;
    this.sprites = opts.sprites;
    this.floorData = opts.floorData;
    this.renderer = opts.renderer;
    this.getPalette = opts.getPalette;
    this.setPalette = opts.setPalette;
    this.group.name = 'voxel-mode';
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.renderer.shadowMap.enabled = false;
    this.paletteWas = this.getPalette();
    this.setPalette(false);
    this.scene.add(this.group);
    this.collect();
    for (const entry of this.entries) this.patchEntry(entry);
    this.stream();
    this.syncLights();
    this.tintSprites(true);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.tintSprites(false);
    for (const entry of this.entries) {
      const mat = asBasic(entry.mesh.material);
      if (mat) {
        mat.visible = true;
        unpatchVoxelLookMaterial(mat);
      }
      if (entry.voxel) {
        this.group.remove(entry.voxel);
        const vm = asBasic(entry.voxel.material);
        vm?.dispose();
        entry.voxel = null;
      }
    }
    this.entries = [];
    this.active.clear();
    this.scene.remove(this.group);
    this.setPalette(this.paletteWas);
    this.voxelMeshes = 0;
    this.triangles = 0;
  }

  setParty(x: number, y: number): void {
    this.partyX = x;
    this.partyY = y;
    if (this.enabled) this.stream();
  }

  syncLights(): void {
    if (!this.enabled) return;
    this.lighting.fillSurfaceShared(this.shared);
    this.shared.uSunbeam3D.value = 1;
    this.shared.uSunbeamIntensity.value = VOXEL_SUNBEAM_INTENSITY;
    for (const entry of this.entries) {
      this.lighting.fillSurfaceLocal(
        entry.local,
        entry.tileX,
        entry.tileY,
        entry.isWall,
        entry.isDark,
        entry.lightGround
      );
    }
    this.tintSprites(true);
  }

  invalidateCell(cellX: number, cellY: number): void {
    for (const entry of this.entries) {
      if (entry.cellX !== cellX || entry.cellY !== cellY) continue;
      this.active.delete(entry.key);
      if (entry.voxel) {
        this.group.remove(entry.voxel);
        entry.voxel = null;
      }
      const mat = asBasic(entry.mesh.material);
      if (mat) mat.visible = true;
    }
    if (this.enabled) this.stream();
  }

  dispose(): void {
    this.disable();
    disposeVoxelGeomCache();
  }

  stats(): { enabled: boolean; voxels: number; triangles: number; active: number } {
    return {
      enabled: this.enabled,
      voxels: this.voxelMeshes,
      triangles: this.triangles,
      active: this.active.size
    };
  }

  private collect(): void {
    this.entries = [];
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!isSurfaceLitKind(mesh.userData.kind)) return;
      const kind = voxelKindOf(mesh.userData.kind);
      if (!kind) return;
      const tileX =
        typeof mesh.userData.lightX === 'number' ? mesh.userData.lightX : 0;
      const tileY =
        typeof mesh.userData.lightY === 'number' ? mesh.userData.lightY : 0;
      const cellX =
        typeof mesh.userData.cellX === 'number' ? mesh.userData.cellX : tileX;
      const cellY =
        typeof mesh.userData.cellY === 'number' ? mesh.userData.cellY : tileY;
      const tile = this.floorData.tiles[tileY]?.[tileX];
      const key = mesh.uuid;
      this.entries.push({
        mesh,
        key,
        kind,
        tileX,
        tileY,
        cellX,
        cellY,
        isWall:
          kind === 'wall' ||
          (typeof mesh.userData.kind === 'string' && mesh.userData.kind.startsWith('door')),
        isDark: !!tile?.floorNDark,
        lightGround: !!mesh.userData.lightGround || !!mesh.userData.rubble,
        local: makeVoxelLocal(),
        voxel: null
      });
    });
  }

  private patchEntry(entry: SurfaceEntry): void {
    const mat = asBasic(entry.mesh.material);
    if (!mat) return;
    const pbr = getPbrForTexture(mat.map);
    patchVoxelLookMaterial(mat, this.shared, entry.local, pbr);
  }

  private stream(): void {
    this.triangles = 0;
    this.voxelMeshes = 0;
    for (const entry of this.entries) {
      const dist = surfaceChebyshev(
        this.partyX,
        this.partyY,
        entry.cellX,
        entry.cellY,
        entry.tileX,
        entry.tileY
      );
      const was = this.active.has(entry.key);
      const want = canVoxelize(entry.mesh, this.floorData) && voxelLodWants(dist, was);
      if (want) {
        this.active.add(entry.key);
        this.ensureVoxel(entry);
        const origMat = asBasic(entry.mesh.material);
        if (origMat) origMat.visible = false;
        if (entry.voxel) {
          entry.voxel.visible = true;
          this.voxelMeshes += 1;
          const geo = entry.voxel.geometry;
          const idx = geo.getIndex();
          this.triangles += idx ? idx.count / 3 : 0;
        }
      } else {
        this.active.delete(entry.key);
        const origMat = asBasic(entry.mesh.material);
        if (origMat) origMat.visible = true;
        if (entry.voxel) entry.voxel.visible = false;
      }
    }
  }

  private ensureVoxel(entry: SurfaceEntry): void {
    if (entry.voxel) return;
    const srcMat = asBasic(entry.mesh.material);
    if (!srcMat?.map) return;
    const turns =
      entry.kind === 'wall' ? 0 : floorQuarterTurns(entry.tileX, entry.tileY, entry.kind === 'ceiling' ? 'C' : 'F');
    const flip = entry.kind !== 'wall' && floorFlipX(entry.tileX, entry.tileY, entry.kind === 'ceiling' ? 'C' : 'F');
    const cached = getVoxelGeometry(srcMat.map, entry.kind, {
      turns,
      flip,
      face: entry.mesh.userData.face
    });
    if (!cached) return;
    const mat = srcMat.clone();
    mat.userData = { ...srcMat.userData };
    delete mat.userData.voxelLookUniforms;
    mat.visible = true;
    patchVoxelLookMaterial(mat, this.shared, entry.local, cached.pbr);
    const voxel = new THREE.Mesh(cached.geometry, mat);
    voxel.position.copy(entry.mesh.position);
    voxel.quaternion.copy(entry.mesh.quaternion);
    voxel.scale.copy(entry.mesh.scale);
    voxel.raycast = emptyRaycast;
    voxel.userData = {
      ...entry.mesh.userData,
      voxelMesh: true,
      skipVertexLighting: true,
      noPick: true
    };
    this.group.add(voxel);
    entry.voxel = voxel;
  }

  private tintSprites(on: boolean): void {
    for (const sprite of this.sprites.sprites) {
      if (sprite.kind === 'sconce') continue;
      const mat = sprite.material as THREE.SpriteMaterial;
      if (!mat?.color) continue;
      if (!on) {
        mat.color.setRGB(1, 1, 1);
        continue;
      }
      const rgb = this.lighting.wallTintRgb(sprite.x, sprite.y);
      mat.color.setRGB(rgb[0], rgb[1], rgb[2]);
    }
  }
}
