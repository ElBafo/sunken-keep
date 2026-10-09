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
  SCONCE_FLICKER,
  SCONCE_FRONT_OFFSET_TILES,
  SCONCE_RADIUS_TILES,
  SUNBEAM_INTENSITY,
  SUNBEAM_RADIUS_TILES,
  TORCH_INTENSITY
} from './constants';
import { DressingMark } from './dressing';
import { FloorData, Sconce } from './types';

interface CachedFace {
  mesh: THREE.Mesh;
  worldPos: Float32Array;
  colors: THREE.BufferAttribute;
  isDark: boolean;
  nearSconce: boolean;
}

interface SconceWorld {
  x: number;
  y: number;
  z: number;
  tileX: number;
  tileY: number;
}

const TORCH_RGB: [number, number, number] = [1.0, 0.86, 0.58];
const LANTERN_RGB: [number, number, number] = [0.92, 0.82, 0.64];
const EMBER_RGB: [number, number, number] = [0.55, 0.72, 1.0];
const SUNBEAM_RGB: [number, number, number] = [0.7, 0.84, 1.0];
const AMBIENT_RGB: [number, number, number] = [0.82, 0.86, 0.9];

function sconceWorldPos(s: Sconce): SconceWorld {
  const { nx, nz } = FACE_INTO_ROOM[s.face];
  const dist = CELL_SIZE / 2 + SCONCE_FRONT_OFFSET_TILES * CELL_SIZE;
  return {
    x: s.x * CELL_SIZE + nx * dist,
    y: CELL_SIZE / 2 + 0.1 * CELL_SIZE,
    z: s.y * CELL_SIZE + nz * dist,
    tileX: s.x,
    tileY: s.y
  };
}

function smoothFalloff(distTiles: number, radius: number): number {
  if (radius <= 0 || distTiles >= radius) return 0;
  const t = 1 - distTiles / radius;
  return t * t * (3 - 2 * t);
}

/**
 * Lantern / ember: full on the party's own square, then a steep quartic drop
 * so the middle of the next square is already near-ambient (oil ~1.5 tiles,
 * ember ~1.1). Walls and ceiling use 3D distance and fall off with height.
 */
function partyFalloff(distTiles: number, radius: number, coreTiles = LANTERN_CORE_TILES): number {
  if (radius <= 0 || distTiles >= radius) return 0;
  const core = Math.min(coreTiles, radius * 0.45);
  if (distTiles <= core) return 1;
  const t = 1 - (distTiles - core) / (radius - core);
  return t * t * t * t;
}

