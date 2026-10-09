import * as THREE from 'three';
import { CELL_SIZE, CUTOUT_ALPHA_TEST, FACE_SEGMENTS } from './constants';
import {
  flipUVsX,
  floorFlipX,
  floorQuarterTurns,
  listedTex3dFiles,
  pickVariantIndex,
  rotateUVs,
  VARIANT_SURFACES,
  variantFilenames,
  VariantSurface
} from './texture-variants';
import { FloorData, Tile } from './types';

type TexOpts = {
  wrapS: THREE.Wrapping;
  wrapT: THREE.Wrapping;
  mipmaps: boolean;
};

export class SceneBuilder {
  private variants = new Map<VariantSurface, THREE.Texture[]>();
  private doorLocked: THREE.Texture | null = null;
  private doorOpen: THREE.Texture | null = null;
  private secretClosed: THREE.Texture | null = null;
  private secretOpen: THREE.Texture | null = null;

  async loadTextures(): Promise<void> {
    const loader = new THREE.TextureLoader();
    const baseUrl = import.meta.env.BASE_URL;
    const files = listedTex3dFiles();

    const loadTex = (path: string, opts: TexOpts): Promise<THREE.Texture> => {
      return new Promise((resolve, reject) => {
        loader.load(
          `${baseUrl}${path}`,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            (tex as any).encoding = 3001;
            tex.magFilter = THREE.NearestFilter;
            tex.generateMipmaps = opts.mipmaps;
            tex.minFilter = opts.mipmaps
              ? THREE.NearestMipmapNearestFilter
              : THREE.NearestFilter;
            tex.wrapS = opts.wrapS;
            tex.wrapT = opts.wrapT;
            tex.needsUpdate = true;
            resolve(tex);
          },
          undefined,
          (err) => reject(err)
        );
      });
    };

    const wall: TexOpts = {
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      mipmaps: false
    };
    const floor: TexOpts = {
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      mipmaps: true
    };
    const cutout: TexOpts = {
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      mipmaps: false
    };

    const optsFor = (surface: VariantSurface): TexOpts =>
      surface.startsWith('wall') ? wall : floor;

    await Promise.all(
      VARIANT_SURFACES.map(async (surface) => {
        const names = variantFilenames(surface, files);
        const loaded = await Promise.all(
          names.map((n) => loadTex(`proto3d/tex3d/${n}`, optsFor(surface)))
        );
        this.variants.set(surface, loaded);
      })
    );

    const [doorLocked, doorOpen, secretClosed, secretOpen] = await Promise.all([
      loadTex('proto3d/tex3d/door_locked.png', wall),
      loadTex('proto3d/tex3d/door_open.png', cutout),
      loadTex('proto3d/tex3d/secret_closed.png', wall),
      loadTex('proto3d/tex3d/secret_open.png', cutout)
    ]);
    this.doorLocked = doorLocked;
    this.doorOpen = doorOpen;
    this.secretClosed = secretClosed;
    this.secretOpen = secretOpen;

