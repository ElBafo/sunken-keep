import * as THREE from 'three';
import {
  CELL_SIZE,
  FACE_INTO_ROOM,
  SCONCE_FLICKER,
  SCONCE_RADIUS_TILES,
  SCONCE_WALL_OFFSET_TILES
} from './constants';
import { FloorData, Sconce } from './types';

interface LightSource {
  x: number;
  y: number;
  type: 'party' | 'sconce';
  intensity: number;
}

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

function sconceWorldPos(s: Sconce): SconceWorld {
  const { nx, nz } = FACE_INTO_ROOM[s.face];
  const dist = CELL_SIZE / 2 + SCONCE_WALL_OFFSET_TILES * CELL_SIZE;
  return {
    x: s.x * CELL_SIZE + nx * dist,
    y: CELL_SIZE / 2,
    z: s.y * CELL_SIZE + nz * dist,
    tileX: s.x,
    tileY: s.y
  };
}

export class VertexLightingManager {
  private floorData: FloorData;
  private sconces: readonly Sconce[];
  private partyX: number = 0;
  private partyY: number = 0;
  private faces: CachedFace[] = [];
  private sconceWorld: SconceWorld[] = [];
  private flickerFrame = 0;
  private scratch = new THREE.Vector3();

  constructor(floorData: FloorData, sconces: readonly Sconce[]) {
    this.floorData = floorData;
    this.sconces = sconces;
    this.sconceWorld = sconces.filter((s) => s.lit).map(sconceWorldPos);
  }

  setPartyPosition(x: number, y: number) {
    this.partyX = x;
    this.partyY = y;
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

      let nearSconce = false;
      for (const s of this.sconceWorld) {
        const dx = tileX - s.tileX;
        const dy = tileY - s.tileY;
        if (Math.sqrt(dx * dx + dy * dy) <= radiusTiles) {
          nearSconce = true;
          break;
        }
      }

      this.faces.push({
        mesh: obj,
        worldPos,
        colors: geometry.attributes.color as THREE.BufferAttribute,
        isDark,
        nearSconce
      });
    });
  }

  private getBandedFalloff(distance: number): number {
    const distSquares = Math.floor(distance);
    if (distSquares === 0) return 1.0;
    return Math.pow(0.65, distSquares);
  }

  calculateBrightness(tileX: number, tileY: number, isDark: boolean): number {
    const sources: LightSource[] = [];
    sources.push({ x: this.partyX, y: this.partyY, type: 'party', intensity: 1.0 });
    for (const sconce of this.sconces) {
      if (sconce.lit) {
        sources.push({ x: sconce.x, y: sconce.y, type: 'sconce', intensity: 1.0 });
      }
    }

    let maxBrightness = 0;
    for (const source of sources) {
      const dx = tileX - source.x;
      const dy = tileY - source.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (isDark && source.type === 'sconce') continue;
      maxBrightness = Math.max(maxBrightness, source.intensity * this.getBandedFalloff(distance));
    }
    return Math.min(maxBrightness, 1.0);
  }

  private shadeVertex(
    wx: number,
    wy: number,
    wz: number,
    isDark: boolean,
    flick: number
  ): [number, number, number] {
    const pdx = wx / CELL_SIZE - this.partyX;
    const pdz = wz / CELL_SIZE - this.partyY;
    const partyDist = Math.sqrt(pdx * pdx + pdz * pdz);
    let brightness = this.getBandedFalloff(partyDist);
    let warmth = 0;

    if (partyDist < 2.0) {
      warmth = Math.max(warmth, (1.0 - partyDist / 2.0) * 0.08);
    }

    if (!isDark) {
      const radius = SCONCE_RADIUS_TILES * CELL_SIZE;
      for (const s of this.sconceWorld) {
        const dx = wx - s.x;
        const dy = wy - s.y;
        const dz = wz - s.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist >= radius) continue;
        const t = 1 - dist / radius;
        const w = t * t * (3 - 2 * t) * flick;
        // Torch warms the stone; only a modest brightness lift so the near
        // square stays at the texture's own level.
        brightness = Math.max(brightness, w * 0.4);
        warmth = Math.max(warmth, w);
      }
    }

    brightness = Math.min(brightness, 1.0);
    return [brightness, brightness * (1.0 - warmth * 0.14), brightness * (1.0 - warmth * 0.32)];
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
