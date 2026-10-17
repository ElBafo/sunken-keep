import * as THREE from 'three';
import {
  CELL,
  MAX_ACTIVE_SUNBEAMS,
  MAX_ACTIVE_TORCHES,
  SHADOW_MAP_DESKTOP,
  SHADOW_MAP_MOBILE,
  SUNBEAM_ANGLE,
  SUNBEAM_COLOR,
  SUNBEAM_DISTANCE,
  SUNBEAM_INTENSITY,
  SUNBEAM_RADIUS_TILES,
  SCONCE_RADIUS_TILES,
  TORCH_COLOR,
  TORCH_DISTANCE,
  TORCH_INTENSITY,
  TORCH_SPOT_ANGLE,
  TORCH_SPOT_DISTANCE,
  TORCH_SPOT_INTENSITY
} from './constants';
import {
  FACE_INTO_ROOM,
  floodReach,
  sconceIsLit,
  sconceRoom,
  torchWorldPos,
  type SconceSpec,
  type SunbeamSpec
} from './fixtures';
import { lookColors } from '../voxel-lab/look';
import type { FloorMap } from './layout';

export type LightStats = {
  lantern: number;
  torches: number;
  torchesLit: number;
  torchesActive: number;
  sunbeams: number;
  sunbeamsActive: number;
  total: number;
};

type TorchSlot = {
  point: THREE.PointLight;
  spot: THREE.SpotLight;
};

function isMobile(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
}

function torchFlicker(now: number, seed: number, freeze: boolean): number {
  if (freeze) return 1;
  const t = now * 0.001 + seed;
  return 1 + 0.07 * Math.sin(t * 6.1) + 0.04 * Math.sin(t * 13.7);
}

export class Floor1Lights {
  group = new THREE.Group();
  private torchSlots: TorchSlot[] = [];
  private sunbeamSlots: THREE.SpotLight[] = [];
  private sconces: SconceSpec[] = [];
  private sunbeams: SunbeamSpec[] = [];
  private map: FloorMap;
  private reach = new Map<string, Set<string>>();
  stats: LightStats = {
    lantern: 1,
    torches: 0,
    torchesLit: 0,
    torchesActive: 0,
    sunbeams: 0,
    sunbeamsActive: 0,
    total: 1
  };

  constructor(map: FloorMap) {
    this.map = map;
    this.group.name = 'floor1-lights';
    const look = lookColors(1, false);
    const shadowSize = isMobile() ? SHADOW_MAP_MOBILE : SHADOW_MAP_DESKTOP;
    const torchRgb = look.torch;

    for (let i = 0; i < MAX_ACTIVE_TORCHES; i++) {
      const point = new THREE.PointLight(TORCH_COLOR, 0, TORCH_DISTANCE, 2);
      point.name = `torch-point-${i}`;
      point.color.setRGB(torchRgb[0], torchRgb[1], torchRgb[2]);
      point.castShadow = false;
      point.shadow.mapSize.set(shadowSize, shadowSize);
      point.shadow.camera.near = 0.05;
      point.shadow.camera.far = TORCH_DISTANCE;
      point.shadow.camera.updateProjectionMatrix();
      point.shadow.bias = -0.0004;
      point.shadow.normalBias = 0.008;
      point.shadow.radius = 1;
      const spot = new THREE.SpotLight(TORCH_COLOR, 0, TORCH_SPOT_DISTANCE, TORCH_SPOT_ANGLE, 0.32, 1.4);
      spot.name = `torch-spot-${i}`;
      spot.color.setRGB(torchRgb[0], torchRgb[1], torchRgb[2]);
      spot.castShadow = true;
      spot.shadow.mapSize.set(shadowSize, shadowSize);
      spot.shadow.bias = -0.00015;
      spot.shadow.normalBias = 0.012;
      spot.shadow.radius = 1;
      spot.shadow.camera.near = 0.2;
      spot.shadow.camera.far = 8;
      spot.shadow.camera.updateProjectionMatrix();
      this.group.add(point, spot, spot.target);
      this.torchSlots.push({ point, spot });
    }

    for (let i = 0; i < MAX_ACTIVE_SUNBEAMS; i++) {
      const spot = new THREE.SpotLight(SUNBEAM_COLOR, 0, SUNBEAM_DISTANCE, SUNBEAM_ANGLE, 0.45, 1.2);
      spot.name = `sunbeam-${i}`;
      spot.castShadow = false;
      this.group.add(spot, spot.target);
      this.sunbeamSlots.push(spot);
    }
  }

