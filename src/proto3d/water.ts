import * as THREE from 'three';
import {
  CELL_SIZE,
  FACE_INTO_ROOM,
  FACE_SEGMENTS,
  WATER_SURFACE_FPS,
  WATER_SURFACE_Y,
  isWaterTile
} from './constants';
import { DressingMark } from './dressing';
import { flipUVsX, floorFlipX, floorQuarterTurns, rotateUVs } from './texture-variants';
import { FloorData, Sconce, Tile } from './types';

const SURFACE_RENDER_ORDER = 2;
const GLINT_RENDER_ORDER = 3;

function configureMap(tex: THREE.Texture, wrap: THREE.Wrapping) {
  tex.colorSpace = THREE.SRGBColorSpace;
  (tex as any).encoding = 3001;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  tex.needsUpdate = true;
}

function makeGlintTexture(): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
  g.addColorStop(0, 'rgba(255, 236, 176, 0.95)');
  g.addColorStop(0.35, 'rgba(186, 214, 168, 0.4)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

interface WaterSurface {
  mat: THREE.MeshBasicMaterial;
  deep: boolean;
}

export class WaterSystem {
  private shallowMaps: THREE.Texture[] = [];
  private deepMaps: THREE.Texture[] = [];
  private surfaces: WaterSurface[] = [];
  private glints: Array<{ mesh: THREE.Mesh; base: number; phase: number }> = [];
  private frame = 0;
  private lastFrameAt = 0;
  private glintMap: THREE.Texture | null = null;
  private placeGlint: ((x: number, y: number, scale: number, phase: number) => void) | null = null;

  async load(): Promise<void> {
    const loader = new THREE.TextureLoader();
    const baseUrl = import.meta.env.BASE_URL;
    const load = (path: string, wrap: THREE.Wrapping): Promise<THREE.Texture> =>
      new Promise((resolve, reject) => {
        loader.load(
          `${baseUrl}${path}`,
          (tex) => {
            configureMap(tex, wrap);
            resolve(tex);
          },
          undefined,
          reject
        );
      });

    this.shallowMaps = await Promise.all(
      [1, 2, 3, 4].map((n) => load(`proto3d/tex3d/water/water_surface_${n}.png`, THREE.RepeatWrapping))
    );
    this.deepMaps = await Promise.all(
      [1, 2, 3, 4].map((n) => load(`proto3d/tex3d/water/water_surface_deep_${n}.png`, THREE.RepeatWrapping))
    );
    this.glintMap = makeGlintTexture();
  }

  build(scene: THREE.Scene, floorData: FloorData, sconces: readonly Sconce[], sunbeams: DressingMark[]) {
    const { tiles, width, height } = floorData;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        if (!isWaterTile(tile)) continue;
        this.addSurface(scene, tile, x, y);
      }
    }
    this.addGlints(scene, floorData, sconces, sunbeams);
  }

  private addSurface(scene: THREE.Scene, tile: Tile, x: number, y: number) {
    const deep = !!tile.deepWater;
    const maps = deep ? this.deepMaps : this.shallowMaps;
    const geo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE, FACE_SEGMENTS, FACE_SEGMENTS);
    rotateUVs(geo, floorQuarterTurns(x, y, 'W'));
    if (floorFlipX(x, y, 'W')) flipUVsX(geo);
    const mat = new THREE.MeshBasicMaterial({
      map: maps[0],
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x * CELL_SIZE, WATER_SURFACE_Y, y * CELL_SIZE);
    mesh.renderOrder = SURFACE_RENDER_ORDER;
    mesh.userData.lightX = x;
    mesh.userData.lightY = y;
    mesh.userData.kind = 'water-surface';
    mesh.userData.deep = deep;
    scene.add(mesh);
    this.surfaces.push({ mat, deep });
  }

  private addGlints(
    scene: THREE.Scene,
    floorData: FloorData,
    sconces: readonly Sconce[],
    sunbeams: DressingMark[]
  ) {
    if (!this.glintMap) return;
    const seen = new Set<string>();
    const place = (x: number, y: number, scale: number, phase: number) => {
      const tile = floorData.tiles[y]?.[x];
      if (!tile || !isWaterTile(tile)) return;
      const key = `${x},${y}`;
      if (seen.has(key)) return;
      seen.add(key);
      const mat = new THREE.MeshBasicMaterial({
        map: this.glintMap!,
        color: 0xffe8a8,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        fog: true,
        toneMapped: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x * CELL_SIZE, WATER_SURFACE_Y + 0.01, y * CELL_SIZE);
      mesh.renderOrder = GLINT_RENDER_ORDER;
      mesh.userData.skipVertexLighting = true;
      mesh.userData.noPick = true;
      mesh.userData.kind = 'water-glint';
      scene.add(mesh);
      this.glints.push({ mesh, base: 0.42, phase });
    };

    sunbeams.forEach((beam, i) => place(beam.x, beam.y, CELL_SIZE * 0.7, i * 1.7));

    for (const sconce of sconces) {
      if (!sconce.lit) continue;
      const { nx, nz } = FACE_INTO_ROOM[sconce.face];
      place(sconce.x + Math.round(nx), sconce.y + Math.round(nz), CELL_SIZE * 0.45, sconce.x + sconce.y);
    }
    this.placeGlint = place;
  }

  addSconceGlint(sconce: Sconce) {
    if (!sconce.lit || !this.placeGlint) return;
    const { nx, nz } = FACE_INTO_ROOM[sconce.face];
    this.placeGlint(
      sconce.x + Math.round(nx),
      sconce.y + Math.round(nz),
      CELL_SIZE * 0.45,
      sconce.x + sconce.y
    );
  }

  update(now: number) {
    const frameMs = 1000 / WATER_SURFACE_FPS;
    if (!this.lastFrameAt) this.lastFrameAt = now;
    if (now - this.lastFrameAt >= frameMs) {
      this.frame = (this.frame + 1) % 4;
      this.lastFrameAt = now;
      for (const surface of this.surfaces) {
        surface.mat.map = (surface.deep ? this.deepMaps : this.shallowMaps)[this.frame];
        surface.mat.needsUpdate = true;
      }
    }

    for (const g of this.glints) {
      (g.mesh.material as THREE.MeshBasicMaterial).opacity = g.base;
    }
  }
}
