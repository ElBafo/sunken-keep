import * as THREE from 'three';
import { LAB_AMBIENT_SCALE, LAB_LANTERN_RGB, LAB_TORCH_RGB } from './lab-light';
import type { PixelRenderer } from './renderer';
import type { SpriteManager } from './sprites';
import {
  isSurfaceLitKind,
  VOXEL_SUNBEAM_INTENSITY,
  type SurfaceLightLocal,
  type SurfaceLightShared
} from './surface-light';
import { neutralizeBakedVertexColors, type VertexLightingManager } from './vertex-lighting';
import { getPbrForTexture } from './voxel-geom';
import { makeVoxelLocal, makeVoxelShared, patchVoxelLookMaterial, unpatchVoxelLookMaterial } from './voxel-surface';

interface Patched {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  local: SurfaceLightLocal;
}

function asBasic(mat: THREE.Material | THREE.Material[]): THREE.MeshBasicMaterial | null {
  const m = Array.isArray(mat) ? mat[0] : mat;
  if (!m || !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial) return null;
  return m as THREE.MeshBasicMaterial;
}

export function canLabPatch(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh) return false;
  if (mesh.userData.isSprite) return false;
  if (mesh.userData.lanternProp) return false;
  if (mesh.userData.skipVertexLighting && !mesh.userData.voxelMesh) return false;
  return isSurfaceLitKind(mesh.userData.kind);
}

/**
 * Lab look on dungeon surfaces: per-pixel torch/lantern (lab hues), wet-stone
 * gloss, no palette. Gameplay sourceLight / tileBrightness stay on the vertex table.
 */
export class LabLook {
  enabled = false;
  private scene: THREE.Scene;
  private lighting: VertexLightingManager;
  private sprites: SpriteManager;
  private renderer: PixelRenderer;
  private shared: SurfaceLightShared = makeVoxelShared();
  private patched: Patched[] = [];
  private paletteWas = true;

  constructor(opts: {
    scene: THREE.Scene;
    lighting: VertexLightingManager;
    sprites: SpriteManager;
    renderer: PixelRenderer;
  }) {
    this.scene = opts.scene;
    this.lighting = opts.lighting;
    this.sprites = opts.sprites;
    this.renderer = opts.renderer;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.paletteWas = this.renderer.paletteEnabled;
    this.renderer.setPaletteEnabled(false);
    this.lighting.skipSurfaceBake = true;
    this.collect();
    this.sync();
    this.tintSprites(true);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.lighting.skipSurfaceBake = false;
    this.tintSprites(false);
    this.clear();
    this.renderer.setPaletteEnabled(this.paletteWas);
    this.lighting.updateAllMeshes();
  }

  refresh(): void {
    if (!this.enabled) return;
    this.clear();
    this.collect();
    this.sync();
    this.tintSprites(true);
  }

  sync(): void {
    if (!this.enabled) return;
    this.lighting.fillSurfaceShared(this.shared, { ambientScale: LAB_AMBIENT_SCALE });
    this.shared.uTorchRgb.value.set(LAB_TORCH_RGB[0], LAB_TORCH_RGB[1], LAB_TORCH_RGB[2]);
    this.shared.uLanternRgb.value.set(LAB_LANTERN_RGB[0], LAB_LANTERN_RGB[1], LAB_LANTERN_RGB[2]);
    this.shared.uSunbeam3D.value = 1;
    this.shared.uSunbeamIntensity.value = VOXEL_SUNBEAM_INTENSITY;
    for (const entry of this.patched) this.syncOne(entry.mesh);
    this.tintSprites(true);
  }

  patchMesh(mesh: THREE.Mesh): void {
    if (!this.enabled || !canLabPatch(mesh)) return;
    if (this.patched.some((p) => p.mesh === mesh)) {
      this.syncOne(mesh);
      return;
    }
    const src = asBasic(mesh.material);
    if (!src) return;
    this.lighting.unregisterVoxelMesh(mesh);
    neutralizeBakedVertexColors(mesh);
    const local = makeVoxelLocal();
    const pbr = getPbrForTexture(src.map);
    patchVoxelLookMaterial(src, this.shared, local, pbr);
    this.patched.push({ mesh, mat: src, local });
    this.syncOne(mesh);
  }

  private syncOne(mesh: THREE.Mesh): void {
    const entry = this.patched.find((p) => p.mesh === mesh);
    if (!entry) return;
    const tileX = typeof mesh.userData.lightX === 'number' ? mesh.userData.lightX : 0;
    const tileY = typeof mesh.userData.lightY === 'number' ? mesh.userData.lightY : 0;
    const tile = this.tileAt(tileX, tileY);
    this.lighting.fillSurfaceLocal(
      entry.local,
      tileX,
      tileY,
      isWallLike(mesh.userData.kind),
      !!tile?.floorNDark,
      !!mesh.userData.lightGround || !!mesh.userData.rubble
    );
  }

  private tileAt(x: number, y: number) {
    return this.lighting.tileAt(x, y);
  }

  private collect(): void {
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      this.patchMesh(mesh);
    });
  }

  private clear(): void {
    for (const entry of this.patched) {
      unpatchVoxelLookMaterial(entry.mat);
      if (entry.mesh.userData.voxelMesh) this.lighting.registerVoxelMesh(entry.mesh);
    }
    this.patched = [];
  }

  tintSprites(on: boolean): void {
    for (const sprite of this.sprites.sprites) {
      if (sprite.kind === 'sconce') continue;
      const mat = sprite.material as THREE.SpriteMaterial;
      if (!mat?.color) continue;
      if (!on) {
        mat.color.setRGB(1, 1, 1);
        continue;
      }
      const rgb = this.lighting.wallTintRgb(sprite.x, sprite.y, {
        torch: LAB_TORCH_RGB,
        lantern: LAB_LANTERN_RGB
      });
      mat.color.setRGB(rgb[0], rgb[1], rgb[2]);
    }
  }

  stats(): { enabled: boolean; patched: number } {
    return { enabled: this.enabled, patched: this.patched.length };
  }
}

function isWallLike(kind: unknown): boolean {
  if (typeof kind !== 'string') return false;
  return kind === 'wall' || kind === 'secret' || kind === 'ceiling' || kind.startsWith('door');
}
