import * as THREE from 'three';
import { FloorData, Tile } from './types';

const CELL_SIZE = 2;

interface Textures {
  wallPlain: THREE.Texture;
  wallPilaster: THREE.Texture;
  wallKnot: THREE.Texture;
  doorLocked: THREE.Texture;
  floorStone: THREE.Texture;
  floorWater: THREE.Texture;
  ceiling: THREE.Texture;
}

export class SceneBuilder {
  textures: Textures | null = null;
  
  async loadTextures(): Promise<Textures> {
    const loader = new THREE.TextureLoader();
    const baseUrl = import.meta.env.BASE_URL;
    
    const loadTex = (path: string): Promise<THREE.Texture> => {
      return new Promise((resolve, reject) => {
        loader.load(
          `${baseUrl}${path}`,
          (tex) => {
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            resolve(tex);
          },
          undefined,
          (err) => reject(err)
        );
      });
    };
    
    const [wallPlain, wallPilaster, wallKnot, doorLocked, floorStone, floorWater, ceiling] = await Promise.all([
      loadTex('art/tex3d/wall_plain.png'),
      loadTex('art/tex3d/wall_pilaster.png'),
      loadTex('art/tex3d/wall_knot.png'),
      loadTex('art/tex3d/door_locked.png'),
      loadTex('art/tex3d/floor_stone.png'),
      loadTex('art/tex3d/floor_water.png'),
      loadTex('art/tex3d/ceiling.png')
    ]);
    
    this.textures = {
      wallPlain,
      wallPilaster,
      wallKnot,
      doorLocked,
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
    
    // Build floor and ceiling
    this.buildFloorAndCeiling(group, floorData);
    
    // Build walls
    this.buildWalls(group, floorData);
    
    scene.add(group);
    return group;
  }
  
  buildFloorAndCeiling(group: THREE.Group, floorData: FloorData) {
    const { tiles, width, height } = floorData;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        if (tile.wall) continue;
        
        const wx = x * CELL_SIZE;
        const wz = y * CELL_SIZE;
        
        // Floor
        const isWater = tile.deepWater || tile.shallowWater;
        const floorTex = isWater ? this.textures!.floorWater : this.textures!.floorStone;
        const floorY = isWater ? -0.15 : 0;
        
        const floorGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
        const floorMat = new THREE.MeshStandardMaterial({ 
          map: floorTex,
          roughness: 0.9,
          metalness: 0.1,
          side: THREE.DoubleSide
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(wx, floorY, wz);
        group.add(floor);
        
        // Ceiling
        const ceilingGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
        const ceilingMat = new THREE.MeshStandardMaterial({ 
          map: this.textures!.ceiling,
          roughness: 0.9,
          metalness: 0.1,
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
        if (!tile.wall && !tile.door) continue;
        
        const wx = x * CELL_SIZE;
        const wz = y * CELL_SIZE;
        
        // Check each face
        this.buildWallFace(group, tiles, x, y, width, height, wx, wz, 0, -1, 'N', tile); // North
        this.buildWallFace(group, tiles, x, y, width, height, wx, wz, 1, 0, 'E', tile);  // East
        this.buildWallFace(group, tiles, x, y, width, height, wx, wz, 0, 1, 'S', tile);  // South
        this.buildWallFace(group, tiles, x, y, width, height, wx, wz, -1, 0, 'W', tile); // West
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
    
    // Check if neighbor is walkable
    if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
      const neighbor = tiles[nz][nx];
      if (!neighbor.wall && !neighbor.door) {
        // Build wall face
        let texture = this.textures!.wallPlain;
        
        if (tile.door && tile.doorLocked) {
          texture = this.textures!.doorLocked;
        }
        
        const geo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
        const mat = new THREE.MeshStandardMaterial({ 
          map: texture,
          roughness: 0.9,
          metalness: 0.1,
          side: THREE.DoubleSide
        });
        const wall = new THREE.Mesh(geo, mat);
        
        // Position and rotate based on face
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
