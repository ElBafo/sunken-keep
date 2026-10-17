import * as THREE from 'three';
import { BAKE_GAIN, CELL, SCONCE_RADIUS_TILES } from './constants';
import {
  FACE_INTO_ROOM,
  floodReach,
  sconceIsLit,
  sconceKey,
  sconceRoom,
  torchWorldPos,
  type SconceSpec
} from './fixtures';
import { isSolidTile, tileAt, type FloorMap } from './layout';
import { lookColors } from '../voxel-lab/look';

const SIDES: Array<{ dx: number; dz: number; face: 'N' | 'E' | 'S' | 'W' }> = [
  { dx: 0, dz: -1, face: 'N' },
  { dx: 1, dz: 0, face: 'E' },
  { dx: 0, dz: 1, face: 'S' },
  { dx: -1, dz: 0, face: 'W' }
];

function smoothFalloff(distTiles: number, radius: number): number {
  if (distTiles >= radius) return 0;
  const t = 1 - distTiles / radius;
  return t * t;
}

function addQuad(
  pos: number[],
  col: number[],
  idx: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
  ca: [number, number, number],
  cb: [number, number, number],
  cc: [number, number, number],
  cd: [number, number, number]
): void {
  const base = pos.length / 3;
  for (const p of [a, b, c, d]) pos.push(p[0], p[1], p[2]);
  for (const k of [ca, cb, cc, cd]) col.push(k[0], k[1], k[2]);
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function bakeRgb(
  wx: number,
  wy: number,
  wz: number,
  torch: { x: number; y: number; z: number },
  rgb: [number, number, number]
): [number, number, number] {
  const dist = Math.hypot(wx - torch.x, wy - torch.y, wz - torch.z);
  const w = BAKE_GAIN * smoothFalloff(dist / CELL, SCONCE_RADIUS_TILES);
  return [rgb[0] * w, rgb[1] * w, rgb[2] * w];
}

type PoolSlot = {
  key: string;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
};

/**
 * Cheap per-torch light pools on reachable floor/wall faces so far flames
 * still light their square. Opacity fades against the real per-pixel lights.
 */
export class TorchLightPools {
  group = new THREE.Group();
  private slots: PoolSlot[] = [];

  constructor(map: FloorMap, sconces: SconceSpec[]) {
    this.group.name = 'torch-pools';
    const look = lookColors(1, false);
    const rgb: [number, number, number] = [look.torch[0], look.torch[1], look.torch[2]];

    for (const s of sconces) {
      if (!sconceIsLit(s)) continue;
      const room = sconceRoom(s);
      const reach = floodReach(map, room.x, room.y, SCONCE_RADIUS_TILES);
      const pos: number[] = [];
      const col: number[] = [];
      const idx: number[] = [];
      const flame = torchWorldPos(s);
      const inset = 0.035;

      for (const key of reach) {
        const [tx, tz] = key.split(',').map(Number);
        const cx = tx * CELL;
        const cz = tz * CELL;
        const half = CELL / 2;
        const floorY = inset;
        const ceilY = CELL - inset;
        const f00: [number, number, number] = [cx - half + inset, floorY, cz - half + inset];
        const f10: [number, number, number] = [cx + half - inset, floorY, cz - half + inset];
        const f11: [number, number, number] = [cx + half - inset, floorY, cz + half - inset];
        const f01: [number, number, number] = [cx - half + inset, floorY, cz + half - inset];
        addQuad(
          pos,
          col,
          idx,
          f00,
          f01,
          f11,
          f10,
          bakeRgb(f00[0], f00[1], f00[2], flame, rgb),
          bakeRgb(f01[0], f01[1], f01[2], flame, rgb),
          bakeRgb(f11[0], f11[1], f11[2], flame, rgb),
          bakeRgb(f10[0], f10[1], f10[2], flame, rgb)
        );
        const c00: [number, number, number] = [cx - half + inset, ceilY, cz - half + inset];
        const c10: [number, number, number] = [cx + half - inset, ceilY, cz - half + inset];
        const c11: [number, number, number] = [cx + half - inset, ceilY, cz + half - inset];
        const c01: [number, number, number] = [cx - half + inset, ceilY, cz + half - inset];
        addQuad(
          pos,
          col,
          idx,
          c00,
          c10,
          c11,
          c01,
          bakeRgb(c00[0], c00[1], c00[2], flame, rgb),
          bakeRgb(c10[0], c10[1], c10[2], flame, rgb),
          bakeRgb(c11[0], c11[1], c11[2], flame, rgb),
          bakeRgb(c01[0], c01[1], c01[2], flame, rgb)
        );

        for (const side of SIDES) {
          if (!isSolidTile(tileAt(map, tx + side.dx, tz + side.dz))) continue;
          const { nx, nz } = FACE_INTO_ROOM[side.face];
          const wx = cx + nx * (half - inset);
          const wz = cz + nz * (half - inset);
          const px = -nz;
          const pz = nx;
          const y0 = inset;
          const y1 = CELL - inset;
          const p0: [number, number, number] = [wx - px * (half - inset), y0, wz - pz * (half - inset)];
          const p1: [number, number, number] = [wx + px * (half - inset), y0, wz + pz * (half - inset)];
          const p2: [number, number, number] = [wx + px * (half - inset), y1, wz + pz * (half - inset)];
          const p3: [number, number, number] = [wx - px * (half - inset), y1, wz - pz * (half - inset)];
          addQuad(
            pos,
            col,
            idx,
            p0,
            p1,
            p2,
            p3,
            bakeRgb(p0[0], p0[1], p0[2], flame, rgb),
            bakeRgb(p1[0], p1[1], p1[2], flame, rgb),
            bakeRgb(p2[0], p2[1], p2[2], flame, rgb),
            bakeRgb(p3[0], p3[1], p3[2], flame, rgb)
          );
        }
      }

      if (idx.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: true,
        toneMapped: false,
        opacity: 1,
        side: THREE.FrontSide
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `pool:${sconceKey(s)}`;
      mesh.userData.noShadow = true;
      mesh.renderOrder = 1;
      mesh.frustumCulled = true;
      this.group.add(mesh);
      this.slots.push({ key: sconceKey(s), mesh, material });
    }
  }

  setBlends(blends: Map<string, number>, flick: number): void {
    for (const slot of this.slots) {
      const real = blends.get(slot.key) ?? 0;
      const bake = Math.max(0, 1 - real);
      slot.material.opacity = bake * flick;
      slot.mesh.visible = bake > 0.02;
    }
  }
}
