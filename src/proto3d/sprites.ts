import * as THREE from 'three';
import { FloorData, Sconce } from './types';

const CELL_SIZE = 2;

interface SpriteInfo {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  frames?: THREE.Texture[];
  currentFrame: number;
  animSpeed: number;
  lastFrameTime: number;
}

export class SpriteManager {
  sprites: SpriteInfo[] = [];
  camera: THREE.Camera;
  
  constructor(camera: THREE.Camera) {
    this.camera = camera;
  }
  
  async loadSprites(scene: THREE.Scene, floorData: FloorData, sconces: readonly Sconce[]) {
    const loader = new THREE.TextureLoader();
    const baseUrl = import.meta.env.BASE_URL;
    
    const loadTex = (path: string) => {
      const tex = loader.load(`${baseUrl}${path}`);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      return tex;
    };
    
    // Add monsters and items
    const { tiles, width, height } = floorData;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        
        // Monster
        if (tile.monster === 'slime') {
          const frames = [
            loadTex('art/dungeon/slime_idle_1_near.png'),
            loadTex('art/dungeon/slime_idle_2_near.png'),
            loadTex('art/dungeon/slime_idle_3_near.png'),
            loadTex('art/dungeon/slime_idle_4_near.png')
          ];
          
          const mat = new THREE.MeshBasicMaterial({ 
            map: frames[0],
            transparent: true,
            alphaTest: 0.5,
            side: THREE.DoubleSide
          });
          
          const geo = new THREE.PlaneGeometry(1.5, 1.5);
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(x * CELL_SIZE, 0.75, y * CELL_SIZE);
          scene.add(mesh);
          
          this.sprites.push({
            mesh,
            x,
            y,
            frames,
            currentFrame: 0,
            animSpeed: 200,
            lastFrameTime: 0
          });
        }
        
        // Item
        if (tile.item === 'key') {
          const tex = loadTex('art/dungeon/item_key_near.png');
          const mat = new THREE.MeshBasicMaterial({ 
            map: tex,
            transparent: true,
            alphaTest: 0.5,
            side: THREE.DoubleSide
          });
          
          const geo = new THREE.PlaneGeometry(0.8, 0.8);
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(x * CELL_SIZE, 0.4, y * CELL_SIZE);
          scene.add(mesh);
          
          this.sprites.push({
            mesh,
            x,
            y,
            currentFrame: 0,
            animSpeed: 0,
            lastFrameTime: 0
          });
        }
      }
    }
    
    // Add sconce sprites
    for (const sconce of sconces) {
      if (!sconce.lit) continue;
      
      const frames = [
        loadTex('art/dungeon/sconce_lit_1_near.png'),
        loadTex('art/dungeon/sconce_lit_2_near.png'),
        loadTex('art/dungeon/sconce_lit_3_near.png')
      ];
      
      const mat = new THREE.MeshBasicMaterial({ 
        map: frames[0],
        transparent: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide
      });
      
      const geo = new THREE.PlaneGeometry(0.6, 0.8);
      const mesh = new THREE.Mesh(geo, mat);
      
      // Position close to wall face
      const wx = sconce.x * CELL_SIZE;
      const wz = sconce.y * CELL_SIZE;
      const offset = 0.88; // Very close to wall
      
      if (sconce.face === 'N') {
        mesh.position.set(wx, 1.2, wz - offset);
      } else if (sconce.face === 'E') {
        mesh.position.set(wx + offset, 1.2, wz);
      } else if (sconce.face === 'S') {
        mesh.position.set(wx, 1.2, wz + offset);
      } else if (sconce.face === 'W') {
        mesh.position.set(wx - offset, 1.2, wz);
      }
      
      scene.add(mesh);
      
      this.sprites.push({
        mesh,
        x: sconce.x,
        y: sconce.y,
        frames,
        currentFrame: 0,
        animSpeed: 150,
        lastFrameTime: 0
      });
    }
  }
  
  update(time: number) {
    // Update billboard rotation
    for (const sprite of this.sprites) {
      sprite.mesh.lookAt(this.camera.position);
      
      // Animate
      if (sprite.frames && sprite.frames.length > 1) {
        if (time - sprite.lastFrameTime > sprite.animSpeed) {
          sprite.currentFrame = (sprite.currentFrame + 1) % sprite.frames.length;
          (sprite.mesh.material as THREE.MeshBasicMaterial).map = sprite.frames[sprite.currentFrame];
          sprite.lastFrameTime = time;
        }
      }
    }
  }
}
