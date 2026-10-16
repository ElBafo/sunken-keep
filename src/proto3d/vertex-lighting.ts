import * as THREE from 'three';
import {
  AMBIENT_MIN,
  BRIGHT_MAX,
  BRIGHT_MIN,
  CELL_SIZE,
  DARK_LIGHT_THRESHOLD,
  EMBER_INTENSITY,
  EMBER_RADIUS_TILES,
  FACE_INTO_ROOM,
  FLOOR_AMBIENT,
  LANTERN_CORE_TILES,
  LANTERN_HEIGHT,
  LANTERN_INTENSITY,
  LANTERN_RADIUS_TILES,
  PROP_LANTERN_INTENSITY,
  PROP_LANTERN_RADIUS_TILES,
  WALL_LANTERN_INTENSITY,
  WALL_LANTERN_RADIUS_TILES,
  LIGHT_FLICKER_AMPLITUDE,
  LIGHT_FLICKER_PERIOD_MS,
  CARRIED_TORCH_INTENSITY,
  CARRIED_TORCH_RADIUS_TILES,
  SCONCE_FLICKER,
  SCONCE_FRONT_OFFSET_TILES,
  SCONCE_RADIUS_TILES,
  SUNBEAM_INTENSITY,
  SUNBEAM_RADIUS_TILES,
  TORCH_INTENSITY
} from './constants';
import { DressingMark } from './dressing';
import { isLightPassable, LightReach, partyReach, reachAt, sconceOrigin, sconceReach } from './light-grid';
import { FLOOR_DISK_Y, LightDebugMode, NONFLOOR_HEIGHT_PENALTY, parseLightDebugMode } from './surface-light';
import { FloorData, Sconce } from './types';

interface CachedFace {
  mesh: THREE.Mesh;
  worldPos: Float32Array;
  colors: THREE.BufferAttribute | null;
  isDark: boolean;
  isProp: boolean;
  isWall: boolean;
  nearSconce: boolean;
  tileX: number;
  tileY: number;
  lightGround: boolean;
}

/** Walls, doors, and ceilings share the soft lantern pool (not the floor disk). */
function isWallLike(kind: unknown): boolean {
  if (typeof kind !== 'string') return false;
  return kind === 'wall' || kind === 'secret' || kind === 'ceiling' || kind.startsWith('door');
}

interface SconceWorld {
  x: number;
  y: number;
  z: number;
  tileX: number;
  tileY: number;
  reach: LightReach;
}

const TORCH_RGB: [number, number, number] = [1.0, 0.86, 0.58];
const LANTERN_RGB: [number, number, number] = [0.92, 0.82, 0.64];
const EMBER_RGB: [number, number, number] = [0.55, 0.72, 1.0];
const SUNBEAM_RGB: [number, number, number] = [0.7, 0.84, 1.0];
const AMBIENT_RGB: [number, number, number] = [0.82, 0.86, 0.9];

function sconceWorldPos(s: Sconce): Omit<SconceWorld, 'reach'> {
  const { nx, nz } = FACE_INTO_ROOM[s.face];
  const dist = CELL_SIZE / 2 + SCONCE_FRONT_OFFSET_TILES * CELL_SIZE;
  const origin = sconceOrigin(s);
  return {
    x: s.x * CELL_SIZE + nx * dist,
    y: CELL_SIZE / 2 + 0.1 * CELL_SIZE,
    z: s.y * CELL_SIZE + nz * dist,
    tileX: origin.x,
    tileY: origin.y
  };
}

export function smoothFalloff(distTiles: number, radius: number): number {
  if (radius <= 0 || distTiles >= radius) return 0;
  const t = 1 - distTiles / radius;
  return t * t * (3 - 2 * t);
}

/**
 * Props-only oil lantern: wide quadratic 1−(d/r)². Peak stays on the party
 * square; 1 tile is still most of the peak; the tail fades a bit past 2.
 */
