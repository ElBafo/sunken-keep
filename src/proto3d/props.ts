import * as THREE from 'three';
import { loadSpriteTexture, textureFrameSize } from './atlas';
import { loadTextureCached } from './asset-cache';
import { CELL_SIZE, FACE_INTO_ROOM } from './constants';
import { FloorData, Tile } from './types';
import {
  isBlockingProp,
  isWallFace,
  isWallProp,
  OPPOSITE_WALL,
  WALL_PROP_WORLD_HEIGHT,
  wallPropPlanePose,
  wallPropVisible,
  type PropWall
} from './wall-props';
import { applyWallMountNearCull } from './wall-near-cull';

const WOOD_COLOR = 0x3a2414;

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
    const baseUrl = import.meta.env.BASE_URL;
    const load = async (path: string, repeat: boolean): Promise<THREE.Texture> => {
      if (repeat) {
        const tex = await loadTextureCached(`${baseUrl}${path}`);
        configureTex(tex, true);
        return tex;
      }
      const tex = await loadSpriteTexture(path);
      configureTex(tex, false);
      return tex;
    };

    const [beam, plain, desk, jar, lamp] = await Promise.all([
      load('proto3d/tex3d/wood_beam.png', true),
      load('proto3d/tex3d/wood_plain.png', true),
      load('proto3d/atmo/desk_note.png', false),
      load('proto3d/atmo/jar_rack.png', false),
      load('proto3d/atmo/lamp_capped.png', false)
    ]);
    this.woodBeam = beam;
    this.woodPlain = plain;
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
        else if (tile.prop === 'desk' || tile.prop === 'table') this.addDesk(x, y);
        else if (tile.prop === 'jar_rack' || tile.prop === 'weapon_rack') {
          this.addRack(x, y, tile.prop, isWallFace(tile.propWall) ? tile.propWall : 'W');
        } else if (tile.prop === 'lamp_capped') {
          this.addLamp(x, y, isWallFace(tile.propWall) ? tile.propWall : 'E');
        }
        else if (tile.prop) console.warn(`Unknown prop "${tile.prop}" at (${x},${y}); not drawn as a box`);
      }
    }
  }

  private woodMat(
    map: THREE.Texture | null,
    color = WOOD_COLOR,
    repeatS = 1,
    repeatT = 1
  ) {
    let tex = map ?? undefined;
    if (map && (repeatS !== 1 || repeatT !== 1)) {
      tex = map.clone();
      tex.repeat.set(repeatS, repeatT);
      tex.needsUpdate = true;
    }
    return new THREE.MeshBasicMaterial({
      map: tex,
      color: tex ? 0xffffff : color,
      vertexColors: true,
      toneMapped: false
    });
  }

  private tag(mesh: THREE.Mesh, x: number, y: number, kind: string) {
    mesh.userData.lightX = x;
    mesh.userData.lightY = y;
    mesh.userData.kind = kind;
    mesh.userData.lanternProp = true;
    mesh.userData.noPick = true;
    this.group.add(mesh);
  }

  private markWallProp(obj: THREE.Object3D, x: number, y: number, face: PropWall, kind: string) {
    obj.userData.wallMounted = true;
    obj.userData.gridX = x;
    obj.userData.gridY = y;
    obj.userData.propWall = face;
    obj.userData.kind = kind;
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
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d, 2, 2, 2),
      this.woodMat(map, WOOD_COLOR, Math.max(1, w), Math.max(1, h))
    );
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

  private addRack(x: number, y: number, kind: string, face: PropWall) {
    const wx = x * CELL_SIZE;
    const wz = y * CELL_SIZE;
    const map = this.woodPlain;
    const along = FACE_INTO_ROOM[face];
    const into = FACE_INTO_ROOM[OPPOSITE_WALL[face]];
    const wallX = wx + along.nx * (CELL_SIZE / 2 - 0.18);
    const wallZ = wz + along.nz * (CELL_SIZE / 2 - 0.18);
    const perpX = along.nz;
    const perpZ = -along.nx;
    const shelfW = 0.22;
    const shelfD = 1.15;

    const sideH = 0.72;
    for (const zOff of [-0.52, 0.52] as const) {
      const side = this.box(0.08, sideH, 0.08, map, x, y, kind);
      side.position.set(wallX + perpX * zOff, sideH / 2, wallZ + perpZ * zOff);
      this.markWallProp(side, x, y, face, kind);
    }

    for (const hy of [0.18, 0.4, 0.62] as const) {
      const shelf = this.box(shelfW, 0.05, shelfD, map, x, y, kind);
      shelf.position.set(wallX + into.nx * 0.04, hy, wallZ + into.nz * 0.04);
      this.markWallProp(shelf, x, y, face, kind);
    }

    if (!this.jarFront) return;
    const front = new THREE.Mesh(
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
    front.position.set(wallX + into.nx * 0.16, 0.39, wallZ + into.nz * 0.16);
    front.rotation.y = into.rotY;
    this.tag(front, x, y, kind);
    this.markWallProp(front, x, y, face, kind);
  }

  private addLamp(x: number, y: number, face: PropWall) {
    const size = this.lampTex ? textureFrameSize(this.lampTex) : { w: 32, h: 48 };
    const pose = wallPropPlanePose(x, y, face, size.w || 32, size.h || 48, WALL_PROP_WORLD_HEIGHT);
    if (!this.lampTex) {
      const stub = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.woodMat(this.woodPlain));
      stub.position.set(pose.x, pose.y, pose.z);
      stub.rotation.y = pose.rotY;
      stub.scale.set(pose.scaleX, pose.scaleY, 1);
      this.tag(stub, x, y, 'lamp_capped_wall');
      this.markWallProp(stub, x, y, face, 'lamp_capped_wall');
      stub.userData.scaleX = pose.scaleX;
      stub.userData.scaleY = pose.scaleY;
      return;
    }
    const wallMat = new THREE.MeshLambertMaterial({
      map: this.lampTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: this.lampTex,
      emissiveIntensity: 0.35,
      transparent: true,
      alphaTest: 0.12,
      toneMapped: false,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
      vertexColors: true
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMat);
    plane.position.set(pose.x, pose.y, pose.z);
    plane.rotation.y = pose.rotY;
    plane.scale.set(pose.scaleX, pose.scaleY, 1);
    plane.frustumCulled = false;
    plane.renderOrder = 8;
    plane.userData.noPick = true;
    plane.userData.lightX = x;
    plane.userData.lightY = y;
    plane.userData.scaleX = pose.scaleX;
    plane.userData.scaleY = pose.scaleY;
    this.tag(plane, x, y, 'lamp_capped_wall');
    this.markWallProp(plane, x, y, face, 'lamp_capped_wall');
  }

  /**
   * Wall-mounted props stay on their face; hide when the camera sits on that wall.
   * Near-plane cull is visual-only and never force-shows a #32-hidden mesh.
   */
  layoutAdjacent(playerX: number, playerY: number, _adjacentScale = 1, dir = 0, camera?: THREE.Camera) {
    this.group.traverse((obj) => {
      if (!obj.userData.wallMounted) return;
      const gx = obj.userData.gridX as number;
      const gy = obj.userData.gridY as number;
      const face = obj.userData.propWall as PropWall;
      if (!isWallFace(face)) return;
      obj.visible = wallPropVisible(playerX, playerY, dir, gx, gy, face);
      if (obj.visible && camera) applyWallMountNearCull(obj, camera);
    });
  }

  debugWallProps(): Array<{
    kind: string;
    x: number;
    y: number;
    visible: boolean;
    face: string;
    worldY: number;
    scaleY: number;
  }> {
    const out: Array<{
      kind: string;
      x: number;
      y: number;
      visible: boolean;
      face: string;
      worldY: number;
      scaleY: number;
    }> = [];
    this.group.traverse((obj) => {
      if (!obj.userData.wallMounted) return;
      out.push({
        kind: obj.userData.kind,
        x: obj.userData.gridX,
        y: obj.userData.gridY,
        visible: obj.visible,
        face: obj.userData.propWall,
        worldY: obj.position.y,
        scaleY: obj.scale.y
      });
    });
    return out;
  }
}

/** DoubleSide jar-rack plane on the west wall of that floor square. */
export function jarRackPlanePose(x: number, y: number): { x: number; y: number; z: number } {
  const wallX = x * CELL_SIZE - CELL_SIZE / 2 + 0.18;
  return { x: wallX + 0.16, y: 0.39, z: y * CELL_SIZE };
}

export function isFloorProp(tile: Tile | undefined): boolean {
  return isBlockingProp(tile);
}

export function blocksMovement(tile: Tile | undefined): boolean {
  return isBlockingProp(tile);
}

export { isWallProp, isBlockingProp };
