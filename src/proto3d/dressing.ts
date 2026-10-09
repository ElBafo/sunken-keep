import * as THREE from 'three';
import {
  CELL_SIZE,
  CUTOUT_ALPHA_TEST,
  FACE_INTO_ROOM,
  SCONCE_HEIGHT_TILES,
  SCONCE_WALL_OFFSET_TILES,
  SCONCE_WIDTH_TILES,
  WATER_Y
} from './constants';
import { faceHash } from './texture-variants';
import { FloorData, Sconce, Tile } from './types';

type Face = Sconce['face'];

export interface DressingMark {
  x: number;
  y: number;
  wx: number;
  wy: number;
  wz: number;
}

export interface DressingMarks {
  chains: DressingMark[];
  banners: DressingMark[];
  bones: DressingMark[];
  sunbeams: DressingMark[];
  cappedSconces: Set<string>;
}

interface DressingItem {
  x: number;
  y: number;
  face?: string;
  against?: string;
}

interface FloorDressing {
  [kind: string]: DressingItem[] | string | undefined;
}

interface DressingFile {
  floor1?: FloorDressing;
  floor2?: FloorDressing;
}

const ATMO_FILES = [
  'ash_bowl',
  'banner_torn',
  'bones',
  'ceiling_crack',
  'chains',
  'cobweb_corner_l',
  'cobweb_corner_r',
  'crack_large',
  'drip_drop',
  'drip_stain',
  'dust',
  'moss_patch',
  'rust_stain',
  'sconce_capped',
  'shaft_1',
  'shaft_2',
  'splash_1',
  'splash_2',
  'splash_3',
  'tally_marks',
  'water_edge',
  'water_line'
] as const;

const SKIP_KINDS = new Set(['banner_sunken', 'wet_strip']);
const FOG_READABLE = new Set(['tally_marks', 'water_line', 'ash_bowl']);
const DECAL_OFFSET = 0.02;
const AGAINST_TO_WALL: Record<Face, { dx: number; dy: number; face: Face }> = {
  W: { dx: -1, dy: 0, face: 'E' },
  E: { dx: 1, dy: 0, face: 'W' },
  N: { dx: 0, dy: -1, face: 'S' },
  S: { dx: 0, dy: 1, face: 'N' }
};

function asFace(value: string | undefined): Face | null {
  if (value === 'N' || value === 'E' || value === 'S' || value === 'W') return value;
  return null;
}

function isWallish(tile: Tile | undefined): boolean {
  return !!tile && !!(tile.wall || tile.secret);
}

function isWalkable(tile: Tile | undefined): boolean {
  return !!tile && !tile.wall && !tile.secret;
}

function isWater(tile: Tile | undefined): boolean {
  return !!tile && !!(tile.deepWater || tile.shallowWater);
}

function configureAtmoTex(tex: THREE.Texture, repeatS = false) {
  tex.colorSpace = THREE.SRGBColorSpace;
  (tex as any).encoding = 3001;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
}

export class Dressing {
  textures = new Map<string, THREE.Texture>();
  marks: DressingMarks = {
    chains: [],
    banners: [],
    bones: [],
    sunbeams: [],
    cappedSconces: new Set()
  };
  private shafts: THREE.Mesh[] = [];
  private reserved = new Set<string>();
  private group = new THREE.Group();

  async load(): Promise<void> {
    const loader = new THREE.TextureLoader();
    const baseUrl = import.meta.env.BASE_URL;
    await Promise.all(
      ATMO_FILES.map(
        (name) =>
          new Promise<void>((resolve, reject) => {
            loader.load(
              `${baseUrl}proto3d/atmo/${name}.png`,
              (tex) => {
                configureAtmoTex(tex, name === 'water_line' || name === 'water_edge');
                this.textures.set(name, tex);
                resolve();
              },
              undefined,
              reject
            );
          })
      )
    );
  }

  tex(name: string): THREE.Texture {
    const t = this.textures.get(name);
    if (!t) throw new Error(`Missing atmo texture ${name}`);
    return t;
  }

