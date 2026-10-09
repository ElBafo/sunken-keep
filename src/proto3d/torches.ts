import * as THREE from 'three';
import {
  CELL_SIZE,
  CUTOUT_ALPHA_TEST,
  FACE_INTO_ROOM,
  FLARE_ANIM_FPS,
  SCONCE_ANIM_FPS,
  SCONCE_FRONT_OFFSET_TILES,
  SCONCE_HEIGHT_TILES,
  SCONCE_WIDTH_TILES
} from './constants';
import { Sconce } from './types';

export type TorchVisualState = 'lit' | 'dead' | 'capped';

interface TorchVisual {
  sconce: Sconce;
  group: THREE.Group;
  sideMat: THREE.MeshBasicMaterial;
  frontMat: THREE.MeshBasicMaterial;
  flame: THREE.Mesh;
  flameMat: THREE.MeshBasicMaterial;
  lighting: boolean;
  flameFrame: number;
  lastFrameTime: number;
}

function configureTex(tex: THREE.Texture) {
  tex.colorSpace = THREE.SRGBColorSpace;
  (tex as any).encoding = 3001;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
}

function cutoutMat(map: THREE.Texture, unlit: boolean) {
  return new THREE.MeshBasicMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    alphaTest: CUTOUT_ALPHA_TEST,
    depthTest: true,
    depthWrite: true,
    fog: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    vertexColors: !unlit
  });
}

export function torchState(s: Sconce): TorchVisualState {
  if (s.capped) return 'capped';
  return s.lit ? 'lit' : 'dead';
}

export function torchFrontSquare(s: Sconce): { x: number; y: number } {
  const { nx, nz } = FACE_INTO_ROOM[s.face];
  return { x: s.x + Math.round(nx), y: s.y + Math.round(nz) };
}

export function torchWorldPos(s: Sconce): { x: number; y: number; z: number } {
  const { nx, nz } = FACE_INTO_ROOM[s.face];
  const dist = CELL_SIZE / 2 + SCONCE_FRONT_OFFSET_TILES * CELL_SIZE;
  return {
    x: s.x * CELL_SIZE + nx * dist,
    y: CELL_SIZE / 2 + 0.1 * CELL_SIZE,
    z: s.y * CELL_SIZE + nz * dist
  };
}

export class TorchSystem {
  private visuals: TorchVisual[] = [];
  private brackets = {
    lit: { side: null as THREE.Texture | null, front: null as THREE.Texture | null },
    dead: { side: null as THREE.Texture | null, front: null as THREE.Texture | null },
    capped: { side: null as THREE.Texture | null, front: null as THREE.Texture | null }
  };
  private flameFrames: THREE.Texture[] = [];
  private flareFrames: THREE.Texture[] = [];
  private camera: THREE.Camera;
  private look = new THREE.Vector3();

  constructor(camera: THREE.Camera) {
    this.camera = camera;
  }