    console.log('All textures loaded successfully');
  }

  private pick(surface: VariantSurface, x: number, y: number, face: string): THREE.Texture {
    const list = this.variants.get(surface);
    if (!list || list.length === 0) {
      throw new Error(`No textures loaded for ${surface}`);
    }
    return list[pickVariantIndex(list.length, x, y, face)];
  }

  buildScene(scene: THREE.Scene, floorData: FloorData) {
    const group = new THREE.Group();
    this.buildFloorAndCeiling(group, floorData);
    this.buildWalls(group, floorData);
    scene.add(group);
    return group;
  }

  buildFloorAndCeiling(group: THREE.Group, floorData: FloorData) {
    const { tiles, width, height } = floorData;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        if (tile.wall || tile.secret) continue;

        const wx = x * CELL_SIZE;
        const wz = y * CELL_SIZE;

        const isWater = tile.deepWater || tile.shallowWater;
        const floorTex = this.pick(isWater ? 'floor_water' : 'floor_stone', x, y, 'F');
        const floorY = isWater ? -0.15 : 0;

        const floorGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE, FACE_SEGMENTS, FACE_SEGMENTS);
        rotateUVs(floorGeo, floorQuarterTurns(x, y, 'F'));
        if (floorFlipX(x, y, 'F')) flipUVsX(floorGeo);
        const floorMat = new THREE.MeshBasicMaterial({
          map: floorTex,
          vertexColors: true,
          side: THREE.DoubleSide
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(wx, floorY, wz);
        floor.userData.lightX = x;
        floor.userData.lightY = y;
        group.add(floor);

        const ceilingGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE, FACE_SEGMENTS, FACE_SEGMENTS);
        rotateUVs(ceilingGeo, floorQuarterTurns(x, y, 'C'));
        if (floorFlipX(x, y, 'C')) flipUVsX(ceilingGeo);
        const ceilingMat = new THREE.MeshBasicMaterial({
          map: this.pick('ceiling', x, y, 'C'),
          vertexColors: true,
          side: THREE.DoubleSide
        });
        const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(wx, CELL_SIZE, wz);
        ceiling.userData.lightX = x;
        ceiling.userData.lightY = y;
        group.add(ceiling);
      }
    }
  }

  buildWalls(group: THREE.Group, floorData: FloorData) {
    const { tiles, width, height } = floorData;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        if (!tile.wall && !tile.door && !tile.secret) continue;

        const wx = x * CELL_SIZE;
        const wz = y * CELL_SIZE;

        this.buildWallFace(group, tiles, x, y, width, height, wx, wz, 0, -1, 'N', tile);
        this.buildWallFace(group, tiles, x, y, width, height, wx, wz, 1, 0, 'E', tile);
        this.buildWallFace(group, tiles, x, y, width, height, wx, wz, 0, 1, 'S', tile);
        this.buildWallFace(group, tiles, x, y, width, height, wx, wz, -1, 0, 'W', tile);
      }
    }
  }

  buildWallFace(
    group: THREE.Group,
    tiles: Tile[][],
    x: number,
    y: number,
    width: number,
    height: number,
    wx: number,
    wz: number,
    dx: number,
    dz: number,
    face: string,
    tile: Tile
  ) {
    const nx = x + dx;
    const nz = y + dz;

    if (nx < 0 || nx >= width || nz < 0 || nz >= height) return;
    const neighbor = tiles[nz][nx];
    if (neighbor.wall || neighbor.door || neighbor.secret) return;

    let texture: THREE.Texture = this.pick('wall_plain', x, y, face);
    let cutout = false;

    if (tile.door) {
      if (tile.doorLocked) {
        texture = this.doorLocked!;
      } else {
        texture = this.doorOpen!;
        cutout = true;
      }
    } else if (tile.secret) {
      if (tile.secretOpen) {
        texture = this.secretOpen!;
        cutout = true;
      } else {
        texture = this.secretClosed!;
      }
    }

    // Walls are never flipped or rotated — knot band and brick rows must line up.
    const geo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE, FACE_SEGMENTS, FACE_SEGMENTS);

    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: cutout,
      alphaTest: cutout ? CUTOUT_ALPHA_TEST : 0
    });
    const wall = new THREE.Mesh(geo, mat);

    if (face === 'N') {
      wall.position.set(wx, CELL_SIZE / 2, wz - CELL_SIZE / 2);
      wall.rotation.y = 0;
    } else if (face === 'E') {
      wall.position.set(wx + CELL_SIZE / 2, CELL_SIZE / 2, wz);
      wall.rotation.y = Math.PI / 2;
    } else if (face === 'S') {
      wall.position.set(wx, CELL_SIZE / 2, wz + CELL_SIZE / 2);
      wall.rotation.y = Math.PI;
    } else if (face === 'W') {
      wall.position.set(wx - CELL_SIZE / 2, CELL_SIZE / 2, wz);
      wall.rotation.y = -Math.PI / 2;
    }

    // Light from the walkable side of the face
    wall.userData.lightX = nx;
    wall.userData.lightY = nz;
    group.add(wall);
  }
}