export function lanternFalloff(distTiles: number, radius: number): number {
  if (radius <= 0 || distTiles >= radius) return 0;
  const x = distTiles / radius;
  return 1 - x * x;
}

/**
 * Floors and carried torch: full on the party square, then a steep quartic
 * drop so the middle of the next square is already near-ambient.
 */
export function partyFalloff(distTiles: number, radius: number, coreTiles = LANTERN_CORE_TILES): number {
  if (radius <= 0 || distTiles >= radius) return 0;
  const core = Math.min(coreTiles, radius * 0.45);
  if (distTiles <= core) return 1;
  const t = 1 - (distTiles - core) / (radius - core);
  return t * t * t * t;
}

export function partyDistTiles(
  wx: number,
  wy: number,
  wz: number,
  partyX: number,
  partyY: number,
  opts?: { prop?: boolean; wall?: boolean }
): number {
  const dx = wx / CELL_SIZE - partyX;
  const dz = wz / CELL_SIZE - partyY;
  const horiz = Math.sqrt(dx * dx + dz * dz);
  const dy = (wy - LANTERN_HEIGHT) / CELL_SIZE;
  const d = Math.sqrt(horiz * horiz + dy * dy);
  // Props, walls, and ceilings: true 3D. Never use the floor-disk shortcut —
  // wall quads dip below y 0.28, and treating those verts as floor punched a
  // party-centered dark oval into the mid-wall that slid when strafing.
  if (opts?.prop || opts?.wall) return d;
  // Floor disk: 2D reach. Untagged non-floor verts keep the height penalty.
  if (wy < FLOOR_DISK_Y) return horiz;
  return d + NONFLOOR_HEIGHT_PENALTY;
}

function parseBright(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(BRIGHT_MAX, Math.max(BRIGHT_MIN, value));
}

export class VertexLightingManager {
  private floorData: FloorData;
  private sconces: Sconce[];
  private partyX = 0;
  private partyY = 0;
  private faces: CachedFace[] = [];
  private sconceWorld: SconceWorld[] = [];
  private partyCells: LightReach = new Map();
  private sunbeams: DressingMark[] = [];
  private flickerFrame = 0;
  private flicker = 1;
  private scratch = new THREE.Vector3();
  private floor = 1;
  private bright = 1;
  private oilFn: () => number = () => 1;
  private carriedTorch = false;
  private lightDebug: LightDebugMode = 'final';

  constructor(
    floorData: FloorData,
    sconces: Sconce[],
    opts?: {
      floor?: number;
      bright?: number;
      sunbeams?: DressingMark[];
      oil?: () => number;
    }
  ) {
    this.floorData = floorData;
    this.sconces = sconces;
    this.floor = opts?.floor ?? 1;
    this.bright = parseBright(opts?.bright ?? 1);
    this.sunbeams = opts?.sunbeams ?? [];
    if (opts?.oil) this.oilFn = opts.oil;
    this.rebuildSconceWorld();
  }

  setPartyPosition(x: number, y: number) {
    this.partyX = x;
    this.partyY = y;
    this.rebuildPartyReach();
  }

  setCarriedTorch(on: boolean) {
    if (this.carriedTorch === on) return;
    this.carriedTorch = on;
    this.rebuildPartyReach();
  }

  hasCarriedTorch(): boolean {
    return this.carriedTorch;
  }

  setLightDebug(mode: LightDebugMode) {
    this.lightDebug = parseLightDebugMode(mode) ?? mode;
    for (const face of this.faces) this.bakeFace(face, this.flicker);
  }

  getLightDebug(): LightDebugMode {
    return this.lightDebug;
  }

  setBright(value: number) {
    this.bright = parseBright(value);
  }

  getAmbientFloor(): number {
    return this.floor;
  }

  setAmbientFloor(floor: number) {
    const max = FLOOR_AMBIENT.length - 1;
    this.floor = Math.max(1, Math.min(max, Math.floor(floor)));
  }