  async load(scene: THREE.Scene, sconces: Sconce[]) {
    const loader = new THREE.TextureLoader();
    const baseUrl = import.meta.env.BASE_URL;
    const loadTex = (path: string): Promise<THREE.Texture> =>
      new Promise((resolve, reject) => {
        loader.load(
          `${baseUrl}${path}`,
          (tex) => {
            configureTex(tex);
            resolve(tex);
          },
          undefined,
          (err) => reject(new Error(`Failed to load torch texture ${path}: ${String(err)}`))
        );
      });

    const states: TorchVisualState[] = ['lit', 'dead', 'capped'];
    const loaded = await Promise.all(
      states.flatMap((state) => [
        loadTex(`proto3d/tex3d/torch/bracket_${state}_side.png`),
        loadTex(`proto3d/tex3d/torch/bracket_${state}_front.png`)
      ])
    );
    states.forEach((state, i) => {
      this.brackets[state].side = loaded[i * 2];
      this.brackets[state].front = loaded[i * 2 + 1];
    });

    this.flameFrames = await Promise.all(
      [1, 2, 3].map((n) => loadTex(`proto3d/tex3d/torch/flame_${n}.png`))
    );
    this.flareFrames = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) => loadTex(`proto3d/tex3d/torch/flare_${n}.png`))
    );

    const w = SCONCE_WIDTH_TILES * CELL_SIZE;
    const h = SCONCE_HEIGHT_TILES * CELL_SIZE;
    const frontOff = SCONCE_FRONT_OFFSET_TILES * CELL_SIZE;
    const flameH = 0.3125 * CELL_SIZE;
    const midY = CELL_SIZE / 2;

    for (const sconce of sconces) {
      const state = torchState(sconce);
      const { nx, nz, rotY } = FACE_INTO_ROOM[sconce.face];
      const wallX = sconce.x * CELL_SIZE + nx * (CELL_SIZE / 2);
      const wallZ = sconce.y * CELL_SIZE + nz * (CELL_SIZE / 2);

      const group = new THREE.Group();
      group.position.set(0, 0, 0);

      const sideMat = cutoutMat(this.brackets[state].side!, false);
      const side = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sideMat);
      side.position.set(wallX + nx * (w / 2), midY, wallZ + nz * (w / 2));
      side.rotation.y = rotY - Math.PI / 2;
      side.renderOrder = 2;
      side.userData.isSconce = true;
      side.userData.kind = 'torch-bracket';
      side.userData.lightX = sconce.x;
      side.userData.lightY = sconce.y;
      group.add(side);

      const frontMat = cutoutMat(this.brackets[state].front!, false);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frontMat);
      front.position.set(wallX + nx * frontOff, midY, wallZ + nz * frontOff);
      front.rotation.y = rotY;
      front.renderOrder = 2;
      front.userData.isSconce = true;
      front.userData.kind = 'torch-bracket';
      front.userData.lightX = sconce.x;
      front.userData.lightY = sconce.y;
      group.add(front);

      const flameMat = cutoutMat(this.flameFrames[0], true);
      const flame = new THREE.Mesh(new THREE.PlaneGeometry(w, flameH), flameMat);
      flame.position.set(wallX + nx * frontOff, midY + h / 2 - flameH / 2, wallZ + nz * frontOff);
      flame.renderOrder = 3;
      flame.userData.skipVertexLighting = true;
      flame.userData.isSconce = true;
      flame.userData.noPick = true;
      flame.userData.kind = 'torch-flame';
      flame.visible = state === 'lit';
      group.add(flame);

      scene.add(group);
      this.visuals.push({
        sconce,
        group,
        sideMat,
        frontMat,
        flame,
        flameMat,
        lighting: false,
        flameFrame: 0,
        lastFrameTime: 0
      });
    }
  }

  private applyBracket(visual: TorchVisual, state: TorchVisualState) {
    const maps = this.brackets[state];
    visual.sideMat.map = maps.side;
    visual.frontMat.map = maps.front;
    visual.sideMat.needsUpdate = true;
    visual.frontMat.needsUpdate = true;
  }

  ignite(sconce: Sconce, now: number) {
    const visual = this.visuals.find((v) => v.sconce === sconce);
    if (!visual) return;
    sconce.lit = true;
    sconce.capped = false;
    this.applyBracket(visual, 'lit');
    visual.lighting = true;
    visual.flameFrame = 0;
    visual.lastFrameTime = now;
    visual.flame.visible = true;
    visual.flameMat.map = this.flareFrames[0];
    visual.flameMat.needsUpdate = true;
  }

  flameFrame(): number {
    const lit = this.visuals.find((v) => v.sconce.lit && !v.lighting);
    return lit?.flameFrame ?? 0;
  }

  facingTorch(playerX: number, playerY: number, dir: number): Sconce | null {
    const [dx, dy] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0]
    ][dir];
    const fx = playerX + dx;
    const fy = playerY + dy;
    for (const visual of this.visuals) {
      const front = torchFrontSquare(visual.sconce);
      if (front.x === playerX && front.y === playerY && visual.sconce.x === fx && visual.sconce.y === fy) {
        return visual.sconce;
      }
    }
    return null;
  }

  update(now: number) {
    const cam = this.camera.position;
    for (const visual of this.visuals) {
      if (!visual.flame.visible) continue;
      this.look.set(cam.x - visual.flame.position.x, 0, cam.z - visual.flame.position.z);
      visual.flame.rotation.y = Math.atan2(this.look.x, this.look.z);

      const frames = visual.lighting ? this.flareFrames : this.flameFrames;
      const fps = visual.lighting ? FLARE_ANIM_FPS : SCONCE_ANIM_FPS;
      const frameMs = 1000 / fps;
      if (now - visual.lastFrameTime < frameMs) continue;
      visual.lastFrameTime = now;
      if (visual.lighting) {
        visual.flameFrame += 1;
        if (visual.flameFrame >= this.flareFrames.length) {
          visual.lighting = false;
          visual.flameFrame = 0;
          visual.flameMat.map = this.flameFrames[0];
        } else {
          visual.flameMat.map = this.flareFrames[visual.flameFrame];
        }
        visual.flameMat.needsUpdate = true;
      } else if (visual.sconce.lit) {
        visual.flameFrame = (visual.flameFrame + 1) % frames.length;
        visual.flameMat.map = frames[visual.flameFrame];
        visual.flameMat.needsUpdate = true;
      }
    }
  }
}