function partyDistTiles(wx: number, wy: number, wz: number, partyX: number, partyY: number): number {
  const dx = wx / CELL_SIZE - partyX;
  const dz = wz / CELL_SIZE - partyY;
  const horiz = Math.sqrt(dx * dx + dz * dz);
  // Floor disk: 2D reach. Walls and ceiling pay extra so they die past the puddle.
  if (wy < 0.28) return horiz;
  const dy = (wy - LANTERN_HEIGHT) / CELL_SIZE;
  return Math.sqrt(horiz * horiz + dy * dy) + 0.55;
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
  private sunbeams: DressingMark[] = [];
  private flickerFrame = 0;
  private scratch = new THREE.Vector3();
  private floor = 1;
  private bright = 1;
  private oilFn: () => number = () => 1;

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
      const tileX =
        typeof face.mesh.userData.lightX === 'number'
          ? face.mesh.userData.lightX
          : Math.round(face.mesh.position.x / CELL_SIZE);
      const tileY =
        typeof face.mesh.userData.lightY === 'number'
          ? face.mesh.userData.lightY
          : Math.round(face.mesh.position.z / CELL_SIZE);
      face.nearSconce = this.nearAnySconce(tileX, tileY, radiusTiles);
    }
    this.updateAllMeshes();
  }

  registerScene(scene: THREE.Scene) {
    this.faces = [];
    const radiusTiles = SCONCE_RADIUS_TILES + 1;

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
      if (!geometry.attributes.color) {
        const colors = new Float32Array(geometry.attributes.position.count * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }

      if (obj.material instanceof THREE.MeshBasicMaterial) {
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

      const tileX =
        typeof obj.userData.lightX === 'number'
          ? obj.userData.lightX
          : Math.round(obj.position.x / CELL_SIZE);
      const tileY =
        typeof obj.userData.lightY === 'number'
          ? obj.userData.lightY
          : Math.round(obj.position.z / CELL_SIZE);
      const tile = this.floorData.tiles[tileY]?.[tileX];
      const isDark = tile?.floorNDark || false;

      this.faces.push({
        mesh: obj,
        worldPos,
        colors: geometry.attributes.color as THREE.BufferAttribute,
        isDark,
        nearSconce: this.nearAnySconce(tileX, tileY, radiusTiles)
      });
    });
  }

  private rebuildSconceWorld() {
    this.sconceWorld = this.sconces.filter((s) => s.lit).map(sconceWorldPos);
  }

  private nearAnySconce(tileX: number, tileY: number, radiusTiles: number): boolean {
    for (const s of this.sconceWorld) {
      const dx = tileX - s.tileX;
      const dy = tileY - s.tileY;
      if (Math.sqrt(dx * dx + dy * dy) <= radiusTiles) return true;
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

  /** Combined torch + lantern weight at a tile (no ambient, no sunbeam). */
  sourceLight(tileX: number, tileY: number): number {
    const wx = tileX * CELL_SIZE;
    const wy = 0.08;
    const wz = tileY * CELL_SIZE;
    const lantern = this.lanternSpec();
    const partyDist = partyDistTiles(wx, wy, wz, this.partyX, this.partyY);
    let maxW = lantern.intensity * partyFalloff(partyDist, lantern.radius);
    const radius = SCONCE_RADIUS_TILES * CELL_SIZE;
    for (const s of this.sconceWorld) {
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
    const [r, g, b] = this.shadeVertex(wx, 0.08, wz, isDark, 1);
    return (r + g + b) / 3;
  }

  /** Table fill only (no torch, lantern, or sunbeam) after ?bright=. */
  ambientBrightness(): number {
    const a = this.floorAmbient();
    const avg = (AMBIENT_RGB[0] + AMBIENT_RGB[1] + AMBIENT_RGB[2]) / 3;
    return Math.min(1, a * avg * this.bright);
  }

  private accum(
    rgb: [number, number, number],
    weight: number,
    color: [number, number, number]
  ) {
    if (weight <= 0) return;
    rgb[0] = Math.max(rgb[0], weight * color[0]);
    rgb[1] = Math.max(rgb[1], weight * color[1]);
    rgb[2] = Math.max(rgb[2], weight * color[2]);
  }

  private shadeVertex(
    wx: number,
    wy: number,
    wz: number,
    isDark: boolean,
    flick: number
  ): [number, number, number] {
    const ambient = this.floorAmbient();
    const rgb: [number, number, number] = [
      ambient * AMBIENT_RGB[0],
      ambient * AMBIENT_RGB[1],
      ambient * AMBIENT_RGB[2]
    ];

    const lantern = this.lanternSpec();
    const partyDist = partyDistTiles(wx, wy, wz, this.partyX, this.partyY);
    this.accum(rgb, lantern.intensity * partyFalloff(partyDist, lantern.radius), lantern.rgb);

    if (!isDark) {
      const radius = SCONCE_RADIUS_TILES * CELL_SIZE;
      for (const s of this.sconceWorld) {
        const dx = wx - s.x;
        const dy = wy - s.y;
        const dz = wz - s.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist >= radius) continue;
        const w = TORCH_INTENSITY * smoothFalloff(dist / CELL_SIZE, SCONCE_RADIUS_TILES) * flick;
        this.accum(rgb, w, TORCH_RGB);
      }

      for (const beam of this.sunbeams) {
        const dx = wx / CELL_SIZE - beam.x;
        const dz = wz / CELL_SIZE - beam.y;
        const dist = Math.sqrt(dx * dx + dz * dz);
        this.accum(rgb, SUNBEAM_INTENSITY * smoothFalloff(dist, SUNBEAM_RADIUS_TILES), SUNBEAM_RGB);
      }
    }

    const mul = this.bright;
    return [
      Math.min(1, rgb[0] * mul),
      Math.min(1, rgb[1] * mul),
      Math.min(1, rgb[2] * mul)
    ];
  }

  private bakeFace(face: CachedFace, flick: number) {
    const { worldPos, colors } = face;
    const n = colors.count;
    for (let i = 0; i < n; i++) {
      const [r, g, b] = this.shadeVertex(
        worldPos[i * 3],
        worldPos[i * 3 + 1],
        worldPos[i * 3 + 2],
        face.isDark,
        flick
      );
      colors.setXYZ(i, r, g, b);
    }
    colors.needsUpdate = true;
  }

  updateAllMeshes(_scene?: THREE.Scene) {
    const flick = SCONCE_FLICKER[this.flickerFrame % SCONCE_FLICKER.length];
    for (const face of this.faces) {
      this.bakeFace(face, flick);
    }
  }

  /** Rebake only faces near lit sconces (flame-frame flicker). */
  setFlickerFrame(frame: number) {
    const wrapped = ((frame % SCONCE_FLICKER.length) + SCONCE_FLICKER.length) % SCONCE_FLICKER.length;
    if (wrapped === this.flickerFrame) return;
    this.flickerFrame = wrapped;
    const flick = SCONCE_FLICKER[this.flickerFrame];
    for (const face of this.faces) {
      if (face.nearSconce) this.bakeFace(face, flick);
    }
  }
}
