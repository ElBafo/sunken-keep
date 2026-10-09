import * as THREE from 'three';
import { CELL_SIZE, FOG_COLOR, FOG_FAR, FOG_NEAR, WATER_Y } from './constants';
import { Dressing } from './dressing';
import { QUALITY_PRESETS, QualityLevel } from './quality';
import { FloorData } from './types';

interface DripSlot {
  mesh: THREE.Mesh;
  splash: THREE.Mesh;
  active: boolean;
  x: number;
  z: number;
  y: number;
  vy: number;
  splashAge: number;
  splashFrame: number;
  splashing: boolean;
}

export class Atmosphere {
  quality: QualityLevel;
  private dustPoints: THREE.Points[] = [];
  private dustData: Array<{
    positions: Float32Array;
    velocities: Float32Array;
    attr: THREE.BufferAttribute;
  }> = [];
  private drips: DripSlot[] = [];
  private dripSites: Array<{ x: number; z: number }> = [];
  private nextDripAt = 0;
  private siteCursor = 0;
  private onSplash: ((x: number, y: number, z: number) => void) | null = null;
  private readonly camBox = 3 * CELL_SIZE;
  private splashMaps: THREE.Texture[] = [];
  private dropLook = new THREE.Vector3();

  constructor(quality: QualityLevel) {
    this.quality = quality;
  }

  setSplashHandler(fn: (x: number, y: number, z: number) => void) {
    this.onSplash = fn;
  }

  applyFog(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    const color = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.Fog(color, FOG_NEAR, FOG_FAR);
    scene.background = color;
    renderer.setClearColor(color, 1);
  }

  build(scene: THREE.Scene, floorData: FloorData, dressing: Dressing) {
    this.buildDust(scene, dressing);
    this.collectDripSites(floorData);
    this.buildDripPool(scene, dressing);
    this.nextDripAt = performance.now() + 700;
  }

  setQuality(level: QualityLevel) {
    this.quality = level;
    const preset = QUALITY_PRESETS[level];
    for (const p of this.dustPoints) p.visible = preset.dustCount > 0;
    if (preset.maxActiveDrips === 0) {
      for (const d of this.drips) {
        d.active = false;
        d.splashing = false;
        d.mesh.visible = false;
        d.splash.visible = false;
      }
    }
  }

