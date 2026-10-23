import * as THREE from 'three';
import { floor1CaveIn } from '../../public/levels/floor1';
import { CAVE_IN_STATE } from '../proto3d/cave-in';
import { CELL } from './constants';
import { floor1Map, setRubbleWall } from './layout';
import { enablePaintedSampling, RUBBLE_TINT } from './painted';
import { loadPng } from '../voxel-lab/materials';

const DUST_FRAMES = 6;

function stoneMat(map: THREE.Texture): THREE.MeshPhysicalMaterial {
  enablePaintedSampling(map);
  return new THREE.MeshPhysicalMaterial({
    map,
    color: RUBBLE_TINT,
    roughness: 1,
    metalness: 0,
    ior: 1.45,
    clearcoat: 0,
    sheen: 0,
    specularIntensity: 0,
    envMapIntensity: 0,
    fog: true,
    emissive: 0x000000
  });
}

export class CaveInWorld {
  group = new THREE.Group();
  private rubble = new THREE.Group();
  private dust: THREE.Sprite | null = null;
  private dustFrames: THREE.Texture[] = [];
  private ready = false;

  constructor() {
    this.group.name = 'cave-in-world';
    this.rubble.name = 'cave-in-rubble';
    this.group.add(this.rubble);
  }

  async load(scene: THREE.Scene): Promise<void> {
    if (this.ready) return;
    const [rubblePng, ...dust] = await Promise.all([
      loadPng('wall_plain.png'),
      ...Array.from({ length: DUST_FRAMES }, (_, i) => loadPng(`../fx/dust_burst_${i + 1}.png`))
    ]);
    const mat = stoneMat(rubblePng.texture);
    const wx = floor1CaveIn.rubble.x * CELL;
    const wz = floor1CaveIn.rubble.y * CELL;
    const piles: Array<[number, number, number, number, number, number, number]> = [
      [1.55, 1.15, 0.55, wx + 0.05, 0.58, wz - 0.12, 0.18],
      [0.72, 0.62, 0.7, wx - 0.48, 0.31, wz + 0.22, -0.35],
      [0.95, 0.48, 0.42, wx + 0.38, 0.24, wz + 0.42, 0.4],
      [1.2, 0.85, 0.5, wx - 0.1, 0.42, wz + 0.05, 0.08],
      [0.55, 1.35, 0.48, wx + 0.52, 0.68, wz - 0.38, -0.2]
    ];
    for (const [w, h, d, x, y, z, ry] of piles) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.rubble = true;
      this.rubble.add(mesh);
    }
    this.dustFrames = dust.map((row) => {
      const tex = row.texture;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      return tex;
    });
    const dustMat = new THREE.SpriteMaterial({
      map: this.dustFrames[0],
      transparent: true,
      depthWrite: false,
      toneMapped: false
    });
    this.dust = new THREE.Sprite(dustMat);
    this.dust.scale.set(CELL, CELL, 1);
    this.dust.position.set(wx, CELL * 0.5, wz);
    this.dust.userData.kind = 'dust_burst';
    this.dust.visible = false;
    this.group.add(this.dust);
    this.rubble.visible = false;
    scene.add(this.group);
    this.ready = true;
  }

  applyRubble(): void {
    setRubbleWall(floor1Map, floor1CaveIn.rubble.x, floor1CaveIn.rubble.y, true);
    this.rubble.visible = true;
  }

  resetRubble(): void {
    setRubbleWall(floor1Map, floor1CaveIn.rubble.x, floor1CaveIn.rubble.y, false);
    this.rubble.visible = false;
    this.setDust(null);
  }

  setDust(frame: number | null): void {
    if (!this.dust) return;
    if (frame == null || !this.dustFrames.length) {
      this.dust.visible = false;
      return;
    }
    const tex = this.dustFrames[Math.max(0, Math.min(this.dustFrames.length, frame) - 1)];
    const mat = this.dust.material as THREE.SpriteMaterial;
    mat.map = tex;
    mat.needsUpdate = true;
    this.dust.visible = true;
  }

  sync(done: boolean): void {
    if (done) this.applyRubble();
    else this.resetRubble();
  }

  blocking(): boolean {
    return this.rubble.visible;
  }
}

export { CAVE_IN_STATE };
export const floor1CaveInSpec = floor1CaveIn;
