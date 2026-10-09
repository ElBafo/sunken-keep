import * as THREE from 'three';
import { CELL_SIZE } from './constants';
import { FloorData, Tile } from './types';

const WOOD_COLOR = 0x3a2414;
const LAMP_W = 0.16 * CELL_SIZE;
const LAMP_H = 0.24 * CELL_SIZE;

function configureTex(tex: THREE.Texture, repeat: boolean) {
  tex.colorSpace = THREE.SRGBColorSpace;
  (tex as any).encoding = 3001;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
}

export class PropBuilder {
  private woodBeam: THREE.Texture | null = null;
  private woodPlain: THREE.Texture | null = null;
  private deskNote: THREE.Texture | null = null;
  private jarFront: THREE.Texture | null = null;
  private lampTex: THREE.Texture | null = null;
  private group = new THREE.Group();

  async load(): Promise<void> {
    const loader = new THREE.TextureLoader();
    const baseUrl = import.meta.env.BASE_URL;
    const load = (path: string, repeat: boolean): Promise<THREE.Texture> =>
      new Promise((resolve, reject) => {
        loader.load(
          `${baseUrl}${path}`,
          (tex) => {
            configureTex(tex, repeat);
            resolve(tex);
          },
          undefined,
          reject
        );
      });

    const [door, desk, jar, lamp] = await Promise.all([
      load('proto3d/tex3d/door_panel.png', true),
      load('proto3d/atmo/desk_note.png', false),
      load('proto3d/atmo/jar_rack.png', false),
      load('proto3d/atmo/lamp_capped.png', false)
    ]);
    this.woodBeam = door;
    this.woodPlain = door;
    this.deskNote = desk;
    this.jarFront = jar;
    this.lampTex = lamp;
  }