  attach(scene: THREE.Scene, sconces: SconceSpec[], sunbeams: SunbeamSpec[]): void {
    this.sconces = sconces;
    this.sunbeams = sunbeams;
    this.reach.clear();
    for (const s of sconces) {
      if (!sconceIsLit(s)) continue;
      const room = sconceRoom(s);
      this.reach.set(`${s.x},${s.y},${s.face}`, floodReach(this.map, room.x, room.y, SCONCE_RADIUS_TILES));
    }
    scene.add(this.group);
    this.stats.torches = sconces.length;
    this.stats.torchesLit = sconces.filter(sconceIsLit).length;
    this.stats.sunbeams = sunbeams.length;
  }

  setParty(px: number, py: number, now: number, freezeFlicker: boolean): void {
    const partyKey = `${px},${py}`;
    const lit = this.sconces.filter(sconceIsLit);
    const ranked = lit
      .map((s) => {
        const room = sconceRoom(s);
        const canSee = this.reach.get(`${s.x},${s.y},${s.face}`)?.has(partyKey) ?? false;
        return { s, room, canSee, dist: Math.hypot(room.x - px, room.y - py) };
      })
      .filter((row) => row.canSee)
      .sort((a, b) => a.dist - b.dist);

    let torchActive = 0;
    for (let i = 0; i < this.torchSlots.length; i++) {
      const slot = this.torchSlots[i];
      const row = ranked[i];
      if (!row) {
        slot.point.intensity = 0;
        slot.spot.intensity = 0;
        slot.point.castShadow = false;
        slot.spot.castShadow = false;
        continue;
      }
      const pos = torchWorldPos(row.s);
      const { nx, nz } = FACE_INTO_ROOM[row.s.face];
      const flick = torchFlicker(now, i * 1.7, freezeFlicker);
      // Pull the fill ~22 cm off the wall like the lab so the mount does not blow out.
      const lx = pos.x + nx * 0.22;
      const lz = pos.z + nz * 0.22;
      slot.point.position.set(lx, pos.y, lz);
      slot.spot.position.copy(slot.point.position);
      slot.spot.target.position.set(lx + nx * 2.4, 0.12, lz + nz * 2.4);
      slot.point.intensity = TORCH_INTENSITY * flick;
      slot.spot.intensity = TORCH_SPOT_INTENSITY * flick;
      slot.point.castShadow = false;
      slot.spot.castShadow = true;
      torchActive += 1;
    }

    const beams = this.sunbeams
      .map((b) => ({
        b,
        dist: Math.hypot(b.x - px, b.y - py),
        inRange: Math.hypot(b.x - px, b.y - py) <= SUNBEAM_RADIUS_TILES + 1
      }))
      .filter((row) => row.inRange)
      .sort((a, b) => a.dist - b.dist);

    let beamActive = 0;
    for (let i = 0; i < this.sunbeamSlots.length; i++) {
      const spot = this.sunbeamSlots[i];
      const row = beams[i];
      if (!row) {
        spot.intensity = 0;
        continue;
      }
      spot.position.set(row.b.wx, CELL, row.b.wz);
      spot.target.position.set(row.b.wx, 0.05, row.b.wz);
      spot.intensity = SUNBEAM_INTENSITY;
      beamActive += 1;
    }

    this.stats.torchesActive = torchActive;
    this.stats.sunbeamsActive = beamActive;
    this.stats.total = 1 + torchActive + beamActive;
  }

  shadowLights(): Array<{ light: THREE.Light; active: boolean }> {
    const out: Array<{ light: THREE.Light; active: boolean }> = [];
    for (const slot of this.torchSlots) {
      out.push({ light: slot.spot, active: slot.spot.intensity > 0 });
    }
    return out;
  }
}
