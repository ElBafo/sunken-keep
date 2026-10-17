import * as THREE from 'three';
import {
  LANTERN_SPOT_MAP_DESKTOP,
  LANTERN_SPOT_MAP_MOBILE,
  SHADOW_MAP_DESKTOP,
  SHADOW_MAP_MOBILE,
  TORCH_COLOR,
  TORCH_DISTANCE,
  TORCH_INTENSITY
} from '../../voxel-lab/constants';
import { CELL_SIZE, FACE_INTO_ROOM, FLOOR_AMBIENT, SUNBEAM_INTENSITY } from '../constants';
import type { DressingMark } from '../dressing';
import { lookColors } from '../../voxel-lab/look';
import type { Sconce } from '../types';
import { torchWorldPos } from '../torches';
import {
  attachLanternToCamera,
  GAME_EMBER_SCALE,
  GAME_LANTERN_COLOR,
  GAME_LANTERN_DISTANCE,
  GAME_LANTERN_HOLD,
  GAME_LANTERN_INTENSITY,
  GAME_LANTERN_SPOT_ANGLE,
  GAME_LANTERN_SPOT_INTENSITY,
  lanternFlicker
} from './lantern';
import { applyShadowToggle } from '../../voxel-lab/shadows';

const SUNBEAM_COLOR = 0xb3d6ff;

function isMobile(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
}

export class LabLights {
  group = new THREE.Group();
  lantern!: THREE.PointLight;
  lanternSpot!: THREE.SpotLight;
  private hemi: THREE.HemisphereLight;
  private fill: THREE.AmbientLight;
  private torches = new Map<string, THREE.PointLight>();
  private torchSpots = new Map<string, THREE.SpotLight>();
  private sunbeams: THREE.SpotLight[] = [];
  private camera: THREE.Camera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private sceneRoot: THREE.Object3D | null = null;
  private oil = 2;
  private lanternOn = true;
  private shadowsOn = true;

  constructor() {
    this.group.name = 'lab-lights';
    const look = lookColors(1, false);
    this.hemi = new THREE.HemisphereLight(
      new THREE.Color().setRGB(look.ambientSky[0], look.ambientSky[1], look.ambientSky[2]),
      new THREE.Color().setRGB(look.ambientGround[0], look.ambientGround[1], look.ambientGround[2]),
      0.03
    );
    this.hemi.name = 'lab-hemi';
    this.fill = new THREE.AmbientLight(
      new THREE.Color().setRGB(look.ambientFill[0], look.ambientFill[1], look.ambientFill[2]),
      FLOOR_AMBIENT[1]
    );
    this.fill.name = 'lab-fill';
    this.group.add(this.hemi, this.fill);
  }

  attach(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    sconces: readonly Sconce[],
    sunbeams: DressingMark[]
  ): void {
    this.camera = camera;
    this.renderer = renderer;
    this.sceneRoot = scene;
    scene.add(this.group);
    this.ensureLantern(camera, renderer);
    this.syncTorches(sconces);
    this.syncSunbeams(sunbeams);
    this.applyShadows();
  }

  detach(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    this.applyShadows(false);
    scene.remove(this.group);
    if (this.lantern && this.camera) this.camera.remove(this.lantern);
    if (this.lanternSpot && this.camera) {
      this.camera.remove(this.lanternSpot);
      this.camera.remove(this.lanternSpot.target);
    }
    renderer.shadowMap.enabled = false;
    this.camera = null;
    this.renderer = null;
    this.sceneRoot = null;
  }

  setOil(oil: number): void {
    this.oil = oil;
    this.syncLanternIntensity(performance.now());
  }

  setLanternOn(on: boolean): void {
    this.lanternOn = on;
    this.syncLanternIntensity(performance.now());
    this.applyShadows();
  }

