import * as THREE from 'three';
import type { VertexLightingManager } from './vertex-lighting';
import { disposeVoxelGeomCache, emptyRaycast, getVoxelGeometry, type VoxelKind } from './voxel-geom';
import { surfaceChebyshev, voxelLodWants } from './voxel-opt-in';
import type { SpriteManager } from './sprites';

interface SurfaceEntry {
  mesh: THREE.Mesh;
  key: string;
  kind: VoxelKind;
  tileX: number;
  tileY: number;
  cellX: number;
  cellY: number;
  voxel: THREE.Mesh | null;
}

function asBasic(mat: THREE.Material | THREE.Material[]): THREE.MeshBasicMaterial | null {
  const m = Array.isArray(mat) ? mat[0] : mat;
  if (!m || !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial) return null;
  return m as THREE.MeshBasicMaterial;
}

function voxelKindOf(kind: unknown): VoxelKind | null {
  if (kind === 'wall' || kind === 'secret') return 'wall';
  return null;
}

function canVoxelize(mesh: THREE.Mesh): boolean {
  if (mesh.userData.voxelMesh || mesh.userData.rubble) return false;
  if (mesh.userData.skipVertexLighting) return false;
  const raw = mesh.userData.kind;
  if (typeof raw === 'string' && raw.startsWith('door')) return false;
  if (!voxelKindOf(raw)) return false;
  const mat = asBasic(mesh.material);
  if (!mat?.map) return false;
  if (mat.alphaTest > 0) return false;
  return true;
}

export class VoxelMode {
  enabled = false;
  private scene: THREE.Scene;
  private lighting: VertexLightingManager;
  private sprites: SpriteManager;
  private renderer: THREE.WebGLRenderer;
  private group = new THREE.Group();
  private entries: SurfaceEntry[] = [];
  private active = new Set<string>();
  private partyX = 0;
  private partyY = 0;
  triangles = 0;
  voxelMeshes = 0;

  private decorateVoxel?: (mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial) => void;
  private ownsSpriteTint: () => boolean;

  constructor(opts: {
    scene: THREE.Scene;
    lighting: VertexLightingManager;
    sprites: SpriteManager;
    renderer: THREE.WebGLRenderer;
    decorateVoxel?: (mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial) => void;
    ownsSpriteTint?: () => boolean;
  }) {
    this.scene = opts.scene;
    this.lighting = opts.lighting;
    this.sprites = opts.sprites;
    this.renderer = opts.renderer;
    this.decorateVoxel = opts.decorateVoxel;
    this.ownsSpriteTint = opts.ownsSpriteTint ?? (() => true);
    this.group.name = 'voxel-mode';
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.renderer.shadowMap.enabled = false;
    this.scene.add(this.group);
    this.collect();
    this.stream();
    if (this.ownsSpriteTint()) this.tintSprites(true);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    if (this.ownsSpriteTint()) this.tintSprites(false);
    this.clearVoxels();
    this.entries = [];
    this.active.clear();
    this.scene.remove(this.group);
    this.voxelMeshes = 0;
    this.triangles = 0;
  }

  /** Re-collect after the scene graph changes (rubble, rebuilt walls). */
  refresh(): void {
    if (!this.enabled) return;
    this.clearVoxels();
    this.entries = [];
    this.active.clear();
    this.collect();
    this.stream();
    if (this.ownsSpriteTint()) this.tintSprites(true);
  }

  setParty(x: number, y: number): void {
    this.partyX = x;
    this.partyY = y;
    if (this.enabled) this.stream();
  }

  syncLights(): void {
    if (!this.enabled) return;
    if (!this.ownsSpriteTint()) return;
    this.tintSprites(true);
  }

  invalidateCell(cellX: number, cellY: number): void {
    for (const entry of this.entries) {
      if (entry.cellX !== cellX || entry.cellY !== cellY) continue;
      this.active.delete(entry.key);
      this.dropVoxel(entry);
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
      if (!canVoxelize(mesh)) return;
      const kind = voxelKindOf(mesh.userData.kind);
      if (!kind) return;
      const tileX = typeof mesh.userData.lightX === 'number' ? mesh.userData.lightX : 0;
      const tileY = typeof mesh.userData.lightY === 'number' ? mesh.userData.lightY : 0;
      const cellX = typeof mesh.userData.cellX === 'number' ? mesh.userData.cellX : tileX;
      const cellY = typeof mesh.userData.cellY === 'number' ? mesh.userData.cellY : tileY;
      this.entries.push({
        mesh,
        key: mesh.uuid,
        kind,
        tileX,
        tileY,
        cellX,
        cellY,
        voxel: null
      });
    });
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
      const want = canVoxelize(entry.mesh) && voxelLodWants(dist, was);
      if (want) {
        this.active.add(entry.key);
        this.ensureVoxel(entry);
        const origMat = asBasic(entry.mesh.material);
        if (entry.voxel) {
          if (origMat) origMat.visible = false;
          entry.voxel.visible = true;
          this.voxelMeshes += 1;
          const geo = entry.voxel.geometry;
          const idx = geo.getIndex();
          this.triangles += idx ? idx.count / 3 : 0;
        } else if (origMat) {
          origMat.visible = true;
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
    const cached = getVoxelGeometry(srcMat.map, entry.kind, {
      turns: 0,
      flip: false,
      face: entry.mesh.userData.face
    });
    if (!cached) return;
    const mat = srcMat.clone();
    mat.userData = { ...srcMat.userData };
    mat.visible = true;
    mat.vertexColors = !srcMat.userData.voxelLookPatched;
    mat.needsUpdate = true;
    const geo = cached.geometry.clone();
    const voxel = new THREE.Mesh(geo, mat);
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
    if (this.decorateVoxel) this.decorateVoxel(voxel, mat);
    else this.lighting.registerVoxelMesh(voxel);
    entry.voxel = voxel;
  }

  private dropVoxel(entry: SurfaceEntry): void {
    if (!entry.voxel) return;
    this.lighting.unregisterVoxelMesh(entry.voxel);
    this.group.remove(entry.voxel);
    entry.voxel.geometry.dispose();
    const vm = asBasic(entry.voxel.material);
    vm?.dispose();
    entry.voxel = null;
  }

  private clearVoxels(): void {
    for (const entry of this.entries) {
      const mat = asBasic(entry.mesh.material);
      if (mat) mat.visible = true;
      this.dropVoxel(entry);
    }
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
