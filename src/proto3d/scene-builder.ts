import * as THREE from 'three';
import {
  CELL_SIZE,
  CUTOUT_ALPHA_TEST,
  FACE_SEGMENTS,
  isWaterTile,
  tileBedY
} from './constants';
import { DoorSystem } from './doors';
import { makeWallGeometry, wallMidY } from './geometry';
import { mapPool, SPRITE_LOAD_CONCURRENCY } from './load-pool';
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

/** True for cells that hide a neighbouring wall face. Doors and water are not solid. */
function occludesWallFace(tile: Tile | undefined): boolean {
  if (!tile) return true;
  return !!tile.wall || (!!tile.secret && !tile.secretOpen);
}

export class SceneBuilder {
  private variants = new Map<VariantSurface, THREE.Texture[]>();
  private doorOpen: THREE.Texture | null = null;
  private doorPanel: THREE.Texture | null = null;
  private secretClosed: THREE.Texture | null = null;
  private secretOpen: THREE.Texture | null = null;
  private submergedShallow: THREE.Texture[] = [];
  private submergedDeep: THREE.Texture[] = [];
  doors = new DoorSystem();

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

    const jobs: Array<{ path: string; opts: TexOpts; assign: (tex: THREE.Texture) => void }> = [];
    for (const surface of VARIANT_SURFACES) {
      const names = variantFilenames(surface, files);
      const loaded: THREE.Texture[] = new Array(names.length);
      this.variants.set(surface, loaded);
      names.forEach((n, i) => {
        jobs.push({
          path: `proto3d/tex3d/${n}`,
          opts: optsFor(surface),
          assign: (tex) => {
            loaded[i] = tex;
          }
        });
      });
    }
    const cutouts: Array<{ path: string; opts: TexOpts; key: 'doorOpen' | 'doorPanel' | 'secretClosed' | 'secretOpen' }> = [
      { path: 'proto3d/tex3d/door_open.png', opts: cutout, key: 'doorOpen' },
      { path: 'proto3d/tex3d/door_panel.png', opts: cutout, key: 'doorPanel' },
      { path: 'proto3d/tex3d/secret_closed.png', opts: wall, key: 'secretClosed' },
      { path: 'proto3d/tex3d/secret_open.png', opts: cutout, key: 'secretOpen' }
    ];
    const cutoutTex: Partial<Record<(typeof cutouts)[number]['key'], THREE.Texture>> = {};
    for (const job of cutouts) {
      jobs.push({
        path: job.path,
        opts: job.opts,
        assign: (tex) => {
          cutoutTex[job.key] = tex;
        }
      });
    }
    const waterFloor: TexOpts = {
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      mipmaps: true
    };
    const shallowNames = ['floor_submerged.png', 'floor_submerged_2.png', 'floor_submerged_3.png', 'floor_submerged_4.png'];
    const deepNames = [
      'floor_submerged_deep.png',
      'floor_submerged_deep_2.png',
      'floor_submerged_deep_3.png',
      'floor_submerged_deep_4.png'
    ];
    const shallow: THREE.Texture[] = new Array(shallowNames.length);
    const deep: THREE.Texture[] = new Array(deepNames.length);
    shallowNames.forEach((n, i) => {
      jobs.push({
        path: `proto3d/tex3d/water/${n}`,
        opts: waterFloor,
        assign: (tex) => {
          shallow[i] = tex;
        }
      });
    });
    deepNames.forEach((n, i) => {
      jobs.push({
        path: `proto3d/tex3d/water/${n}`,
        opts: waterFloor,
        assign: (tex) => {
          deep[i] = tex;
        }
      });
    });
    await mapPool(jobs, SPRITE_LOAD_CONCURRENCY, async (job) => {
      const tex = await loadTex(job.path, job.opts);
      job.assign(tex);
    });
    this.doorOpen = cutoutTex.doorOpen ?? null;
    this.doorPanel = cutoutTex.doorPanel ?? null;
    this.secretClosed = cutoutTex.secretClosed ?? null;
    this.secretOpen = cutoutTex.secretOpen ?? null;
    this.submergedShallow = shallow;
    this.submergedDeep = deep;