  async place(scene: THREE.Scene, floorData: FloorData) {
    this.group = new THREE.Group();
    this.group.name = 'dressing';
    scene.add(this.group);

    const baseUrl = import.meta.env.BASE_URL;
    const res = await fetch(`${baseUrl}levels/dressing_act1.json`);
    const data = (await res.json()) as DressingFile;
    const floor = data.floor1;
    if (!floor) return;

    this.collectReserved(floor);
    this.placeHandItems(floorData, floor);
    this.placeWetStrips(floorData);
    this.scatterWear(floorData);
  }

  update(now: number) {
    const pulse = 0.9 + 0.1 * Math.sin(now * 0.00126);
    for (const shaft of this.shafts) {
      const mat = shaft.material as THREE.MeshBasicMaterial;
      mat.opacity = pulse;
    }
  }

  private collectReserved(floor: FloorDressing) {
    for (const [kind, items] of Object.entries(floor)) {
      if (SKIP_KINDS.has(kind) || !Array.isArray(items)) continue;
      for (const item of items) this.reserved.add(`${item.x},${item.y}`);
    }
  }

  private placeHandItems(floorData: FloorData, floor: FloorDressing) {
    for (const [kind, items] of Object.entries(floor)) {
      if (SKIP_KINDS.has(kind) || !Array.isArray(items)) continue;
      items.forEach((item, i) => {
        if (kind === 'sunbeam') this.placeSunbeam(item, i);
        else if (kind === 'cobweb_ceiling_corner') this.placeCobweb(floorData, item, i);
        else if (kind === 'tally') this.placeWallNamed(floorData, item, 'tally_marks', true);
        else if (kind === 'ash_bowl') this.placeAgainstOrFace(floorData, item, 'ash_bowl', true);
        else if (kind === 'sconce_capped') this.placeSconceCapped(item);
        else if (kind === 'chains') {
          const mark = this.placeWallNamed(floorData, item, 'chains', false);
          if (mark) this.marks.chains.push(mark);
        } else if (kind === 'banner_torn') {
          const mark = this.placeWallNamed(floorData, item, 'banner_torn', false);
          if (mark) this.marks.banners.push(mark);
        } else if (kind === 'bones') {
          const mark = this.placeBones(floorData, item);
          if (mark) this.marks.bones.push(mark);
        } else if (kind === 'water_line') this.placeWallNamed(floorData, item, 'water_line', true);
        else if (kind === 'rust_stain') this.placeWallNamed(floorData, item, 'rust_stain', false, 0.03);
        else {
          // Any other name is the same as its file.
          if (!this.textures.has(kind)) return;
          this.placeWallNamed(floorData, item, kind, FOG_READABLE.has(kind));
        }
      });
    }
  }

  private placeSunbeam(item: DressingItem, index: number) {
    const crack = this.tex('ceiling_crack');
    const shaftTex = this.tex(index % 2 === 0 ? 'shaft_1' : 'shaft_2');
    const wx = item.x * CELL_SIZE;
    const wz = item.y * CELL_SIZE;
    const crackY = CELL_SIZE - 0.008;

    // Pale crack art is a light stain; multiply-style blend uses its alpha to
    // darken the ceiling so it reads as a split, not a bone on the stone.
    const crackMat = new THREE.MeshBasicMaterial({
      map: crack,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      fog: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const crackMesh = new THREE.Mesh(new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE), crackMat);
    crackMesh.rotation.x = Math.PI / 2;
    crackMesh.position.set(wx, crackY, wz);
    this.tagDecal(crackMesh, item.x, item.y);
    crackMesh.userData.skipVertexLighting = true;
    this.group.add(crackMesh);

    const width = 0.4 * CELL_SIZE;
    const height = CELL_SIZE - 0.04;
    const midY = crackY - height / 2;
    const slant = ((12 + (index % 3) * 5) * Math.PI) / 180;
    const sign = index % 2 === 0 ? 1 : -1;
    const shaftMat = new THREE.MeshBasicMaterial({
      map: shaftTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: true,
      opacity: 0.88,
      toneMapped: false
    });
    // Crossed quads so the beam is visible from the corridor, not only face-on.
    for (const rotY of [Math.PI / 4, (Math.PI * 3) / 4]) {
      const holder = new THREE.Group();
      holder.position.set(wx, midY, wz);
      holder.rotation.y = rotY;
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(width, height), shaftMat);
      shaft.rotation.z = slant * sign;
      shaft.renderOrder = 6;
      shaft.userData.skipVertexLighting = true;
      shaft.userData.noPick = true;
      holder.add(shaft);
      this.group.add(holder);
      this.shafts.push(shaft);
    }
    this.marks.sunbeams.push({ x: item.x, y: item.y, wx, wy: crackY, wz });
  }

