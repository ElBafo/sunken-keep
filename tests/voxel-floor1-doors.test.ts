import * as THREE from 'three';
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import {
  ARCH_FRONT,
  CELL,
  DOOR_CLOSE_MS,
  DOOR_OPEN_MS,
  DOOR_SLIDE,
  DOOR_LEAF_MS,
  DOOR_LEAF_SLIDE,
  DOOR_UNLOCK_LEAD_MS
} from '../src/voxel-floor1/constants';
import { inflateSync } from 'zlib';
import {
  ageDoorPanelPixels,
  doorPanelLeafRect,
  LEAF_MAX_LUMA,
  lintelTop,
  PADLOCK_MAX_HEIGHT_M,
  listPadlockQuads,
  padlockHeightM,
  padlockIronPixels
} from '../src/voxel-floor1/door-opening';
import { greedyMesh } from '../src/voxel-lab/mesher';
import {
  OpeningSystem,
  makeArchToWorld,
  maskVolumeWithOpening,
  pickSecretTellTexels,
  recessSecretTell,
  solidifyArchVolume,
  type OpeningVisual
} from '../src/voxel-floor1/openings';
import { floor1Map, openingViews, resetFloor1Doors, tileAt } from '../src/voxel-floor1/layout';
import { lookForSecret } from '../src/voxel-floor1/wall-look';

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngRgba(buf: Buffer): { width: number; height: number; data: Uint8ClampedArray } {
  const u32 = (o: number) => buf.readUInt32BE(o);
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idats: Buffer[] = [];
  let plte: Buffer | null = null;
  let trns: Buffer | null = null;
  while (off + 8 <= buf.length) {
    const len = u32(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (type === 'PLTE') plte = Buffer.from(chunk);
    else if (type === 'tRNS') trns = Buffer.from(chunk);
    else if (type === 'IDAT') idats.push(Buffer.from(chunk));
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`png bitDepth ${bitDepth}`);
  const raw = inflateSync(Buffer.concat(idats));
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * bpp;
  const rows: Uint8Array[] = [];
  let i = 0;
  let prev: Uint8Array | null = null;
  for (let y = 0; y < height; y++) {
    const filt = raw[i++];
    const row = Uint8Array.from(raw.subarray(i, i + stride));
    i += stride;
    if (filt === 1) {
      for (let x = bpp; x < stride; x++) row[x] = (row[x] + row[x - bpp]) & 255;
    } else if (filt === 2 && prev) {
      for (let x = 0; x < stride; x++) row[x] = (row[x] + prev[x]) & 255;
    } else if (filt === 3) {
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? row[x - bpp] : 0;
        const b = prev ? prev[x] : 0;
        row[x] = (row[x] + ((a + b) >> 1)) & 255;
      }
    } else if (filt === 4) {
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? row[x - bpp] : 0;
        const b = prev ? prev[x] : 0;
        const c = prev && x >= bpp ? prev[x - bpp] : 0;
        row[x] = (row[x] + paeth(a, b, c)) & 255;
      }
    }
    rows.push(row);
    prev = row;
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 6) {
        data.set(rows[y].subarray(x * 4, x * 4 + 4), o);
      } else if (colorType === 2) {
        data[o] = rows[y][x * 3];
        data[o + 1] = rows[y][x * 3 + 1];
        data[o + 2] = rows[y][x * 3 + 2];
        data[o + 3] = 255;
      } else if (colorType === 3 && plte) {
        const idx = rows[y][x];
        data[o] = plte[idx * 3];
        data[o + 1] = plte[idx * 3 + 1];
        data[o + 2] = plte[idx * 3 + 2];
        data[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else {
        data[o] = data[o + 1] = data[o + 2] = rows[y][x];
        data[o + 3] = 255;
      }
    }
  }
  return { width, height, data };
}

function fakeDoor(locked: boolean): OpeningVisual {
  const tile = tileAt(floor1Map, 4, 2)!;
  tile.doorLocked = locked;
  tile.doorOpen = false;
  return {
    x: 4,
    y: 2,
    kind: 'door',
    tile,
    panels: [new THREE.Group()],
    animStart: 0,
    animFrom: 0,
    animTo: 0,
    animDur: DOOR_OPEN_MS,
    busy: false
  };
}

