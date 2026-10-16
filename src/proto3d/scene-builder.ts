import * as THREE from 'three';
import {
  CELL_SIZE,
  CUTOUT_ALPHA_TEST,
  FACE_SEGMENTS,
  isWaterTile,
  tileBedY
} from './constants';
import { DoorSystem } from './doors';
import { makeRubbleGeometry, makeWallGeometry, wallMidY } from './geometry';
import { loadSpriteTexture } from './atlas';
import { loadTextureCached } from './asset-cache';
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
import { hasWallMips, loadNearestMipTexture } from './wall-mips';

type TexOpts = {
  wrapS: THREE.Wrapping;
  wrapT: THREE.Wrapping;
  mipmaps: boolean;
};

/** True for cells that hide a neighbouring wall face. Doors and water are not solid. */
export function occludesWallFace(tile: Tile | undefined): boolean {
  if (!tile) return true;
  return !!tile.wall || (!!tile.secret && !tile.secretOpen);
}

const INTO_OPEN: ReadonlyArray<{
  ndx: number;
  ndy: number;
  face: 'N' | 'E' | 'S' | 'W';
  fdx: number;
  fdz: number;
}> = [
  { ndx: 0, ndy: -1, face: 'S', fdx: 0, fdz: 1 },
  { ndx: 1, ndy: 0, face: 'W', fdx: -1, fdz: 0 },
  { ndx: 0, ndy: 1, face: 'N', fdx: 0, fdz: -1 },
  { ndx: -1, ndy: 0, face: 'E', fdx: 1, fdz: 0 }
];

/** Wall/secret cells that must emit a face into a now-walkable secret. */
export function neighborFacesIntoCell(
  floorData: FloorData,
  x: number,
  y: number
): Array<{ cellX: number; cellY: number; face: 'N' | 'E' | 'S' | 'W'; fdx: number; fdz: number }> {
  const { tiles, width, height } = floorData;
  const out: Array<{
    cellX: number;
    cellY: number;
    face: 'N' | 'E' | 'S' | 'W';
    fdx: number;
    fdz: number;
  }> = [];
  for (const spec of INTO_OPEN) {
    const nx = x + spec.ndx;
    const ny = y + spec.ndy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const tile = tiles[ny]?.[nx];
    if (!tile || tile.door) continue;
    if (!tile.wall && !tile.secret) continue;
    if (tile.secret && tile.secretOpen) continue;
    out.push({ cellX: nx, cellY: ny, face: spec.face, fdx: spec.fdx, fdz: spec.fdz });
  }
  return out;
}

export class SceneBuilder {
  private variants = new Map<VariantSurface, THREE.Texture[]>();
  private doorOpen: THREE.Texture | null = null;
  private doorPanel: THREE.Texture | null = null;
  private secretClosed: THREE.Texture | null = null;
  private secretOpen: THREE.Texture | null = null;
  private submergedShallow: THREE.Texture[] = [];
  private submergedDeep: THREE.Texture[] = [];
  private rubbleTex: THREE.Texture | null = null;
  private dustFrames: THREE.Texture[] = [];
  private rubbleMeshes: THREE.Mesh[] = [];
  private dustSprite: THREE.Sprite | null = null;
  private worldGroup: THREE.Group | null = null;
  private floorData: FloorData | null = null;
  doors = new DoorSystem();

