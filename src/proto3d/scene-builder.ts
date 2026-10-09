import * as THREE from 'three';
import { CELL_SIZE, CUTOUT_ALPHA_TEST } from './constants';
import { FloorData, Tile } from './types';

interface Textures {
  wallPlain: THREE.Texture;
  wallPilaster: THREE.Texture;
  wallKnot: THREE.Texture;
  doorLocked: THREE.Texture;
  doorOpen: THREE.Texture;
  secretClosed: THREE.Texture;
  secretOpen: THREE.Texture;
  floorStone: THREE.Texture;
  floorWater: THREE.Texture;
  ceiling: THREE.Texture;
}

type TexOpts = {
  wrapS: THREE.Wrapping;
  wrapT: THREE.Wrapping;
  mipmaps: boolean;
};

export class SceneBuilder {
  textures: Textures | null = null;

  async loadTextures(): Promise<Textures> {
    const loader = new THREE.TextureLoader();
    const baseUrl = import.meta.env.BASE_URL;

    const loadTex = (path: string, opts: TexOpts): Promise<THREE.Texture> => {
      return new Promise((resolve, reject) => {
        loader.load(
          `${baseUrl}${path}`,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            (tex as any).encoding = 3001; // sRGBEncoding fallback
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

    const [
      wallPlain,
      wallPilaster,
      wallKnot,
      doorLocked,
      doorOpen,
      secretClosed,
      secretOpen,
      floorStone,
      floorWater,
      ceiling
    ] = await Promise.all([
      loadTex('proto3d/tex3d/wall_plain.png', wall),
      loadTex('proto3d/tex3d/wall_pilaster.png', wall),
      loadTex('proto3d/tex3d/wall_knot.png', wall),
      loadTex('proto3d/tex3d/door_locked.png', wall),
      loadTex('proto3d/tex3d/door_open.png', cutout),
      loadTex('proto3d/tex3d/secret_closed.png', wall),
      loadTex('proto3d/tex3d/secret_open.png', cutout),
      loadTex('proto3d/tex3d/floor_stone.png', floor),
      loadTex('proto3d/tex3d/floor_water.png', floor),
      loadTex('proto3d/tex3d/ceiling.png', floor)
    ]);

    this.textures = {
      wallPlain,
      wallPilaster,
      wallKnot,
      doorLocked,
      doorOpen,
      secretClosed,
      secretOpen,
      floorStone,
      floorWater,
      ceiling
    };

    console.log('All textures loaded successfully');
    return this.textures;
  }

  buildScene(scene: THREE.Scene, floorData: FloorData) {
    if (!this.textures) throw new Error('Textures not loaded');

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
        const floorTex = isWater ? this.textures!.floorWater : this.textures!.floorStone;
        const floorY = isWater ? -0.15 : 0;

        const floorGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
        const floorMat = new THREE.MeshBasicMaterial({
          map: floorTex,
          vertexColors: true,
          side: THREE.DoubleSide
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(wx, floorY, wz);
        group.add(floor);

        const ceilingGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
        const ceilingMat = new THREE.MeshBasicMaterial({
          map: this.textures!.ceiling,
          vertexColors: true,
          side: THREE.DoubleSide
        });
        const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(wx, CELL_SIZE, wz);
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

    if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
      const neighbor = tiles[nz][nx];
      if (!neighbor.wall && !neighbor.door && !neighbor.secret) {
        let texture = this.textures!.wallPlain;
        let cutout = false;

        if (tile.door) {
          if (tile.doorLocked) {
            texture = this.textures!.doorLocked;
          } else {
            texture = this.textures!.doorOpen;
            cutout = true;
          }
        } else if (tile.secret) {
          if (tile.secretOpen) {
            texture = this.textures!.secretOpen;
            cutout = true;
          } else {
            texture = this.textures!.secretClosed;
          }
        }

        const geo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
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

        group.add(wall);
      }
    }
  }
}