  setSunbeams(sunbeams: DressingMark[]) {
    this.sunbeams = sunbeams;
  }

  /** Call after a torch lights or goes out so pools and flicker sets stay in sync. */
  relight() {
    this.rebuildSconceWorld();
    const radiusTiles = SCONCE_RADIUS_TILES + 1;
    for (const face of this.faces) {
      const { tileX, tileY } = this.lightTileOf(face.mesh);
      face.tileX = tileX;
      face.tileY = tileY;
      face.nearSconce = this.nearAnySconce(tileX, tileY, radiusTiles);
    }
    this.updateAllMeshes();
  }

  registerScene(scene: THREE.Scene) {
    this.faces = [];
    const radiusTiles = SCONCE_RADIUS_TILES + 1;
    if (!scene.getObjectByName('proto3d-vertex-ambient')) {
      const ambient = new THREE.AmbientLight(0xffffff, 1);
      ambient.name = 'proto3d-vertex-ambient';
      scene.add(ambient);
    }

    // Nested door groups store translation/rotation on a parent holder, not the
    // mesh. updateMatrixWorld(true) on the mesh alone does not refresh ancestors,
    // so vertices were cached in local space near the origin. Walking east toward
    // a door then darkened the whole block (party moved *away* from that origin).
    scene.updateMatrixWorld(true);

    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.geometry.attributes.position) return;
      if (obj.userData.isSprite || obj.userData.skipVertexLighting || obj instanceof THREE.Sprite) {
        return;
      }

      obj.updateWorldMatrix(true, false);
      const geometry = obj.geometry;
      const { tileX, tileY } = this.lightTileOf(obj);
      const tile = this.floorData.tiles[tileY]?.[tileX];
      const isDark = tile?.floorNDark || false;
      const isWall = isWallLike(obj.userData.kind);
      const lightGround = !!obj.userData.lightGround || !!obj.userData.rubble;

      if (!geometry.attributes.color) {
        const colors = new Float32Array(geometry.attributes.position.count * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }

      if (
        obj.material instanceof THREE.MeshBasicMaterial ||
        obj.material instanceof THREE.MeshLambertMaterial ||
        obj.material instanceof THREE.MeshStandardMaterial
      ) {
        obj.material.vertexColors = true;
        obj.material.needsUpdate = true;
      }

      const pos = geometry.attributes.position;
      const worldPos = new Float32Array(pos.count * 3);
      const v = this.scratch;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
        worldPos[i * 3] = v.x;
        worldPos[i * 3 + 1] = v.y;
        worldPos[i * 3 + 2] = v.z;
      }