    console.log('All textures loaded successfully');
  }

  private pickWaterBed(tile: Tile, x: number, y: number): THREE.Texture {
    const list = tile.deepWater ? this.submergedDeep : this.submergedShallow;
    return list[pickVariantIndex(list.length, x, y, 'F')];
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
        // Walls stay solid blocks. Secret and door cells need a floor/ceiling so
        // an opened secret (5,1) or a doorway isn't a black pit.
        if (tile.wall) continue;

        const wx = x * CELL_SIZE;
        const wz = y * CELL_SIZE;

        const water = isWaterTile(tile);
        const floorTex = water ? this.pickWaterBed(tile, x, y) : this.pick('floor_stone', x, y, 'F');
        const floorY = tileBedY(tile);

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
        floor.userData.kind = water ? (tile.deepWater ? 'water-deep' : 'water-shallow') : 'floor';
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
        ceiling.userData.kind = 'ceiling';
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
    face: 'N' | 'E' | 'S' | 'W',
    tile: Tile
  ) {
    const nx = x + dx;
    const nz = y + dz;

    if (nx < 0 || nx >= width || nz < 0 || nz >= height) return;
    const neighbor = tiles[nz][nx];
    // Doors are walkable, so neighbouring walls must still emit faces into the
    // door cell — otherwise the corridor through the door is missing side walls.
    if (occludesWallFace(neighbor) && !tile.door) return;
    if (tile.door && (neighbor.wall || neighbor.door || neighbor.secret)) return;

    if (tile.door) {
      this.doors.attachFace(
        group,
        x,
        y,
        face,
        tile,
        this.doorOpen!,
        this.doorPanel!,
        nx,
        nz
      );
      return;
    }

    let texture: THREE.Texture = this.pick('wall_plain', x, y, face);
    let cutout = false;

    if (tile.secret) {
      if (tile.secretOpen) {
        texture = this.secretOpen!;
        cutout = true;
      } else {
        texture = this.secretClosed!;
      }
    }

    const geo = makeWallGeometry();
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: cutout,
      alphaTest: cutout ? CUTOUT_ALPHA_TEST : 0
    });
    const wall = new THREE.Mesh(geo, mat);
    const midY = wallMidY();

    if (face === 'N') {
      wall.position.set(wx, midY, wz - CELL_SIZE / 2);
      wall.rotation.y = 0;
    } else if (face === 'E') {
      wall.position.set(wx + CELL_SIZE / 2, midY, wz);
      wall.rotation.y = Math.PI / 2;
    } else if (face === 'S') {
      wall.position.set(wx, midY, wz + CELL_SIZE / 2);
      wall.rotation.y = Math.PI;
    } else {
      wall.position.set(wx - CELL_SIZE / 2, midY, wz);
      wall.rotation.y = -Math.PI / 2;
    }

    wall.userData.lightX = nx;
    wall.userData.lightY = nz;
    wall.userData.face = face;
    wall.userData.kind = tile.secret ? 'secret' : 'wall';
    wall.userData.cellX = x;
    wall.userData.cellY = y;
    group.add(wall);
  }

  setSecretOpen(scene: THREE.Scene, x: number, y: number, open: boolean) {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.userData.kind !== 'secret') return;
      if (obj.userData.cellX !== x || obj.userData.cellY !== y) return;
      const mat = obj.material as THREE.MeshBasicMaterial;
      mat.map = open ? this.secretOpen : this.secretClosed;
      mat.transparent = open;
      mat.alphaTest = open ? CUTOUT_ALPHA_TEST : 0;
      mat.needsUpdate = true;
    });
  }
}