  private placeCobweb(floorData: FloorData, item: DressingItem, index: number) {
    const wall = this.resolveWall(floorData, item);
    if (!wall) return;
    const name = index % 2 === 0 ? 'cobweb_corner_l' : 'cobweb_corner_r';
    this.placeOnWallFace(wall.wx, wall.wy, wall.face, name, false);
  }

  private placeBones(floorData: FloorData, item: DressingItem): DressingMark | null {
    const wall = this.resolveWall(floorData, item);
    if (!wall) return null;
    this.placeOnWallFace(wall.wx, wall.wy, wall.face, 'bones', false);
    const { nx, nz } = FACE_INTO_ROOM[wall.face];
    return {
      x: item.x,
      y: item.y,
      wx: wall.wx * CELL_SIZE + nx * (CELL_SIZE / 2 + DECAL_OFFSET),
      wy: 0.3,
      wz: wall.wy * CELL_SIZE + nz * (CELL_SIZE / 2 + DECAL_OFFSET)
    };
  }

  private placeSconceCapped(item: DressingItem) {
    const face = asFace(item.face);
    if (!face) return;
    this.marks.cappedSconces.add(`${item.x},${item.y}`);
    const map = this.tex('sconce_capped');
    const w = SCONCE_WIDTH_TILES * CELL_SIZE;
    const h = SCONCE_HEIGHT_TILES * CELL_SIZE;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        alphaTest: CUTOUT_ALPHA_TEST,
        depthWrite: true,
        fog: false,
        side: THREE.FrontSide,
        toneMapped: false
      })
    );
    const { nx, nz, rotY } = FACE_INTO_ROOM[face];
    const dist = CELL_SIZE / 2 + SCONCE_WALL_OFFSET_TILES * CELL_SIZE;
    mesh.position.set(item.x * CELL_SIZE + nx * dist, CELL_SIZE / 2, item.y * CELL_SIZE + nz * dist);
    mesh.rotation.y = rotY;
    mesh.renderOrder = 2;
    mesh.userData.skipVertexLighting = true;
    mesh.userData.noPick = true;
    mesh.userData.isSconce = true;
    this.group.add(mesh);
  }

  private placeAgainstOrFace(
    floorData: FloorData,
    item: DressingItem,
    texName: string,
    fogReadable: boolean
  ) {
    const against = asFace(item.against);
    if (against) {
      const map = AGAINST_TO_WALL[against];
      this.placeOnWallFace(item.x + map.dx, item.y + map.dy, map.face, texName, fogReadable);
      return;
    }
    this.placeWallNamed(floorData, item, texName, fogReadable);
  }

  private placeWallNamed(
    floorData: FloorData,
    item: DressingItem,
    texName: string,
    fogReadable: boolean,
    extraOffset = 0
  ): DressingMark | null {
    const wall = this.resolveWall(floorData, item);
    if (!wall) return null;
    return this.placeOnWallFace(wall.wx, wall.wy, wall.face, texName, fogReadable, extraOffset);
  }

  private resolveWall(
    floorData: FloorData,
    item: DressingItem
  ): { wx: number; wy: number; face: Face } | null {
    const face = asFace(item.face);
    if (face) return { wx: item.x, wy: item.y, face };
    const against = asFace(item.against);
    if (against) {
      const map = AGAINST_TO_WALL[against];
      return { wx: item.x + map.dx, wy: item.y + map.dy, face: map.face };
    }
    const { tiles, width, height } = floorData;
    const tryOrder: Array<[number, number, Face]> = [
      [-1, 0, 'E'],
      [1, 0, 'W'],
      [0, -1, 'S'],
      [0, 1, 'N']
    ];
    for (const [dx, dy, f] of tryOrder) {
      const nx = item.x + dx;
      const ny = item.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (isWallish(tiles[ny][nx])) return { wx: nx, wy: ny, face: f };
    }
    return null;
  }

  private placeOnWallFace(
    wallX: number,
    wallY: number,
    face: Face,
    texName: string,
    fogReadable: boolean,
    extraOffset = 0
  ): DressingMark | null {
    const map = this.textures.get(texName);
    if (!map) return null;
    const { nx, nz, rotY } = FACE_INTO_ROOM[face];
    const dist = CELL_SIZE / 2 + DECAL_OFFSET + extraOffset;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE),
      this.decalMat(map, { unlit: fogReadable, alphaTest: 0.05, fog: !fogReadable })
    );
    mesh.position.set(wallX * CELL_SIZE + nx * dist, CELL_SIZE / 2, wallY * CELL_SIZE + nz * dist);
    mesh.rotation.y = rotY;
    this.tagDecal(mesh, wallX, wallY);
    this.reserved.add(`${wallX},${wallY}`);
    if (fogReadable) {
      mesh.userData.skipVertexLighting = true;
      (mesh.material as THREE.MeshBasicMaterial).vertexColors = false;
    }
    this.group.add(mesh);
    return {
      x: wallX,
      y: wallY,
      wx: mesh.position.x,
      wy: mesh.position.y,
      wz: mesh.position.z
    };
  }

  private placeWetStrips(floorData: FloorData) {
    const { tiles, width, height } = floorData;
    const faces: Array<{ dx: number; dz: number; face: Face }> = [
      { dx: 0, dz: -1, face: 'N' },
      { dx: 1, dz: 0, face: 'E' },
      { dx: 0, dz: 1, face: 'S' },
      { dx: -1, dz: 0, face: 'W' }
    ];
    const h = -WATER_Y;
    const map = this.tex('water_edge');
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        if (!isWalkable(tile) || isWater(tile)) continue;
        for (const { dx, dz, face } of faces) {
          const nx = x + dx;
          const ny = y + dz;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (!isWater(tiles[ny][nx])) continue;
          const geo = new THREE.PlaneGeometry(CELL_SIZE, h);
          const mat = new THREE.MeshBasicMaterial({
            map,
            vertexColors: true,
            side: THREE.DoubleSide
          });
          const mesh = new THREE.Mesh(geo, mat);
          const { rotY } = FACE_INTO_ROOM[face];
          mesh.position.set(
            x * CELL_SIZE + dx * (CELL_SIZE / 2),
            WATER_Y / 2,
            y * CELL_SIZE + dz * (CELL_SIZE / 2)
          );
          mesh.rotation.y = rotY;
          mesh.userData.lightX = x;
          mesh.userData.lightY = y;
          mesh.userData.noPick = true;
          mesh.userData.kind = 'water-edge';
          this.group.add(mesh);
        }
      }
    }
  }

  private scatterWear(floorData: FloorData) {
    const { tiles, width, height } = floorData;
    const faces: Face[] = ['N', 'E', 'S', 'W'];
    const deltas: Record<Face, [number, number]> = {
      N: [0, -1],
      E: [1, 0],
      S: [0, 1],
      W: [-1, 0]
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        if (!tile.wall || tile.door) continue;
        if (this.reserved.has(`${x},${y}`)) continue;
        for (const face of faces) {
          const [dx, dy] = deltas[face];
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = tiles[ny][nx];
          if (!isWalkable(neighbor) || neighbor.door) continue;
          const h = faceHash(x, y, face, 11) % 100;
          let name: string | null = null;
          if (h < 7) name = 'moss_patch';
          else if (h < 12) name = 'crack_large';
          else if (h < 17) name = 'drip_stain';
          if (!name) continue;
          this.placeOnWallFace(x, y, face, name, false);
        }
      }
    }
  }

  private decalMat(
    map: THREE.Texture,
    opts: { unlit: boolean; alphaTest: number; fog?: boolean }
  ) {
    return new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      alphaTest: opts.alphaTest,
      fog: opts.fog ?? true,
      vertexColors: !opts.unlit,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.FrontSide,
      toneMapped: false
    });
  }

  private tagDecal(mesh: THREE.Mesh, x: number, y: number) {
    mesh.renderOrder = 3;
    mesh.userData.noPick = true;
    mesh.userData.kind = 'decal';
    mesh.userData.lightX = x;
    mesh.userData.lightY = y;
  }
}