  /** Parent the lantern on the camera before the first frame. */
  private ensureLantern(camera: THREE.Camera, renderer: THREE.WebGLRenderer): void {
    if (!this.lantern) {
      this.lantern = new THREE.PointLight(GAME_LANTERN_COLOR, GAME_LANTERN_INTENSITY, GAME_LANTERN_DISTANCE, 2);
      this.lantern.name = 'lab-lantern';
      this.lantern.castShadow = false;
      this.lanternSpot = new THREE.SpotLight(
        GAME_LANTERN_COLOR,
        GAME_LANTERN_SPOT_INTENSITY,
        GAME_LANTERN_DISTANCE,
        GAME_LANTERN_SPOT_ANGLE,
        0.35,
        1.6
      );
      this.lanternSpot.name = 'lab-lantern-spot';
      this.lanternSpot.castShadow = true;
      const map = isMobile() ? LANTERN_SPOT_MAP_MOBILE : LANTERN_SPOT_MAP_DESKTOP;
      this.lanternSpot.shadow.mapSize.set(map, map);
      this.lanternSpot.shadow.bias = -0.0002;
      this.lanternSpot.shadow.normalBias = 0.01;
      this.lanternSpot.shadow.radius = 1;
      this.lanternSpot.shadow.camera.near = 0.12;
      this.lanternSpot.shadow.camera.far = GAME_LANTERN_DISTANCE;
      this.lanternSpot.shadow.camera.updateProjectionMatrix();
    }
    attachLanternToCamera(camera, this.lantern);
    attachLanternToCamera(camera, this.lanternSpot);
    this.lanternSpot.target.position.set(
      GAME_LANTERN_HOLD[0],
      GAME_LANTERN_HOLD[1] - 0.2,
      GAME_LANTERN_HOLD[2] - 4
    );
    camera.add(this.lanternSpot.target);
    if (camera.parent !== this.sceneRoot && this.sceneRoot && !camera.parent) {
      this.sceneRoot.add(camera);
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.syncLanternIntensity(0);
  }

  /** Visual PointLights only. Crackle loops stay on the game-state audio hooks. */
  syncTorches(sconces: readonly Sconce[]): void {
    const keep = new Set<string>();
    const shadowSize = isMobile() ? SHADOW_MAP_MOBILE : SHADOW_MAP_DESKTOP;
    for (const s of sconces) {
      const key = `${s.x},${s.y},${s.face}`;
      keep.add(key);
      let light = this.torches.get(key);
      if (!light) {
        light = new THREE.PointLight(TORCH_COLOR, 0, TORCH_DISTANCE, 2);
        light.name = `lab-torch:${key}`;
        light.castShadow = true;
        light.shadow.mapSize.set(shadowSize, shadowSize);
        light.shadow.camera.near = 0.05;
        light.shadow.camera.far = TORCH_DISTANCE;
        light.shadow.camera.updateProjectionMatrix();
        light.shadow.bias = -0.0004;
        light.shadow.normalBias = 0.008;
        this.group.add(light);
        this.torches.set(key, light);

        const pos = torchWorldPos(s);
        const { nx, nz } = FACE_INTO_ROOM[s.face];
        const spot = new THREE.SpotLight(TORCH_COLOR, 0, 7.5, Math.PI / 4.8, 0.32, 1.4);
        spot.name = `lab-torch-spot:${key}`;
        spot.castShadow = true;
        spot.shadow.mapSize.set(shadowSize, shadowSize);
        spot.shadow.bias = -0.00015;
        spot.shadow.normalBias = 0.012;
        spot.position.copy(light.position);
        spot.target.position.set(pos.x + nx * 2.4, 0.12, pos.z + nz * 2.4);
        this.group.add(spot, spot.target);
        this.torchSpots.set(key, spot);
      }
      const pos = torchWorldPos(s);
      light.position.set(pos.x, pos.y, pos.z);
      const spot = this.torchSpots.get(key);
      if (spot) {
        spot.position.copy(light.position);
        const { nx, nz } = FACE_INTO_ROOM[s.face];
        spot.target.position.set(pos.x + nx * 2.4, 0.12, pos.z + nz * 2.4);
      }
      const on = !!s.lit && !s.capped && !s.empty;
      light.intensity = on ? TORCH_INTENSITY : 0;
      if (spot) spot.intensity = on ? 10 : 0;
      light.visible = on;
      if (spot) spot.visible = on;
    }
    for (const [key, light] of this.torches) {
      if (keep.has(key)) continue;
      this.group.remove(light);
      this.torches.delete(key);
      const spot = this.torchSpots.get(key);
      if (spot) {
        this.group.remove(spot);
        this.group.remove(spot.target);
        this.torchSpots.delete(key);
      }
    }
    this.applyShadows();
  }

  private syncSunbeams(marks: DressingMark[]): void {
    for (const s of this.sunbeams) {
      this.group.remove(s);
      this.group.remove(s.target);
    }
    this.sunbeams = [];
    for (const beam of marks) {
      const spot = new THREE.SpotLight(SUNBEAM_COLOR, SUNBEAM_INTENSITY * 6, CELL_SIZE * 2.4, Math.PI / 7, 0.45, 1.2);
      spot.name = `lab-sunbeam:${beam.x},${beam.y}`;
      spot.position.set(beam.wx, beam.wy ?? CELL_SIZE, beam.wz);
      spot.target.position.set(beam.wx, 0.05, beam.wz);
      spot.castShadow = false;
      this.group.add(spot, spot.target);
      this.sunbeams.push(spot);
    }
  }

  syncLanternIntensity(nowMs: number): void {
    if (!this.lantern) return;
    const hasOil = this.oil > 0;
    const base = !this.lanternOn ? 0 : hasOil ? GAME_LANTERN_INTENSITY : GAME_LANTERN_INTENSITY * GAME_EMBER_SCALE;
    const spotBase = !this.lanternOn ? 0 : hasOil ? GAME_LANTERN_SPOT_INTENSITY : GAME_LANTERN_SPOT_INTENSITY * GAME_EMBER_SCALE;
    this.lantern.intensity = lanternFlicker(nowMs, base);
    if (this.lanternSpot) this.lanternSpot.intensity = lanternFlicker(nowMs, spotBase);
    if (!hasOil && this.lanternOn) {
      this.lantern.color.setHex(0x8cb8ff);
      this.lanternSpot?.color.setHex(0x8cb8ff);
    } else {
      this.lantern.color.setHex(GAME_LANTERN_COLOR);
      this.lanternSpot?.color.setHex(GAME_LANTERN_COLOR);
    }
  }

  update(nowMs: number): void {
    this.syncLanternIntensity(nowMs);
  }

  lanternWorld(target = new THREE.Vector3()): THREE.Vector3 {
    if (!this.lantern) return target.set(0, 0, 0);
    this.lantern.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(this.lantern.matrixWorld);
  }

  private applyShadows(on = this.shadowsOn): void {
    if (!this.renderer) return;
    const lights: Array<{ light: THREE.Light; active: boolean }> = [];
    if (this.lanternSpot) lights.push({ light: this.lanternSpot, active: this.lanternOn && this.oil >= 0 });
    for (const light of this.torches.values()) lights.push({ light, active: light.intensity > 0 });
    for (const spot of this.torchSpots.values()) lights.push({ light: spot, active: spot.intensity > 0 });
    applyShadowToggle({
      on,
      renderer: this.renderer,
      lights,
      roots: this.sceneRoot ? [this.sceneRoot] : []
    });
  }

  stats(): { torches: number; litTorches: number; sunbeams: number; lantern: number } {
    let lit = 0;
    for (const l of this.torches.values()) if (l.intensity > 0) lit += 1;
    return {
      torches: this.torches.size,
      litTorches: lit,
      sunbeams: this.sunbeams.length,
      lantern: this.lantern?.intensity ?? 0
    };
  }
}
