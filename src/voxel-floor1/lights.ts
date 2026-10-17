import * as THREE from 'three';
import {
  CELL,
  MAX_ACTIVE_SUNBEAMS,
  MAX_ACTIVE_TORCHES,
  SHADOW_MAP_DESKTOP,
  SHADOW_MAP_MOBILE,
  SUNBEAM_ANGLE,
  SUNBEAM_COLOR,
  SUNBEAM_DECAY,
  SUNBEAM_DISTANCE,
  SUNBEAM_INTENSITY,
  SUNBEAM_PENUMBRA,
  SUNBEAM_RADIUS_TILES,
  SUNBEAM_RGB,
  SCONCE_RADIUS_TILES,
  TORCH_COLOR,
  TORCH_DECAY,
  TORCH_DISTANCE,
  TORCH_FADE_MS,
  TORCH_INTENSITY,
  TORCH_RGB,
  TORCH_SPOT_ANGLE,
  TORCH_SPOT_DISTANCE,
  TORCH_SPOT_INTENSITY
} from './constants';
import {
  FACE_INTO_ROOM,
  beamKey,
  floodReach,
  sconceIsLit,
  sconceKey,
  sconceRoom,
  torchWorldPos,
  type SconceSpec,
  type SunbeamSpec
} from './fixtures';
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
  key: string;
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
  blends = new Map<string, number>();
  private torchSlots: TorchSlot[] = [];
  private sunbeamSlots: THREE.SpotLight[] = [];
  private sconces: SconceSpec[] = [];
  private sunbeams: SunbeamSpec[] = [];
  private map: FloorMap;
  private reach = new Map<string, Set<string>>();
  private lastNow = 0;
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
    const shadowSize = isMobile() ? SHADOW_MAP_MOBILE : SHADOW_MAP_DESKTOP;

    for (let i = 0; i < MAX_ACTIVE_TORCHES; i++) {
      const point = new THREE.PointLight(TORCH_COLOR, 0, TORCH_DISTANCE, TORCH_DECAY);
      point.name = `torch-point-${i}`;
      point.color.setRGB(TORCH_RGB[0], TORCH_RGB[1], TORCH_RGB[2]);
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
      spot.color.setRGB(TORCH_RGB[0], TORCH_RGB[1], TORCH_RGB[2]);
      spot.castShadow = true;
      spot.shadow.mapSize.set(shadowSize, shadowSize);
      spot.shadow.bias = -0.00015;
      spot.shadow.normalBias = 0.012;
      spot.shadow.radius = 1;
      spot.shadow.camera.near = 0.2;
      spot.shadow.camera.far = 8;
      spot.shadow.camera.updateProjectionMatrix();
      this.group.add(point, spot, spot.target);
      this.torchSlots.push({ point, spot, key: '' });
    }

    for (let i = 0; i < MAX_ACTIVE_SUNBEAMS; i++) {
      const spot = new THREE.SpotLight(
        SUNBEAM_COLOR,
        0,
        SUNBEAM_DISTANCE,
        SUNBEAM_ANGLE,
        SUNBEAM_PENUMBRA,
        SUNBEAM_DECAY
      );
      spot.name = `sunbeam-${i}`;
      spot.color.setRGB(SUNBEAM_RGB[0], SUNBEAM_RGB[1], SUNBEAM_RGB[2]);
      spot.castShadow = false;
      this.group.add(spot, spot.target);
      this.sunbeamSlots.push(spot);
    }
  }

  attach(scene: THREE.Scene, sconces: SconceSpec[], sunbeams: SunbeamSpec[]): void {
    this.sconces = sconces;
    this.sunbeams = sunbeams;
    this.reach.clear();
    this.blends.clear();
    for (const s of sconces) {
      if (!sconceIsLit(s)) continue;
      const room = sconceRoom(s);
      const key = sconceKey(s);
      this.reach.set(key, floodReach(this.map, room.x, room.y, SCONCE_RADIUS_TILES));
      this.blends.set(key, 0);
    }
    for (const b of sunbeams) {
      this.blends.set(beamKey(b), 0);
    }
    scene.add(this.group);
    this.stats.torches = sconces.length;
    this.stats.torchesLit = sconces.filter(sconceIsLit).length;
    this.stats.sunbeams = sunbeams.length;
  }

  setParty(px: number, py: number, now: number, freezeFlicker: boolean): void {
    const partyKey = `${px},${py}`;
    const dt = this.lastNow ? Math.min(0.08, Math.max(0, (now - this.lastNow) / 1000)) : 0;
    this.lastNow = now;
    const fade = freezeFlicker ? 1 : Math.min(1, (dt * 1000) / TORCH_FADE_MS);

    const lit = this.sconces.filter(sconceIsLit);
    const ranked = lit
      .map((s) => {
        const room = sconceRoom(s);
        const key = sconceKey(s);
        const canSee = this.reach.get(key)?.has(partyKey) ?? false;
        return { s, room, key, canSee, dist: Math.hypot(room.x - px, room.y - py) };
      })
      .filter((row) => row.canSee)
      .sort((a, b) => a.dist - b.dist);

    const desired = new Set(ranked.slice(0, MAX_ACTIVE_TORCHES).map((row) => row.key));
    for (const s of lit) {
      const key = sconceKey(s);
      const want = desired.has(key) ? 1 : 0;
      const cur = this.blends.get(key) ?? 0;
      this.blends.set(key, freezeFlicker ? want : cur + (want - cur) * Math.max(fade, 0.04));
    }

    const byBlend = lit
      .map((s) => ({ s, key: sconceKey(s), blend: this.blends.get(sconceKey(s)) ?? 0 }))
      .filter((row) => row.blend > 0.015)
      .sort((a, b) => b.blend - a.blend);

    let torchActive = 0;
    for (let i = 0; i < this.torchSlots.length; i++) {
      const slot = this.torchSlots[i];
      const row = byBlend[i];
      if (!row) {
        slot.point.intensity = 0;
        slot.spot.intensity = 0;
        slot.point.castShadow = false;
        slot.spot.castShadow = false;
        slot.key = '';
        continue;
      }
      const pos = torchWorldPos(row.s);
      const { nx, nz } = FACE_INTO_ROOM[row.s.face];
      const flick = torchFlicker(now, i * 1.7, freezeFlicker);
      slot.point.position.set(pos.x, pos.y, pos.z);
      slot.spot.position.copy(slot.point.position);
      slot.spot.target.position.set(pos.x + nx * 2.4, 0.12, pos.z + nz * 2.4);
      slot.point.intensity = TORCH_INTENSITY * flick * row.blend;
      slot.spot.intensity = TORCH_SPOT_INTENSITY * flick * row.blend;
      slot.point.castShadow = false;
      slot.spot.castShadow = row.blend > 0.35;
      slot.key = row.key;
      if (row.blend > 0.35) torchActive += 1;
    }

    const rankedBeams = this.sunbeams
      .map((b) => ({
        b,
        key: beamKey(b),
        dist: Math.hypot(b.x - px, b.y - py),
        inRange: Math.hypot(b.x - px, b.y - py) <= SUNBEAM_RADIUS_TILES + 1
      }))
      .sort((a, b) => a.dist - b.dist);
    const desiredBeams = new Set(
      rankedBeams
        .filter((row) => row.inRange)
        .slice(0, MAX_ACTIVE_SUNBEAMS)
        .map((row) => row.key)
    );
    for (const row of rankedBeams) {
      const want = desiredBeams.has(row.key) ? 1 : 0;
      const cur = this.blends.get(row.key) ?? 0;
      this.blends.set(row.key, freezeFlicker ? want : cur + (want - cur) * Math.max(fade, 0.04));
    }

    const byBeamBlend = rankedBeams
      .map((row) => ({ ...row, blend: this.blends.get(row.key) ?? 0 }))
      .filter((row) => row.blend > 0.015)
      .sort((a, b) => b.blend - a.blend);

    let beamActive = 0;
    for (let i = 0; i < this.sunbeamSlots.length; i++) {
      const spot = this.sunbeamSlots[i];
      const row = byBeamBlend[i];
      if (!row) {
        spot.intensity = 0;
        continue;
      }
      spot.position.set(row.b.wx, CELL, row.b.wz);
      spot.target.position.set(row.b.wx, 0.05, row.b.wz);
      spot.intensity = SUNBEAM_INTENSITY * row.blend;
      if (row.blend > 0.35) beamActive += 1;
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