  private collectDripSites(floorData: FloorData) {
    const water: Array<{ x: number; z: number }> = [];
    const { tiles, width, height } = floorData;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x].deepWater || tiles[y][x].shallowWater) {
          water.push({ x: x * CELL_SIZE, z: y * CELL_SIZE });
        }
      }
    }
    const want = QUALITY_PRESETS.high.dripSites;
    this.dripSites = [];
    if (water.length === 0) return;
    const step = Math.max(1, water.length / want);
    for (let i = 0; i < want; i++) {
      this.dripSites.push(water[Math.min(water.length - 1, Math.floor(i * step))]);
    }
  }

  private buildDust(scene: THREE.Scene, dressing: Dressing) {
    const atlas = dressing.tex('dust');
    const total = QUALITY_PRESETS.high.dustCount;
    const groups = 4;
    const per = Math.floor(total / groups);
    // dust.png is 8×8 with four 4×4 cells.
    const offsets: Array<[number, number]> = [
      [0, 0.5],
      [0.5, 0.5],
      [0, 0],
      [0.5, 0]
    ];
    for (let g = 0; g < groups; g++) {
      const positions = new Float32Array(per * 3);
      const velocities = new Float32Array(per * 3);
      for (let i = 0; i < per; i++) {
        positions[i * 3] = (Math.random() - 0.5) * this.camBox * 2;
        positions[i * 3 + 1] = 0.2 + Math.random() * 1.6;
        positions[i * 3 + 2] = (Math.random() - 0.5) * this.camBox * 2;
        velocities[i * 3] = (Math.random() - 0.5) * 0.035;
        velocities[i * 3 + 1] = -0.008 + (Math.random() - 0.5) * 0.01;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.035;
      }
      const geo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(positions, 3);
      geo.setAttribute('position', attr);
      const mat = new THREE.PointsMaterial({
        map: atlas,
        color: 0xffe6c0,
        size: 0.04,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        fog: true,
        alphaTest: 0.05
      });
      mat.map = atlas.clone();
      mat.map.offset.set(offsets[g][0], offsets[g][1]);
      mat.map.repeat.set(0.5, 0.5);
      mat.map.needsUpdate = true;
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      points.userData.skipVertexLighting = true;
      points.userData.noPick = true;
      points.visible = QUALITY_PRESETS[this.quality].dustCount > 0;
      scene.add(points);
      this.dustPoints.push(points);
      this.dustData.push({ positions, velocities, attr });
    }
  }

  private buildDripPool(scene: THREE.Scene, dressing: Dressing) {
    const pool = QUALITY_PRESETS.high.maxActiveDrips;
    const dropMap = dressing.tex('drip_drop');
    this.splashMaps = [dressing.tex('splash_1'), dressing.tex('splash_2'), dressing.tex('splash_3')];
    const dropMat = new THREE.MeshBasicMaterial({
      map: dropMap,
      transparent: true,
      depthWrite: false,
      fog: true,
      alphaTest: 0.05
    });
    for (let i = 0; i < pool; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.12), dropMat);
      mesh.visible = false;
      mesh.userData.skipVertexLighting = true;
      mesh.userData.noPick = true;
      const splashMat = new THREE.MeshBasicMaterial({
        map: this.splashMaps[0],
        transparent: true,
        depthWrite: false,
        fog: true,
        alphaTest: 0.05,
        side: THREE.DoubleSide
      });
      const splash = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), splashMat);
      splash.rotation.x = -Math.PI / 2;
      splash.visible = false;
      splash.userData.skipVertexLighting = true;
      splash.userData.noPick = true;
      scene.add(mesh);
      scene.add(splash);
      this.drips.push({
        mesh,
        splash,
        active: false,
        x: 0,
        z: 0,
        y: 0,
        vy: 0,
        splashAge: 0,
        splashFrame: 0,
        splashing: false
      });
    }
  }

  update(dtSec: number, now: number, camera: THREE.Camera) {
    const camX = camera.position.x;
    const camZ = camera.position.z;
    this.updateDust(dtSec, now, camX, camZ);
    this.updateDrips(dtSec, now, camera);
  }

  private updateDust(dtSec: number, now: number, camX: number, camZ: number) {
    const preset = QUALITY_PRESETS[this.quality];
    const on = preset.dustCount > 0;
    for (const p of this.dustPoints) p.visible = on;
    if (!on) return;
    const half = this.camBox;
    const t = now * 0.001;
    for (const data of this.dustData) {
      const { positions: pos, velocities: vel, attr } = data;
      const n = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        const sway = Math.sin(t * (0.15 + (i % 7) * 0.03) + i) * 0.02;
        pos[ix] += (vel[ix] + sway) * dtSec * 60;
        pos[ix + 1] += vel[ix + 1] * dtSec * 60;
        pos[ix + 2] += vel[ix + 2] * dtSec * 60;
        let x = pos[ix] - camX;
        let z = pos[ix + 2] - camZ;
        if (x > half) x -= half * 2;
        else if (x < -half) x += half * 2;
        if (z > half) z -= half * 2;
        else if (z < -half) z += half * 2;
        let y = pos[ix + 1];
        if (y > 1.85) y = 0.18;
        else if (y < 0.12) y = 1.7;
        pos[ix] = camX + x;
        pos[ix + 1] = y;
        pos[ix + 2] = camZ + z;
      }
      attr.needsUpdate = true;
    }
  }

  private spawnDrip() {
    const preset = QUALITY_PRESETS[this.quality];
    if (preset.maxActiveDrips <= 0 || this.dripSites.length === 0) return;
    let slot: DripSlot | null = null;
    let active = 0;
    for (const d of this.drips) {
      if (d.active || d.splashing) active++;
      else if (!slot) slot = d;
    }
    if (!slot || active >= preset.maxActiveDrips) return;
    this.siteCursor = (this.siteCursor + 1) % this.dripSites.length;
    const site = this.dripSites[this.siteCursor];
    slot.x = site.x + (Math.random() - 0.5) * 0.7;
    slot.z = site.z + (Math.random() - 0.5) * 0.7;
    slot.y = CELL_SIZE - 0.06;
    slot.vy = 0;
    slot.active = true;
    slot.splashing = false;
    slot.mesh.visible = true;
    slot.mesh.position.set(slot.x, slot.y, slot.z);
    slot.splash.visible = false;
  }

  private updateDrips(dtSec: number, now: number, camera: THREE.Camera) {
    const preset = QUALITY_PRESETS[this.quality];
    if (preset.maxActiveDrips > 0 && now >= this.nextDripAt) {
      this.spawnDrip();
      this.nextDripAt =
        now + preset.dripIntervalMin + Math.random() * (preset.dripIntervalMax - preset.dripIntervalMin);
    }
    const gravity = 2.8;
    for (const d of this.drips) {
      if (d.active) {
        d.vy += gravity * dtSec;
        d.y -= d.vy * dtSec;
        d.mesh.position.set(d.x, d.y, d.z);
        this.dropLook.copy(camera.position);
        d.mesh.lookAt(this.dropLook);
        if (d.y <= WATER_Y + 0.03) {
          d.active = false;
          d.mesh.visible = false;
          d.splashing = true;
          d.splashAge = 0;
          d.splashFrame = 0;
          d.splash.visible = true;
          d.splash.position.set(d.x, WATER_Y + 0.02, d.z);
          (d.splash.material as THREE.MeshBasicMaterial).map = this.splashMaps[0];
          this.onSplash?.(d.x, WATER_Y, d.z);
        }
      } else if (d.splashing) {
        d.splashAge += dtSec;
        const frame = Math.min(2, Math.floor(d.splashAge * 10));
        if (frame !== d.splashFrame) {
          d.splashFrame = frame;
          (d.splash.material as THREE.MeshBasicMaterial).map = this.splashMaps[frame];
          (d.splash.material as THREE.MeshBasicMaterial).needsUpdate = true;
        }
        if (d.splashAge >= 0.3) {
          d.splashing = false;
          d.splash.visible = false;
        }
      }
    }
  }
}