  place(scene: THREE.Scene, floorData: FloorData) {
    this.group = new THREE.Group();
    this.group.name = 'props';
    scene.add(this.group);

    const { tiles, width, height } = floorData;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        if (tile.prop === 'beams_fallen') this.addBeams(x, y, !!tile.mirror);
        else if (tile.prop === 'desk') this.addDesk(x, y);
        else if (tile.prop === 'jar_rack') this.addRack(x, y);
        else if (tile.prop === 'lamp_capped') this.addLamp(x, y, tile);
      }
    }
  }

  private woodMat(map: THREE.Texture | null, color = WOOD_COLOR) {
    return new THREE.MeshBasicMaterial({
      map: map ?? undefined,
      color: map ? 0x6b4428 : color,
      vertexColors: true,
      toneMapped: false
    });
  }

  private tag(mesh: THREE.Mesh, x: number, y: number, kind: string) {
    mesh.userData.lightX = x;
    mesh.userData.lightY = y;
    mesh.userData.kind = kind;
    mesh.userData.noPick = true;
    this.group.add(mesh);
  }

  private box(
    w: number,
    h: number,
    d: number,
    map: THREE.Texture | null,
    x: number,
    y: number,
    kind: string
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), this.woodMat(map));
    this.tag(mesh, x, y, kind);
    return mesh;
  }

  private addBeams(x: number, y: number, mirror: boolean) {
    const wx = x * CELL_SIZE;
    const wz = y * CELL_SIZE;
    const sign = mirror ? -1 : 1;
    const map = this.woodBeam;

    const main = this.box(2.15, 0.28, 0.32, map, x, y, 'beam');
    main.position.set(wx + 0.08 * sign, 0.62, wz - 0.06);
    main.rotation.z = sign * 0.62;
    main.rotation.x = 0.22;

    const cross = this.box(1.55, 0.22, 0.26, map, x, y, 'beam');
    cross.position.set(wx - 0.18 * sign, 0.34, wz + 0.32);
    cross.rotation.z = sign * -0.4;
    cross.rotation.y = 0.7 * sign;

    const stub = this.box(0.55, 0.28, 0.42, map, x, y, 'beam');
    stub.position.set(wx + 0.42 * sign, 0.14, wz + 0.4);
    stub.rotation.y = 0.4 * sign;
    stub.rotation.z = sign * 0.18;
  }

  private addDesk(x: number, y: number) {
    const wx = x * CELL_SIZE;
    const wz = y * CELL_SIZE;
    const map = this.woodPlain;
    const topW = 1.2;
    const topD = 0.62;
    const topH = 0.07;
    const topY = 0.34;

    const top = this.box(topW, topH, topD, map, x, y, 'desk');
    top.position.set(wx, topY, wz);

    const leg = 0.08;
    const legH = topY - topH / 2;
    const insetX = topW / 2 - 0.1;
    const insetZ = topD / 2 - 0.1;
    for (const [lx, lz] of [
      [-insetX, -insetZ],
      [insetX, -insetZ],
      [-insetX, insetZ],
      [insetX, insetZ]
    ] as const) {
      const post = this.box(leg, legH, leg, map, x, y, 'desk');
      post.position.set(wx + lx, legH / 2, wz + lz);
    }

    if (!this.deskNote) return;
    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(topW, topY + 0.02),
      new THREE.MeshBasicMaterial({
        map: this.deskNote,
        transparent: true,
        alphaTest: 0.08,
        vertexColors: true,
        toneMapped: false,
        side: THREE.DoubleSide
      })
    );
    // Face the room (west, −X) so the note reads from (11,9).
    front.position.set(wx - topW / 2 - 0.01, (topY + 0.02) / 2, wz);
    front.rotation.y = -Math.PI / 2;
    this.tag(front, x, y, 'desk');
  }

  private addRack(x: number, y: number) {
    const wx = x * CELL_SIZE;
    const wz = y * CELL_SIZE;
    const map = this.woodPlain;
    const wallX = wx - CELL_SIZE / 2 + 0.18;
    const shelfW = 0.22;
    const shelfD = 1.15;

    const sideH = 0.72;
    for (const zOff of [-0.52, 0.52] as const) {
      const side = this.box(0.08, sideH, 0.08, map, x, y, 'rack');
      side.position.set(wallX, sideH / 2, wz + zOff);
    }

    for (const hy of [0.18, 0.4, 0.62] as const) {
      const shelf = this.box(shelfW, 0.05, shelfD, map, x, y, 'rack');
      shelf.position.set(wallX + 0.04, hy, wz);
    }

    if (!this.jarFront) return;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.78),
      new THREE.MeshBasicMaterial({
        map: this.jarFront,
        transparent: true,
        alphaTest: 0.08,
        vertexColors: true,
        toneMapped: false,
        side: THREE.DoubleSide
      })
    );
    face.position.set(wallX + 0.16, 0.39, wz);
    face.rotation.y = Math.PI / 2;
    this.tag(face, x, y, 'rack');
  }

  private addLamp(x: number, y: number, _tile: Tile) {
    if (!this.lampTex) return;
    const mat = new THREE.SpriteMaterial({
      map: this.lampTex,
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.12,
      depthTest: true,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
      toneMapped: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0);
    // Stand by the desk — slightly west of cell centre, on the floor.
    sprite.position.set(x * CELL_SIZE - 0.55, 0.02, y * CELL_SIZE + 0.15);
    sprite.scale.set(LAMP_W, LAMP_H, 1);
    sprite.frustumCulled = false;
    sprite.renderOrder = 8;
    sprite.userData.isSprite = true;
    sprite.userData.skipVertexLighting = true;
    sprite.userData.kind = 'lamp_capped';
    sprite.userData.lightX = x;
    sprite.userData.lightY = y;
    this.group.add(sprite);
  }
}

export function blocksMovement(tile: Tile | undefined): boolean {
  if (!tile?.prop) return false;
  return tile.prop === 'beams_fallen' || tile.prop === 'desk';
}
