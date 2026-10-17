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
import { FAR_BEAM_SLOTS, FAR_TORCH_SLOTS } from './bake';
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

export type LightMode = 'bake' | 'pool' | 'all';

export type LightStats = {
  mode: LightMode;
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

/** Keep unused bake slots in the shader light list without a visible contribution. */
const SLOT_HOLD = 1e-4;

function isMobile(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
}

function torchFlicker(now: number, seed: number, freeze: boolean): number {
  if (freeze) return 1;
  const t = now * 0.001 + seed;
  return 1 + 0.07 * Math.sin(t * 6.1) + 0.04 * Math.sin(t * 13.7);
}

export function parseLightMode(search: string): LightMode {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const v = new URLSearchParams(raw).get('lights');
  if (v === 'pool' || v === 'all') return v;
  return 'bake';
}

export class Floor1Lights {
  group = new THREE.Group();
  blends = new Map<string, number>();
  readonly mode: LightMode;
  private torchSlots: TorchSlot[] = [];
  private sunbeamSlots: THREE.SpotLight[] = [];
  private sconces: SconceSpec[] = [];
  private sunbeams: SunbeamSpec[] = [];
  private map: FloorMap;
  private reach = new Map<string, Set<string>>();
  private lastNow = 0;
  stats: LightStats;

  constructor(map: FloorMap, mode: LightMode = 'bake') {
    this.map = map;
    this.mode = mode;
    this.group.name = 'floor1-lights';
    this.stats = {
      mode,
      lantern: 1,
      torches: 0,
      torchesLit: 0,
      torchesActive: 0,
      sunbeams: 0,
      sunbeamsActive: 0,
      total: 1
    };
    const shadowSize = isMobile() ? SHADOW_MAP_MOBILE : SHADOW_MAP_DESKTOP;
    const torchN = mode === 'all' ? FAR_TORCH_SLOTS : MAX_ACTIVE_TORCHES;
    const beamN = mode === 'all' ? FAR_BEAM_SLOTS : MAX_ACTIVE_SUNBEAMS;

    for (let i = 0; i < torchN; i++) {
      const point = new THREE.PointLight(TORCH_COLOR, SLOT_HOLD, TORCH_DISTANCE, TORCH_DECAY);
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
      const spot = new THREE.SpotLight(TORCH_COLOR, SLOT_HOLD, TORCH_SPOT_DISTANCE, TORCH_SPOT_ANGLE, 0.32, 1.4);
      spot.name = `torch-spot-${i}`;
      spot.color.setRGB(TORCH_RGB[0], TORCH_RGB[1], TORCH_RGB[2]);
      // Shadow flag stays put after boot so NUM_SPOT_LIGHT_SHADOWS never changes.
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

    for (let i = 0; i < beamN; i++) {
      const spot = new THREE.SpotLight(
        SUNBEAM_COLOR,
        SLOT_HOLD,
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
      this.blends.set(key, this.mode === 'all' ? 1 : 0);
    }
    for (const b of sunbeams) {
      this.blends.set(beamKey(b), this.mode === 'all' ? 1 : 0);
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

    if (this.mode === 'all') {
      this.placeAll(lit, now, freezeFlicker);
      return;
    }

    if (this.mode === 'pool') {
      this.placePool(px, py, lit, now, freezeFlicker);
      return;
    }

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
        slot.point.intensity = SLOT_HOLD;
        slot.spot.intensity = SLOT_HOLD;
        continue;
      }
      this.bindTorch(slot, row.s, now, i, row.blend, freezeFlicker);
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
        spot.intensity = SLOT_HOLD;
        continue;
      }
      this.bindBeam(spot, row.b, row.blend);
      if (row.blend > 0.35) beamActive += 1;
    }

    this.stats.torchesActive = torchActive;
    this.stats.sunbeamsActive = beamActive;
    this.stats.total = 1 + torchActive + beamActive;
  }

  shadowLights(): Array<{ light: THREE.Light; active: boolean }> {
    const out: Array<{ light: THREE.Light; active: boolean }> = [];
    for (const slot of this.torchSlots) {
      out.push({ light: slot.spot, active: true });
    }
    return out;
  }

  private placeAll(lit: SconceSpec[], now: number, freezeFlicker: boolean): void {
    for (const s of lit) this.blends.set(sconceKey(s), 1);
    for (const b of this.sunbeams) this.blends.set(beamKey(b), 1);
    for (let i = 0; i < this.torchSlots.length; i++) {
      const s = lit[i];
      if (!s) continue;
      this.bindTorch(this.torchSlots[i], s, now, i, 1, freezeFlicker);
    }
    for (let i = 0; i < this.sunbeamSlots.length; i++) {
      const b = this.sunbeams[i];
      if (!b) continue;
      this.bindBeam(this.sunbeamSlots[i], b, 1);
    }
    this.stats.torchesActive = Math.min(this.torchSlots.length, lit.length);
    this.stats.sunbeamsActive = Math.min(this.sunbeamSlots.length, this.sunbeams.length);
    this.stats.total = 1 + this.stats.torchesActive + this.stats.sunbeamsActive;
  }

  private placePool(
    px: number,
    py: number,
    lit: SconceSpec[],
    now: number,
    freezeFlicker: boolean
  ): void {
    const ranked = lit
      .map((s) => {
        const room = sconceRoom(s);
        return { s, key: sconceKey(s), dist: Math.hypot(room.x - px, room.y - py) };
      })
      .sort((a, b) => a.dist - b.dist);
    const assigned = new Set(ranked.slice(0, this.torchSlots.length).map((row) => row.key));
    for (const s of lit) this.blends.set(sconceKey(s), assigned.has(sconceKey(s)) ? 1 : 0);
    for (let i = 0; i < this.torchSlots.length; i++) {
      const row = ranked[i];
      if (!row) continue;
      this.bindTorch(this.torchSlots[i], row.s, now, i, 1, freezeFlicker);
    }

    const rankedBeams = this.sunbeams
      .map((b) => ({ b, key: beamKey(b), dist: Math.hypot(b.x - px, b.y - py) }))
      .sort((a, b) => a.dist - b.dist);
    const assignedBeams = new Set(rankedBeams.slice(0, this.sunbeamSlots.length).map((row) => row.key));
    for (const row of rankedBeams) this.blends.set(row.key, assignedBeams.has(row.key) ? 1 : 0);
    for (let i = 0; i < this.sunbeamSlots.length; i++) {
      const row = rankedBeams[i];
      if (!row) continue;
      this.bindBeam(this.sunbeamSlots[i], row.b, 1);
    }

    this.stats.torchesActive = Math.min(this.torchSlots.length, ranked.length);
    this.stats.sunbeamsActive = Math.min(this.sunbeamSlots.length, rankedBeams.length);
    this.stats.total = 1 + this.stats.torchesActive + this.stats.sunbeamsActive;
  }

  private bindTorch(
    slot: TorchSlot,
    s: SconceSpec,
    now: number,
    seed: number,
    blend: number,
    freezeFlicker: boolean
  ): void {
    const pos = torchWorldPos(s);
    const { nx, nz } = FACE_INTO_ROOM[s.face];
    const flick = torchFlicker(now, seed * 1.7, freezeFlicker);
    slot.point.position.set(pos.x, pos.y, pos.z);
    slot.spot.position.copy(slot.point.position);
    slot.spot.target.position.set(pos.x + nx * 2.4, 0.12, pos.z + nz * 2.4);
    slot.point.intensity = Math.max(SLOT_HOLD, TORCH_INTENSITY * flick * blend);
    slot.spot.intensity = Math.max(SLOT_HOLD, TORCH_SPOT_INTENSITY * flick * blend);
    slot.key = sconceKey(s);
  }

  private bindBeam(spot: THREE.SpotLight, b: SunbeamSpec, blend: number): void {
    spot.position.set(b.wx, CELL, b.wz);
    spot.target.position.set(b.wx, 0.05, b.wz);
    spot.intensity = Math.max(SLOT_HOLD, SUNBEAM_INTENSITY * blend);
  }
}