  async loadTextures(): Promise<void> {
    const baseUrl = import.meta.env.BASE_URL;
    const files = listedTex3dFiles();

    const loadTex = async (path: string, opts: TexOpts): Promise<THREE.Texture> => {
      const filename = path.replace(/^proto3d\/tex3d\//, '');
      if (hasWallMips(filename) && opts.mipmaps) {
        const tex = await loadNearestMipTexture(baseUrl, filename);
        tex.wrapS = opts.wrapS;
        tex.wrapT = opts.wrapT;
        tex.needsUpdate = true;
        return tex;
      }
      const tex = await loadTextureCached(`${baseUrl}${path}`);
      tex.colorSpace = THREE.SRGBColorSpace;
      (tex as any).encoding = 3001;
      tex.magFilter = THREE.NearestFilter;
      tex.generateMipmaps = opts.mipmaps;
      tex.minFilter = opts.mipmaps ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter;
      tex.wrapS = opts.wrapS;
      tex.wrapT = opts.wrapT;
      tex.needsUpdate = true;
      return tex;
    };

    const wall: TexOpts = {
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      mipmaps: true
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
      { path: 'proto3d/tex3d/door_open.png', opts: wall, key: 'doorOpen' },
      { path: 'proto3d/tex3d/door_panel.png', opts: wall, key: 'doorPanel' },
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
    try {
      const rubble = await loadTextureCached(`${baseUrl}art/dungeon_v2/rubble_front_near.png`);
      rubble.colorSpace = THREE.SRGBColorSpace;
      rubble.magFilter = THREE.NearestFilter;
      rubble.minFilter = THREE.NearestFilter;
      rubble.generateMipmaps = false;
      rubble.needsUpdate = true;
      this.rubbleTex = rubble;
    } catch {
      this.rubbleTex = this.variants.get('wall_plain')?.[0] ?? null;
    }
    this.dustFrames = [];
    for (let i = 1; i <= 6; i++) {
      try {
        const dust = await loadSpriteTexture(`proto3d/fx/dust_burst_${i}.png`);
        dust.magFilter = THREE.NearestFilter;
        dust.minFilter = THREE.NearestFilter;
        dust.generateMipmaps = false;
        this.dustFrames.push(dust);
      } catch {
        break;
      }
    }

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
    this.worldGroup = group;
    this.floorData = floorData;
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
    tile: Tile,
    opts?: { texture?: THREE.Texture; rubble?: boolean }
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

    let texture: THREE.Texture = opts?.texture ?? this.pick('wall_plain', x, y, face);
    let cutout = false;

    if (!opts?.texture && tile.secret) {
      if (tile.secretOpen) {
        texture = this.secretOpen!;
        cutout = true;
      } else {
        texture = this.secretClosed!;
      }
    }

    const geo = opts?.rubble ? makeRubbleGeometry() : makeWallGeometry();
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
    wall.userData.kind = tile.secret && !opts?.rubble ? 'secret' : 'wall';
    wall.userData.cellX = x;
    wall.userData.cellY = y;
    if (opts?.rubble) {
      wall.userData.rubble = true;
      wall.userData.lightGround = true;
    }
    group.add(wall);
    return wall;
  }

  applyRubbleWall(scene: THREE.Scene, floorData: FloorData, x: number, y: number) {
    const tile = floorData.tiles[y]?.[x];
    if (!tile) return;
    tile.wall = true;
    this.clearRubble();
    const group = this.worldGroup ?? new THREE.Group();
    if (!this.worldGroup) {
      group.name = 'cave-in-rubble';
      scene.add(group);
    }
    const tex = this.rubbleTex ?? this.pick('wall_plain', x, y, 'W');
    const wx = x * CELL_SIZE;
    const wz = y * CELL_SIZE;
    const { tiles, width, height } = floorData;
    const faces: Array<{ dx: number; dz: number; face: 'N' | 'E' | 'S' | 'W' }> = [
      { dx: 0, dz: -1, face: 'N' },
      { dx: 1, dz: 0, face: 'E' },
      { dx: 0, dz: 1, face: 'S' },
      { dx: -1, dz: 0, face: 'W' }
    ];
    for (const { dx, dz, face } of faces) {
      const mesh = this.buildWallFace(group, tiles, x, y, width, height, wx, wz, dx, dz, face, tile, {
        texture: tex,
        rubble: true
      });
      if (mesh) this.rubbleMeshes.push(mesh);
    }
    group.updateMatrixWorld(true);
  }

  setDustBurst(scene: THREE.Scene, x: number, y: number, frame: number | null) {
    if (frame == null || !this.dustFrames.length) {
      if (this.dustSprite) this.dustSprite.visible = false;
      return;
    }
    const tex = this.dustFrames[Math.max(0, Math.min(this.dustFrames.length, frame) - 1)];
    if (!this.dustSprite) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        toneMapped: false
      });
      this.dustSprite = new THREE.Sprite(mat);
      this.dustSprite.scale.set(CELL_SIZE, CELL_SIZE, 1);
      this.dustSprite.userData.kind = 'dust_burst';
      scene.add(this.dustSprite);
    }
    const mat = this.dustSprite.material as THREE.SpriteMaterial;
    mat.map = tex;
    mat.needsUpdate = true;
    this.dustSprite.position.set(x * CELL_SIZE, CELL_SIZE * 0.5, y * CELL_SIZE);
    this.dustSprite.visible = true;
    this.dustSprite.userData.lightX = x;
    this.dustSprite.userData.lightY = y;
  }

  clearRubble() {
    for (const mesh of this.rubbleMeshes) {
      mesh.parent?.remove(mesh);
    }
    this.rubbleMeshes = [];
    if (this.dustSprite) this.dustSprite.visible = false;
  }

  setSecretOpen(scene: THREE.Scene, x: number, y: number, open: boolean) {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.userData.kind !== 'secret') return;
      if (obj.userData.voxelMesh) return;
      if (obj.userData.cellX !== x || obj.userData.cellY !== y) return;
      const mat = obj.material as THREE.MeshBasicMaterial;
      mat.map = open ? this.secretOpen : this.secretClosed;
      mat.transparent = open;
      mat.alphaTest = open ? CUTOUT_ALPHA_TEST : 0;
      mat.visible = true;
      mat.needsUpdate = true;
    });
    if (open) this.revealSecretNeighbors(x, y);
    else this.hideSecretNeighbors(x, y);
    this.worldGroup?.updateMatrixWorld(true);
  }

  private hasWallFace(cellX: number, cellY: number, face: string): boolean {
    const group = this.worldGroup;
    if (!group) return false;
    let found = false;
    group.traverse((obj) => {
      if (found || !(obj instanceof THREE.Mesh)) return;
      if (obj.userData.voxelMesh) return;
      if (obj.userData.cellX !== cellX || obj.userData.cellY !== cellY) return;
      if (obj.userData.face !== face) return;
      const kind = obj.userData.kind;
      if (kind !== 'wall' && kind !== 'secret') return;
      found = true;
    });
    return found;
  }

  private revealSecretNeighbors(x: number, y: number) {
    const floorData = this.floorData;
    const group = this.worldGroup;
    if (!floorData || !group) return;
    const { tiles, width, height } = floorData;
    for (const spec of neighborFacesIntoCell(floorData, x, y)) {
      if (this.hasWallFace(spec.cellX, spec.cellY, spec.face)) continue;
      const tile = tiles[spec.cellY][spec.cellX];
      const mesh = this.buildWallFace(
        group,
        tiles,
        spec.cellX,
        spec.cellY,
        width,
        height,
        spec.cellX * CELL_SIZE,
        spec.cellY * CELL_SIZE,
        spec.fdx,
        spec.fdz,
        spec.face,
        tile
      );
      if (!mesh) continue;
      mesh.userData.secretReveal = true;
      mesh.userData.revealedIntoX = x;
      mesh.userData.revealedIntoY = y;
    }
  }

  private hideSecretNeighbors(x: number, y: number) {
    const group = this.worldGroup;
    if (!group) return;
    const remove: THREE.Mesh[] = [];
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.userData.secretReveal) return;
      if (obj.userData.revealedIntoX !== x || obj.userData.revealedIntoY !== y) return;
      remove.push(obj);
    });
    for (const mesh of remove) mesh.parent?.remove(mesh);
  }
}
