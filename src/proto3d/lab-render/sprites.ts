import * as THREE from 'three';
import { CONTACT_Y } from '../../voxel-lab/constants';
import { makeContactShadow, prepShadowPatchTexture } from '../../voxel-lab/actors';
import { LAB_LANTERN_RGB, LAB_TORCH_RGB } from '../lab-light';
import type { SpriteManager } from '../sprites';
import type { VertexLightingManager } from '../vertex-lighting';

const PATCH_FILE = 'voxel-lab/shadow_patch.png';

export class LabSpriteSupport {
  group = new THREE.Group();
  private patches = new Map<THREE.Object3D, THREE.Mesh>();
  private patchMap: THREE.Texture | null = null;
  private sprites: SpriteManager | null = null;
  private lighting: VertexLightingManager | null = null;

  constructor() {
    this.group.name = 'lab-sprite-patches';
  }

  async load(): Promise<void> {
    const img = new Image();
    img.decoding = 'async';
    img.src = `${import.meta.env.BASE_URL}${PATCH_FILE}`;
    await img.decode();
    const tex = new THREE.Texture(img);
    this.patchMap = prepShadowPatchTexture(tex);
  }

  attach(scene: THREE.Scene, sprites: SpriteManager, lighting: VertexLightingManager): void {
    this.sprites = sprites;
    this.lighting = lighting;
    scene.add(this.group);
    this.rebuildPatches();
    this.sync();
  }

  detach(scene: THREE.Scene): void {
    this.tint(false);
    this.clearPatches();
    scene.remove(this.group);
    this.sprites = null;
    this.lighting = null;
  }

  sync(): void {
    if (!this.sprites || !this.lighting) return;
    this.tint(true);
    for (const sprite of this.sprites.sprites) {
      if (sprite.kind === 'sconce') continue;
      const patch = this.patches.get(sprite.object);
      if (!patch) continue;
      patch.position.x = sprite.object.position.x;
      patch.position.z = sprite.object.position.z;
      patch.visible = sprite.object.visible;
      const mat = patch.material as THREE.MeshBasicMaterial;
      const rgb = this.lighting.wallTintRgb(sprite.x, sprite.y, {
        torch: LAB_TORCH_RGB,
        lantern: LAB_LANTERN_RGB
      });
      mat.color.setRGB(rgb[0], rgb[1], rgb[2]);
    }
  }

  private tint(on: boolean): void {
    if (!this.sprites || !this.lighting) return;
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

  private rebuildPatches(): void {
    this.clearPatches();
    if (!this.sprites || !this.patchMap) return;
    for (const sprite of this.sprites.sprites) {
      if (sprite.kind === 'sconce') continue;
      const w = Math.max(0.35, (sprite.baseW ?? 0.5) * 0.85);
      const patch = makeContactShadow({
        name: `lab-patch:${sprite.x},${sprite.y}`,
        width: w,
        depth: w * 0.55,
        x: sprite.object.position.x,
        z: sprite.object.position.z,
        map: this.patchMap
      });
      patch.position.y = Math.max(CONTACT_Y, (sprite.floorY ?? 0) + 0.002);
      patch.userData.skipVertexLighting = true;
      patch.userData.labMesh = true;
      patch.userData.noPick = true;
      this.group.add(patch);
      this.patches.set(sprite.object, patch);
    }
  }

  private clearPatches(): void {
    for (const patch of this.patches.values()) {
      patch.parent?.remove(patch);
    }
    this.patches.clear();
  }
}