describe('voxel-floor1 doors match Classic timing and lock rules', () => {
  beforeEach(() => resetFloor1Doors());

  it('starts all four door edges closed with a leaf style', () => {
    const doors = [
      [4, 2],
      [14, 2],
      [6, 8],
      [19, 5]
    ] as const;
    for (const [x, y] of doors) {
      const tile = tileAt(floor1Map, x, y);
      expect(tile?.door, `${x},${y}`).toBeFalsy();
      expect(tile?.doorOpen, `${x},${y}`).toBeFalsy();
    }
  });

  it('slides the leaf up like a portcullis in 0.6s and keeps the secret Y-slide', () => {
    expect(DOOR_LEAF_MS).toBe(600);
    expect(DOOR_LEAF_SLIDE).toBeGreaterThan(lintelTop() - 1e-6);
    expect(DOOR_SLIDE).toBeCloseTo(1.42, 8);
    expect(DOOR_OPEN_MS).toBe(1450);
    expect(DOOR_CLOSE_MS).toBe(600);
    expect(DOOR_UNLOCK_LEAD_MS).toBe(350);
  });

  it('clamps leftover bright studs without recolouring already-aged leaf pixels', () => {
    const w = 16;
    const h = 16;
    const src = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      src[i * 4] = 70;
      src[i * 4 + 1] = 58;
      src[i * 4 + 2] = 44;
      src[i * 4 + 3] = 255;
    }
    const stud = ((h >> 1) * w + (w >> 1)) * 4;
    src[stud] = 255;
    src[stud + 1] = 255;
    src[stud + 2] = 252;
    src[stud + 3] = 255;
    const aged = ageDoorPanelPixels(src, w, h);
    expect(aged[0]).toBe(70);
    expect(aged[1]).toBe(58);
    expect(aged[2]).toBe(44);
    const studLuma = (0.2126 * aged[stud] + 0.7152 * aged[stud + 1] + 0.0722 * aged[stud + 2]) / 255;
    expect(studLuma).toBeLessThanOrEqual(LEAF_MAX_LUMA + 1e-3);
    expect(Math.max(aged[stud], aged[stud + 1], aged[stud + 2])).toBeLessThan(140);
    expect(aged[stud]).toBeGreaterThan(aged[stud + 2]);
  });

  it('hangs a 3D padlock on the leaf under 16 cm', () => {
    expect(listPadlockQuads('lintel').length).toBeGreaterThan(8);
    const h = padlockHeightM('lintel');
    expect(h).toBeGreaterThan(0.08);
    expect(h).toBeLessThan(PADLOCK_MAX_HEIGHT_M);
    const openings = readFileSync(resolve(__dirname, '../src/voxel-floor1/openings.ts'), 'utf8');
    expect(openings).toContain('door_panel_aged.png');
    expect(openings).toContain('door-lock:');
    expect(openings).toContain('slider.add(lock)');
    expect(openings).toContain('slider.add(shackle)');
    expect(openings).toContain('userData.doorLeaf = true');
    expect(openings).toContain('specularIntensity: 0');
  });

  it('tints the 3D padlock dark grey-brown iron with rust patches, no red cast', () => {
    const body = padlockIronPixels('body', 8);
    const shackle = padlockIronPixels('shackle', 8);
    const luma = (p: Uint8ClampedArray, i: number) =>
      (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
    const sat = (p: Uint8ClampedArray, i: number) => {
      const r = p[i];
      const g = p[i + 1];
      const b = p[i + 2];
      const maxc = Math.max(r, g, b);
      const minc = Math.min(r, g, b);
      return maxc > 0 ? (maxc - minc) / maxc : 0;
    };
    let bodyBase = 0;
    let rust = 0;
    for (let i = 0; i < body.length; i += 4) {
      expect(body[i] - body[i + 2]).toBeLessThan(36);
      expect(sat(body, i)).toBeLessThan(0.48);
      expect(luma(body, i)).toBeGreaterThan(0.08);
      expect(luma(body, i)).toBeLessThan(0.28);
      expect(body[i]).toBeGreaterThanOrEqual(body[i + 1]);
      expect(body[i + 1]).toBeGreaterThanOrEqual(body[i + 2] - 2);
      if (body[i] <= 40 && body[i] - body[i + 2] <= 12) bodyBase += 1;
      if (body[i] - body[i + 2] >= 14 && body[i + 1] > body[i + 2]) rust += 1;
    }
    expect(bodyBase).toBeGreaterThan(8);
    expect(rust).toBeGreaterThan(0);
    let shackGrey = 0;
    for (let i = 0; i < shackle.length; i += 4) {
      expect(Math.abs(shackle[i] - shackle[i + 1])).toBeLessThanOrEqual(4);
      expect(shackle[i] - shackle[i + 2]).toBeLessThan(8);
      expect(sat(shackle, i)).toBeLessThan(0.22);
      if (shackle[i] <= 36 && Math.abs(shackle[i] - shackle[i + 2]) <= 4) shackGrey += 1;
    }
    expect(shackGrey).toBeGreaterThan(8);
  });

  it('fills arched-cap corner texels from the plank column below, without UV stretch', () => {
    const w = 64;
    const h = 64;
    const src = new Uint8ClampedArray(w * h * 4);
    const leaf = doorPanelLeafRect(w, h);
    const wood = [72, 60, 46] as const;
    const dark = [8, 6, 5] as const;
    const bandY = leaf.y0 + 12;
    for (let i = 0; i < w * h; i++) {
      src[i * 4] = dark[0];
      src[i * 4 + 1] = dark[1];
      src[i * 4 + 2] = dark[2];
      src[i * 4 + 3] = 255;
    }
    for (let y = leaf.y0; y < leaf.y1; y++) {
      for (let x = leaf.x0; x < leaf.x1; x++) {
        const i = (y * w + x) * 4;
        const inset = Math.max(0, 8 - (y - leaf.y0));
        const inTri = x < leaf.x0 + inset || x >= leaf.x1 - inset;
        if (y === bandY || (y < bandY && inTri)) {
          src[i] = dark[0];
          src[i + 1] = dark[1];
          src[i + 2] = dark[2];
        } else {
          src[i] = wood[0];
          src[i + 1] = wood[1];
          src[i + 2] = wood[2];
        }
      }
    }
    const aged = ageDoorPanelPixels(src, w, h);
    const pix = (buf: Uint8ClampedArray, x: number, y: number) => {
      const i = (y * w + x) * 4;
      return [buf[i], buf[i + 1], buf[i + 2]] as const;
    };
    expect(pix(aged, leaf.x0 + 1, leaf.y0)).toEqual(dark);
    expect(pix(aged, leaf.x0 + 1, leaf.y0 + 1)).toEqual(dark);
    expect(pix(aged, leaf.x0 + 1, leaf.y0 + 4)).toEqual(wood);
    expect(pix(aged, leaf.x1 - 2, leaf.y0 + 4)).toEqual(wood);
    expect(pix(aged, leaf.x0 + 8, bandY)).toEqual(dark);
    expect(pix(aged, (leaf.x0 + leaf.x1) >> 1, leaf.y0 + 8)).toEqual(wood);
    const door = readFileSync(resolve(__dirname, '../src/voxel-floor1/door-opening.ts'), 'utf8');
    expect(door).toContain('fillLeafArchCorners');
    expect(door).not.toMatch(/Math\.sin|Math\.cos|BoxGeometry/);
  });

  it('fills the aged leaf crop corners from real board pixels', () => {
    const png = decodePngRgba(readFileSync(resolve(__dirname, '../public/proto3d/tex3d/door_panel_aged.png')));
    const { width, height, data } = png;
    const before = new Uint8ClampedArray(data);
    const aged = ageDoorPanelPixels(data, width, height);
    const leaf = doorPanelLeafRect(width, height);
    const luma = (buf: Uint8ClampedArray, x: number, y: number) => {
      const i = (y * width + x) * 4;
      return (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255;
    };
    let darkBefore = 0;
    let darkAfter = 0;
    for (let y = leaf.y0 + 2; y < leaf.y0 + 9 && y < leaf.y1; y++) {
      for (const x of [leaf.x0 + 2, leaf.x0 + 3, leaf.x1 - 4, leaf.x1 - 3]) {
        if (luma(before, x, y) < 0.12) darkBefore += 1;
        if (luma(aged, x, y) < 0.12) darkAfter += 1;
      }
    }
    expect(darkBefore).toBeGreaterThan(4);
    expect(darkAfter).toBeLessThan(darkBefore);
    expect(luma(aged, leaf.x0 + 3, leaf.y0 + 4)).toBeGreaterThanOrEqual(0.14);
    expect(luma(aged, leaf.x1 - 4, leaf.y0 + 4)).toBeGreaterThanOrEqual(0.14);
  });

  it('refuses a locked door without a key and does not start the slide', () => {
    const system = new OpeningSystem();
    const visual = fakeDoor(true);
    system.register(visual);
    expect(system.tryDoor(4, 2, false, 1000)).toBe('locked');
    expect(visual.tile.doorOpen).toBeFalsy();
    expect(visual.busy).toBe(false);
    expect(system.isLocked(4, 2)).toBe(true);
  });

  it('unlocks with a key, then opens after the lead-in', () => {
    const system = new OpeningSystem();
    const visual = fakeDoor(true);
    system.register(visual);
    expect(system.tryDoor(4, 2, true, 1000)).toBe('unlocking');
    expect(visual.tile.doorLocked).toBe(false);
    expect(visual.tile.doorOpen).toBeFalsy();
    system.update(1000 + DOOR_UNLOCK_LEAD_MS - 1);
    expect(visual.tile.doorOpen).toBeFalsy();
    system.update(1000 + DOOR_UNLOCK_LEAD_MS);
    expect(visual.tile.doorOpen).toBe(true);
    expect(visual.busy).toBe(true);
    system.update(1000 + DOOR_UNLOCK_LEAD_MS + DOOR_LEAF_MS);
    expect(visual.busy).toBe(false);
    expect(visual.panels[0].visible).toBe(false);
    expect(visual.panels[0].position.y).toBeCloseTo(DOOR_LEAF_SLIDE, 5);
  });

  it('sets doorOpen at slide start so the cell is walkable while the leaf moves', () => {
    const system = new OpeningSystem();
    const visual = fakeDoor(false);
    system.register(visual);
    expect(system.tryDoor(4, 2, false, 50)).toBe('toggled');
    expect(visual.tile.doorOpen).toBe(true);
    expect(visual.busy).toBe(true);
    system.update(50 + DOOR_LEAF_MS);
    expect(visual.busy).toBe(false);
    expect(visual.panels[0].position.y).toBeCloseTo(DOOR_LEAF_SLIDE, 5);
    expect(visual.panels[0].visible).toBe(false);
    system.poseOpen(visual, 0.45);
    expect(visual.panels[0].position.y).toBeCloseTo(DOOR_LEAF_SLIDE * 0.45, 5);
    expect(visual.panels[0].visible).toBe(true);
    expect(visual.busy).toBe(false);
    system.snapOpen(visual, false);
    expect(visual.tile.doorOpen).toBe(false);
    expect(visual.panels[0].position.y).toBeCloseTo(0, 5);
    expect(visual.panels[0].visible).toBe(true);
  });

  it('opens a secret wall on bump and keeps overlay files off proto3d', () => {
    const system = new OpeningSystem();
    const tile = tileAt(floor1Map, 5, 1)!;
    const visual: OpeningVisual = {
      x: 5,
      y: 1,
      kind: 'secret',
      tile,
      panels: [new THREE.Group()],
      animStart: 0,
      animFrom: 0,
      animTo: 0,
      animDur: DOOR_OPEN_MS,
      busy: false
    };
    system.register(visual);
    expect(system.openSecret(5, 1, 10)).toBe(true);
    expect(tile.secretOpen).toBe(true);
    const dir = resolve(__dirname, '../src/voxel-floor1');
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.ts')) continue;
      const src = readFileSync(resolve(dir, name), 'utf8');
      expect(src, name).not.toContain("from '../proto3d/");
    }
    const main = readFileSync(resolve(dir, 'main.ts'), 'utf8');
    expect(main).toContain('buildFloor1Openings');
    expect(main).toContain('handleDoor');
    expect(main).toContain('openSecret');
    expect(main).not.toContain('if (remeshed) syncShadows()');
    const openings = readFileSync(resolve(dir, 'openings.ts'), 'utf8');
    expect(openings).toContain('ceiling_planks_1.png');
    expect(openings).toContain('doorOpeningStyle');
    expect(openings).toContain('FLOOR1_WALL_FILES');
    expect(openings).toContain('lookForSecret');
    expect(openings).toContain('lookForZoneBase');
    expect(openings).toContain('maskVolumeWithOpening');
    expect(openings).toContain('openingHoleMask');
    expect(openings).toContain('solidifyArchVolume');
    expect(openings).toContain('makeArchToWorld');
    expect(openings).toContain('projectArchOpeningUvs');
    expect(openings).toContain('wrapT = THREE.RepeatWrapping');
    expect(openings).toContain('warnMissingWallTexture');
    expect(openings).toContain('familyBaseFile');
    expect(openings).not.toContain('using door_open');
    expect(openings).toContain('surroundFile');
    expect(main).not.toContain('listDoors(floor1Map)');
    expect(main).not.toContain('snapOpen(visual, true)');
    expect(main).not.toContain('Demo only');
    expect(main).toContain('hitFacingDoorLeaf');
    expect(main).toContain("'Close'");
    expect(main).toContain('localClippingEnabled');
    expect(openings).toContain('door_panel_aged.png');
    expect(openings).toContain('ageDoorPanelPixels');
    expect(openings).toContain('DOOR_LEAF_SLIDE');
    expect(openings).toContain('doorLeaf');
    expect(openings).not.toContain('door-hinge');
    expect(openings).not.toContain('MeshBasicMaterial');
    expect(openings).not.toContain('applyWallLook');
    expect(openings).toContain('recessSecretTell');
    expect(openings).not.toContain('secret_closed.png');
    expect(openings).toContain('greedyMesh');
    expect(openings).toContain('patchBakeMaterial');
    expect(openings).toContain('keepBack');
    expect(openings).toContain('cullNeg: [false, false, false]');
    expect(main).toContain('buildFloor1Markers');
    expect(main).toContain('TORCH_CAPPED_PROMPT');
    expect(main).toContain('facingSconce');
    expect(main).not.toContain('relightTorch');
    expect(main).not.toContain('lightFacingTorch');
  });

  it('keeps greedy-mesh back faces when cullNeg depth is off', () => {
    const dims: [number, number, number] = [2, 2, 2];
    const volume = new Uint8Array(8).fill(1);
    const toWorld = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
    const culled = greedyMesh(volume, dims, toWorld);
    const kept = greedyMesh(volume, dims, toWorld, { cullNeg: [false, false, false] });
    expect(kept.quads).toBeGreaterThan(culled.quads);
    expect(kept.quads - culled.quads).toBe(1);
  });

  it('hashes secret faces like neighbouring stone walls', () => {
    const views = openingViews(floor1Map, 5, 1);
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      expect(view.wallX).toBe(5);
      expect(view.wallY).toBe(1);
      const look = lookForSecret(view.wallX, view.wallY, view.wallFace, view.tx, view.tz);
      expect(look.file.startsWith('walls_floor1/')).toBe(true);
      expect(look.bulge).toBe(0);
    }
  });

  it('cuts only the painted doorway void from family-base stone', () => {
    const wall = new Uint8Array(8).fill(1);
    const opening = new Uint8Array(8);
    opening[0] = 1;
    opening[1] = 1;
    const masked = maskVolumeWithOpening(wall, [2, 2, 2], opening, [2, 2, 2]);
    expect(masked[0]).toBe(1);
    expect(masked[1]).toBe(1);
    expect(masked[2]).toBe(0);
    expect(masked[4]).toBe(1);
  });

  it('recesses a single field brick by one depth layer', () => {
    const W = 128;
    const H = 128;
    const D = 3;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      data[i * 4] = 8;
      data[i * 4 + 1] = 8;
      data[i * 4 + 2] = 8;
      data[i * 4 + 3] = 255;
    }
    for (let y = 61; y <= 71; y++) {
      for (let x = 50; x <= 66; x++) {
        const i = (y * W + x) * 4;
        data[i] = 140;
        data[i + 1] = 140;
        data[i + 2] = 140;
      }
    }
    const texels = pickSecretTellTexels({ width: W, height: H, data }, 0);
    expect(texels.length).toBeGreaterThan(80);
    expect(texels.length).toBeLessThan(250);
    const volume = new Uint8Array(W * H * D);
    volume.fill(1);
    const recessed = recessSecretTell(volume, [W, H, D], texels);
    let pulled = 0;
    for (const [u, v] of texels) {
      if (!recessed[u + v * W + 2 * W * H]) pulled += 1;
      expect(recessed[u + v * W]).toBe(1);
    }
    expect(pulled).toBe(texels.length);
    expect(recessed[0 + 0 * W + 2 * W * H]).toBe(1);
  });

  it('cuts the door opening through a 30 cm doorway wall', () => {
    expect(ARCH_FRONT).toBeCloseTo(0.03, 5);
    const wall = new Uint8Array(8).fill(1);
    wall[2] = 0;
    wall[6] = 0;
    const arch = solidifyArchVolume(wall, [2, 2, 2], 15);
    expect(arch.dims[2]).toBe(15);
    expect(arch.volume[0]).toBe(1);
    expect(arch.volume[2]).toBe(0);
    const toWorld = makeArchToWorld('W', 4, 2, [2, 2, 15]);
    const back = toWorld(0, 0, 0);
    const front = toWorld(0, 0, 15);
    expect(front[0] - back[0]).toBeCloseTo(0.15, 5);
    expect(back[0]).toBeCloseTo((4 - 0.5) * CELL, 5);
    expect(front[0] - back[0]).toBeGreaterThan(0.12);
    expect(front[0] - back[0]).toBeLessThan(0.2);
  });
});
