import * as THREE from 'three';
import type { DressingMark } from '../dressing';
import type { PixelRenderer } from '../renderer';
import type { SpriteManager } from '../sprites';
import type { FloorData, Sconce } from '../types';
import type { VertexLightingManager } from '../vertex-lighting';
import { LabLights } from './lights';
import { LabSpriteSupport } from './sprites';
import { LabWorld, stairsOnFloor } from './world';

export { lanternWorldFromCamera, GAME_LANTERN_HOLD } from './lantern';
export { enumerateLabFaces, faceKey, labFaceKeys, occludesWallFace } from './occupancy';
export {
  albedoFilenameFromHeight,
  heightMapFilename,
  makeReliefFactory,
  volumeFromAlbedoAndHeight
} from './height-source';
export { stairsOnFloor };

const CLASSIC_KINDS = new Set([
  'wall',
  'secret',
  'floor',
  'ceiling',
  'water-shallow',
  'water-deep'
]);

export class LabRenderer {
  enabled = false;
  world = new LabWorld();
  lights = new LabLights();
  sprites = new LabSpriteSupport();
  private scene: THREE.Scene | null = null;
  private hiddenClassic: THREE.Object3D[] = [];
  private vertexAmbient: THREE.Light | null = null;
  private paletteWas = true;
  private pixel: PixelRenderer | null = null;

  async load(): Promise<void> {
    await Promise.all([this.world.load(), this.sprites.load()]);
  }

  enable(opts: {
    scene: THREE.Scene;
    camera: THREE.Camera;
    renderer: PixelRenderer;
    floor: FloorData;
    sconces: readonly Sconce[];
    sunbeams: DressingMark[];
    sprites: SpriteManager;
    lighting: VertexLightingManager;
    partyX: number;
    partyY: number;
    oil: number;
    heightRelief?: boolean;
  }): void {
    if (this.enabled) {
      this.syncMap(opts.floor, opts.partyX, opts.partyY);
      this.lights.syncTorches(opts.sconces);
      this.lights.setOil(opts.oil);
      if (opts.heightRelief != null) this.setHeightRelief(opts.heightRelief);
      return;
    }
    this.enabled = true;
    this.scene = opts.scene;
    this.pixel = opts.renderer;
    this.paletteWas = opts.renderer.paletteEnabled;
    opts.renderer.setPaletteEnabled(false);
    this.hideClassicSurfaces(opts.scene, true);
    this.muteVertexAmbient(opts.scene, true);
    if (opts.heightRelief != null) this.world.reliefEnabled = opts.heightRelief;
    opts.scene.add(this.world.group);
    this.world.build(opts.floor, opts.partyX, opts.partyY);
    this.lights.attach(opts.scene, opts.camera, opts.renderer.renderer, opts.sconces, opts.sunbeams);
    this.lights.setOil(opts.oil);
    this.sprites.attach(opts.scene, opts.sprites, opts.lighting);
    if (!opts.camera.parent) opts.scene.add(opts.camera);
    this.world.applyDoorRelief(opts.scene, this.world.reliefEnabled);
  }

  disable(): void {
    if (!this.enabled || !this.scene) return;
    this.enabled = false;
    this.world.applyDoorRelief(this.scene, false);
    this.sprites.detach(this.scene);
    this.lights.detach(this.scene, this.pixel!.renderer);
    this.scene.remove(this.world.group);
    this.hideClassicSurfaces(this.scene, false);
    this.muteVertexAmbient(this.scene, false);
    this.pixel?.setPaletteEnabled(this.paletteWas);
    this.scene = null;
    this.pixel = null;
  }

  syncMap(floor: FloorData, partyX: number, partyY: number): void {
    if (!this.enabled) return;
    this.world.rebuild(floor);
    this.world.setParty(partyX, partyY);
    if (this.scene) this.world.applyDoorRelief(this.scene, this.world.reliefEnabled);
  }

  setParty(x: number, y: number): void {
    if (!this.enabled) return;
    this.world.setParty(x, y);
  }

  setRubble(x: number, y: number, on: boolean): void {
    this.world.setRubble(x, y, on);
    if (this.enabled) this.world.rebuild();
  }

  clearRubble(): void {
    this.world.clearRubble();
    if (this.enabled) this.world.rebuild();
  }

  syncTorches(sconces: readonly Sconce[]): void {
    if (!this.enabled) return;
    this.lights.syncTorches(sconces);
  }

  setOil(oil: number): void {
    this.lights.setOil(oil);
  }

  setHeightRelief(on: boolean): void {
    this.world.setReliefEnabled(on);
    if (this.scene) this.world.applyDoorRelief(this.scene, on && this.enabled);
  }

  heightRelief(): boolean {
    return this.world.reliefEnabled;
  }

  update(nowMs: number): void {
    if (!this.enabled) return;
    this.lights.update(nowMs);
    this.sprites.sync();
  }

  lanternWorld(): THREE.Vector3 {
    return this.lights.lanternWorld();
  }

  stats(): {
    enabled: boolean;
    faces: number;
    voxelFaces: number;
    triangles: number;
    lights: ReturnType<LabLights['stats']>;
  } {
    return {
      enabled: this.enabled,
      faces: this.world.faceCount,
      voxelFaces: this.world.voxelFaces,
      triangles: this.world.triangles,
      lights: this.lights.stats()
    };
  }

  wallKeys(): string[] {
    return this.world.listFaceKeys();
  }

  refreshClassicHiding(scene: THREE.Scene): void {
    if (!this.enabled) return;
    this.hideClassicSurfaces(scene, false);
    this.hideClassicSurfaces(scene, true);
  }

  private hideClassicSurfaces(scene: THREE.Scene, hide: boolean): void {
    if (!hide) {
      for (const obj of this.hiddenClassic) obj.visible = true;
      this.hiddenClassic = [];
      return;
    }
    this.hiddenClassic = [];
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData.labMesh) return;
      const kind = mesh.userData.kind;
      if (typeof kind !== 'string' || !CLASSIC_KINDS.has(kind)) return;
      if (typeof kind === 'string' && kind.startsWith('door')) return;
      mesh.visible = false;
      this.hiddenClassic.push(mesh);
    });
  }

  private muteVertexAmbient(scene: THREE.Scene, mute: boolean): void {
    const ambient = scene.getObjectByName('proto3d-vertex-ambient') as THREE.Light | undefined;
    if (!ambient) return;
    if (mute) {
      this.vertexAmbient = ambient;
      ambient.intensity = 0;
    } else if (this.vertexAmbient) {
      this.vertexAmbient.intensity = 1;
      this.vertexAmbient = null;
    }
  }
}

export async function createLabRenderer(): Promise<LabRenderer> {
  const lab = new LabRenderer();
  await lab.load();
  return lab;
}