      this.faces.push({
        mesh: obj,
        worldPos,
        colors: geometry.attributes.color as THREE.BufferAttribute,
        isDark,
        isProp: !!obj.userData.lanternProp,
        isWall,
        nearSconce: this.nearAnySconce(tileX, tileY, radiusTiles),
        tileX,
        tileY,
        lightGround
      });
    });
  }

  private rebuildSconceWorld() {
    this.sconceWorld = this.sconces
      .filter((s) => s.lit)
      .map((s) => ({ ...sconceWorldPos(s), reach: sconceReach(this.floorData, s) }));
    this.rebuildPartyReach();
  }

  private rebuildPartyReach() {
    const radius = Math.max(
      this.lanternSpec().radius,
      this.oilFn() > 0 ? Math.max(PROP_LANTERN_RADIUS_TILES, WALL_LANTERN_RADIUS_TILES) : 0,
      this.carriedTorch ? CARRIED_TORCH_RADIUS_TILES : 0
    );
    this.partyCells = partyReach(this.floorData, this.partyX, this.partyY, radius);
  }

  private nearAnySconce(tileX: number, tileY: number, _radiusTiles: number): boolean {
    for (const s of this.sconceWorld) {
      if (reachAt(s.reach, tileX, tileY) !== undefined) return true;
    }
    return false;
  }

  private floorAmbient(): number {
    const v = FLOOR_AMBIENT[this.floor] ?? FLOOR_AMBIENT[FLOOR_AMBIENT.length - 1];
    return Math.max(AMBIENT_MIN, v);
  }

  private lanternSpec(): { radius: number; intensity: number; rgb: [number, number, number] } {
    if (this.oilFn() > 0) {
      return { radius: LANTERN_RADIUS_TILES, intensity: LANTERN_INTENSITY, rgb: LANTERN_RGB };
    }
    return { radius: EMBER_RADIUS_TILES, intensity: EMBER_INTENSITY, rgb: EMBER_RGB };
  }

  /**
   * Gameplay / monster-visibility tile-light (no ambient, no sunbeam).
   * One source wins via Math.max — never the wall/floor/ceiling screen-blend.
   */
  sourceLight(tileX: number, tileY: number): number {
    const wx = tileX * CELL_SIZE;
    const wy = 0.08;
    const wz = tileY * CELL_SIZE;
    const lantern = this.lanternSpec();
    const partyDist = partyDistTiles(wx, wy, wz, this.partyX, this.partyY);
    let maxW = 0;
    if (reachAt(this.partyCells, tileX, tileY) !== undefined) {
      maxW = lantern.intensity * partyFalloff(partyDist, lantern.radius);
      if (this.carriedTorch) {
        maxW = Math.max(maxW, CARRIED_TORCH_INTENSITY * partyFalloff(partyDist, CARRIED_TORCH_RADIUS_TILES));
      }
    }
    const radius = SCONCE_RADIUS_TILES * CELL_SIZE;
    for (const s of this.sconceWorld) {
      if (reachAt(s.reach, tileX, tileY) === undefined) continue;
      const dx = wx - s.x;
      const dy = wy - s.y;
      const dz = wz - s.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist >= radius) continue;
      maxW = Math.max(maxW, TORCH_INTENSITY * smoothFalloff(dist / CELL_SIZE, SCONCE_RADIUS_TILES));
    }
    return maxW * this.bright;
  }

  isSquareLit(tileX: number, tileY: number): boolean {
    return this.sourceLight(tileX, tileY) >= DARK_LIGHT_THRESHOLD;
  }

  calculateBrightness(tileX: number, tileY: number, isDark: boolean): number {
    const wx = tileX * CELL_SIZE;
    const wz = tileY * CELL_SIZE;
    const [r, g, b] = this.shadeVertex(wx, 0.08, wz, tileX, tileY, isDark, 1);
    return (r + g + b) / 3;
  }

  /** Shade a world-space point (desk tops, lamp stems) for tests and debug. */
  sampleVertex(
    wx: number,
    wy: number,
    wz: number,
    tileX: number,
    tileY: number,
    isDark = false,
    isProp = false,
    isWall = false
  ): { rgb: [number, number, number]; luma: number } {
    const rgb = this.shadeVertex(wx, wy, wz, tileX, tileY, isDark, 1, isProp, isWall);
    return { rgb, luma: (rgb[0] + rgb[1] + rgb[2]) / 3 };
  }

  /** Table fill only (no torch, lantern, or sunbeam) after ?bright=. */
  ambientBrightness(): number {
    const a = this.floorAmbient();
    const avg = (AMBIENT_RGB[0] + AMBIENT_RGB[1] + AMBIENT_RGB[2]) / 3;
    return Math.min(1, a * avg * this.bright);
  }

  /** Props / gameplay: one light wins. */
  private maxAccum(
    rgb: [number, number, number],
    weight: number,
    color: [number, number, number]
  ) {
    if (weight <= 0) return;
    rgb[0] = Math.max(rgb[0], weight * color[0]);
    rgb[1] = Math.max(rgb[1], weight * color[1]);
    rgb[2] = Math.max(rgb[2], weight * color[2]);
  }

  /** Wall/floor/ceiling: lantern and torch screen-combine so the seam does not go dark. */
  private screenAccum(
    rgb: [number, number, number],
    weight: number,
    color: [number, number, number]
  ) {
    if (weight <= 0) return;
    rgb[0] = 1 - (1 - rgb[0]) * (1 - Math.min(1, weight * color[0]));
    rgb[1] = 1 - (1 - rgb[1]) * (1 - Math.min(1, weight * color[1]));
    rgb[2] = 1 - (1 - rgb[2]) * (1 - Math.min(1, weight * color[2]));
  }

  private shadeVertex(
    wx: number,
    wy: number,
    wz: number,
    tileX: number,
    tileY: number,
    isDark: boolean,
    flick: number,
    isProp = false,
    isWall = false
  ): [number, number, number] {
    if (this.lightDebug === 'albedo') return [1, 1, 1];
    const ambient = this.floorAmbient();
    const ambientRgb: [number, number, number] = [
      ambient * AMBIENT_RGB[0],
      ambient * AMBIENT_RGB[1],
      ambient * AMBIENT_RGB[2]
    ];
    const skipLantern = this.lightDebug === 'torch' || this.lightDebug === 'ambient';
    const skipTorch = this.lightDebug === 'lantern' || this.lightDebug === 'ambient';
    const skipAmbient = this.lightDebug === 'lantern' || this.lightDebug === 'torch';
    // Screen-combine lantern + torch on wall/floor/ceiling shading only.
    // Lantern props keep max(). Gameplay tile-light is sourceLight() (max()).
    const geometry = !isProp;
    const rgb: [number, number, number] = geometry ? [0, 0, 0] : [ambientRgb[0], ambientRgb[1], ambientRgb[2]];
    const add = (weight: number, color: [number, number, number]) => {
      if (geometry) this.screenAccum(rgb, weight, color);
      else this.maxAccum(rgb, weight, color);
    };

    const lantern = this.lanternSpec();
    const partyDist = partyDistTiles(wx, wy, wz, this.partyX, this.partyY, {
      prop: isProp,
      wall: isWall
    });
    if (!skipLantern && reachAt(this.partyCells, tileX, tileY) !== undefined) {
      if (isProp && this.oilFn() > 0) {
        add(PROP_LANTERN_INTENSITY * lanternFalloff(partyDist, PROP_LANTERN_RADIUS_TILES), lantern.rgb);
      } else if (isWall) {
        const wallRadius = this.oilFn() > 0 ? WALL_LANTERN_RADIUS_TILES : lantern.radius;
        const wallIntensity = this.oilFn() > 0 ? WALL_LANTERN_INTENSITY : lantern.intensity;
        add(wallIntensity * smoothFalloff(partyDist, wallRadius), lantern.rgb);
      } else {
        add(lantern.intensity * partyFalloff(partyDist, lantern.radius), lantern.rgb);
      }
      if (this.carriedTorch) {
        add(CARRIED_TORCH_INTENSITY * partyFalloff(partyDist, CARRIED_TORCH_RADIUS_TILES), TORCH_RGB);
      }
    }

    if (!skipTorch && !isDark) {
      const radius = SCONCE_RADIUS_TILES * CELL_SIZE;
      for (const s of this.sconceWorld) {
        if (reachAt(s.reach, tileX, tileY) === undefined) continue;
        const dx = wx - s.x;
        const dy = wy - s.y;
        const dz = wz - s.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist >= radius) continue;
        const w = TORCH_INTENSITY * smoothFalloff(dist / CELL_SIZE, SCONCE_RADIUS_TILES) * flick;
        add(w, TORCH_RGB);
      }

      for (const beam of this.sunbeams) {
        const dx = wx / CELL_SIZE - beam.x;
        const dz = wz / CELL_SIZE - beam.y;
        const dist = Math.sqrt(dx * dx + dz * dz);
        add(SUNBEAM_INTENSITY * smoothFalloff(dist, SUNBEAM_RADIUS_TILES), SUNBEAM_RGB);
      }
    }

    // Lighting factor for MeshBasic (texture × this). Ambient floors the
    // factor, it is never added onto albedo (that would lift mortar gaps).
    const lit: [number, number, number] = geometry && !skipAmbient
      ? [
          Math.max(ambientRgb[0], rgb[0]),
          Math.max(ambientRgb[1], rgb[1]),
          Math.max(ambientRgb[2], rgb[2])
        ]
      : rgb;
    const mul = this.bright;
    return [
      Math.min(1, lit[0] * mul),
      Math.min(1, lit[1] * mul),
      Math.min(1, lit[2] * mul)
    ];
  }

  private lightTileOf(obj: THREE.Object3D): { tileX: number; tileY: number } {
    let tileX =
      typeof obj.userData.lightX === 'number'
        ? obj.userData.lightX
        : Math.round(obj.position.x / CELL_SIZE);
    let tileY =
      typeof obj.userData.lightY === 'number'
        ? obj.userData.lightY
        : Math.round(obj.position.z / CELL_SIZE);
    if (!isLightPassable(this.floorData.tiles[tileY]?.[tileX])) {
      const face = obj.userData.face as keyof typeof FACE_INTO_ROOM | undefined;
      const into = face ? FACE_INTO_ROOM[face] : undefined;
      if (into) {
        const nx = (typeof obj.userData.cellX === 'number' ? obj.userData.cellX : tileX) + into.nx;
        const ny = (typeof obj.userData.cellY === 'number' ? obj.userData.cellY : tileY) + into.nz;
        if (isLightPassable(this.floorData.tiles[ny]?.[nx])) {
          tileX = nx;
          tileY = ny;
        }
      }
    }
    return { tileX, tileY };
  }

  private bakeFace(face: CachedFace, flick: number) {
    const { worldPos, colors } = face;
    if (!colors) return;
    const n = colors.count;
    const groundX = face.tileX * CELL_SIZE;
    const groundZ = face.tileY * CELL_SIZE;
    for (let i = 0; i < n; i++) {
      const [r, g, b] = this.shadeVertex(
        face.lightGround ? groundX : worldPos[i * 3],
        face.lightGround ? 0.08 : worldPos[i * 3 + 1],
        face.lightGround ? groundZ : worldPos[i * 3 + 2],
        face.tileX,
        face.tileY,
        face.isDark,
        flick,
        face.isProp,
        face.isWall
      );
      colors.setXYZ(i, r, g, b);
    }
    colors.needsUpdate = true;
  }

  updateAllMeshes(_scene?: THREE.Scene) {
    this.rebuildPartyReach();
    for (const face of this.faces) {
      this.bakeFace(face, this.flicker);
    }
  }

  /** Pin a flame-frame multiplier for e2e measurement. */
  setFlickerFrame(frame: number) {
    const wrapped = ((frame % SCONCE_FLICKER.length) + SCONCE_FLICKER.length) % SCONCE_FLICKER.length;
    const next = SCONCE_FLICKER[wrapped];
    if (wrapped === this.flickerFrame && next === this.flicker) return;
    this.flickerFrame = wrapped;
    this.flicker = next;
    for (const face of this.faces) {
      if (!face.nearSconce) continue;
      this.bakeFace(face, this.flicker);
    }
  }

  /** Slow ±3% sine on torch warmth; skip if the quantized value has not moved. */
  setFlickerTime(now: number) {
    const wave = Math.sin((now * 2 * Math.PI) / LIGHT_FLICKER_PERIOD_MS);
    const next = 1 + LIGHT_FLICKER_AMPLITUDE * wave;
    const q = Math.round(next * 200) / 200;
    if (q === this.flicker) return;
    this.flicker = q;
    for (const face of this.faces) {
      if (!face.nearSconce) continue;
      this.bakeFace(face, this.flicker);
    }
  }
}
