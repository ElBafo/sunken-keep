import { describe, expect, it, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import * as THREE from 'three';
import { floor1, floor1Sconces } from '../src/proto3d/floor-data';
import { VertexLightingManager } from '../src/proto3d/vertex-lighting';
import { poseGridCamera, Player, MOVE_DURATION } from '../src/proto3d/player';
import { CAMERA_FOV, CAMERA_NEAR, CAMERA_VIEW, CELL_SIZE } from '../src/proto3d/constants';
import {
  heightReliefFromSearch,
  labRenderFromSearch,
  syncHeightReliefQuery,
  syncLabRenderQuery
} from '../src/proto3d/lab-render-opt-in';
import {
  enumerateLabFaces,
  faceKey,
  labFaceKeys,
  occludesWallFace
} from '../src/proto3d/lab-render/occupancy';
import {
  albedoFilenameFromHeight,
  heightMapFilename,
  makeReliefFactory,
  volumeFromAlbedoAndHeight,
  downsampleImageData
} from '../src/proto3d/lab-render/height-source';
import {
  isHeightMapFilename,
  listedHeightMapFiles,
  listedTex3dFiles,
  variantFilenames
} from '../src/proto3d/texture-variants';
import { GAME_LANTERN_HOLD, lanternWorldFromCamera } from '../src/proto3d/lab-render/lantern';
import { volumeFromImageData } from '../src/voxel-lab/classify';
import { DEPTH_LAYERS } from '../src/voxel-lab/constants';

function cloneFloor() {
  return {
    ...floor1,
    tiles: floor1.tiles.map((row) => row.map((t) => ({ ...t })))
  };
}

describe('lab world renderer opt-in', () => {
  it('is off unless ?render=lab', () => {
    expect(labRenderFromSearch(new URLSearchParams(''))).toBe(false);
    expect(labRenderFromSearch(new URLSearchParams('light=lab'))).toBe(false);
    expect(labRenderFromSearch(new URLSearchParams('voxel=1'))).toBe(false);
    expect(labRenderFromSearch(new URLSearchParams('render=1'))).toBe(false);
    expect(labRenderFromSearch(new URLSearchParams('render=lab'))).toBe(true);
  });

  it('does not load voxel-lab or three from the always-imported opt-in module', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/lab-render-opt-in.ts'), 'utf8');
    expect(src).not.toContain('voxel-lab.html');
    expect(src).not.toContain('src/voxel-lab');
    expect(src).not.toContain('three');
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(main).toContain("from './lab-render-opt-in'");
    expect(main).toContain("await import('./lab-render')");
    expect(main).toMatch(/import type \{ LabRenderer \} from '\.\/lab-render'/);
  });

  it('syncs ?render=lab on the URL', () => {
    const loc = { href: 'http://127.0.0.1/sunken-keep/proto3d.html?test=1' };
    const hrefs: string[] = [];
    vi.stubGlobal('window', { location: loc });
    vi.stubGlobal('history', {
      replaceState: (_s: unknown, _t: string, url: string) => {
        hrefs.push(String(url));
        loc.href = String(url);
      }
    });
    syncLabRenderQuery(true);
    expect(hrefs.at(-1)).toContain('render=lab');
    syncLabRenderQuery(false);
    expect(hrefs.at(-1)).not.toMatch(/[?&]render=/);
  });
});

describe('lab occupancy rebuilds after a secret opens', () => {
  it('emits floors for door, secret, and down-stairs cells', () => {
    const faces = enumerateLabFaces(floor1);
    const keys = new Set(labFaceKeys(faces));
    expect(keys.has(faceKey(16, 10, 'floor')), 'stairs (16,10) floor').toBe(true);
    expect(keys.has(faceKey(16, 10, 'ceiling')), 'stairs (16,10) ceiling').toBe(true);
    expect(floor1.tiles[10][16].stairs).toBe('down');
    expect(keys.has(faceKey(5, 1, 'floor')), 'secret (5,1) floor').toBe(true);
    expect(keys.has(faceKey(4, 2, 'floor')), 'door (4,2) floor').toBe(true);
    expect(faces.some((f) => f.cellX === 4 && f.cellY === 2 && f.face !== 'floor' && f.face !== 'ceiling')).toBe(
      false
    );
  });

  it('keeps doors and carvings out of voxel relief', () => {
    const faces = enumerateLabFaces(floor1);
    expect(faces.every((f) => f.kind !== 'door' && !String(f.kind).startsWith('door'))).toBe(true);
    const secret = faces.filter(
      (f) => f.cellX === 5 && f.cellY === 1 && f.face !== 'floor' && f.face !== 'ceiling'
    );
    expect(secret.length).toBeGreaterThan(0);
    expect(secret.every((f) => !f.voxelOk)).toBe(true);
    expect(floor1.tiles[1][5].carving).toBe('carving_secret');
    expect(floor1.tiles[2][4].door).toBe(true);
    expect(floor1.tiles[2][4].carving).toBe('carving_door');
  });

  it('after a secret opens, every expected wall is still present (closed ⊆ open plus new neighbor faces)', () => {
    const secrets = [
      { x: 5, y: 1 },
      { x: 5, y: 13 }
    ];
    for (const { x, y } of secrets) {
      const closed = cloneFloor();
      expect(closed.tiles[y][x].secret).toBe(true);
      expect(occludesWallFace(closed.tiles[y][x])).toBe(true);
      const closedKeys = new Set(labFaceKeys(enumerateLabFaces(closed)));

      const opened = cloneFloor();
      opened.tiles[y][x].secretOpen = true;
      expect(occludesWallFace(opened.tiles[y][x])).toBe(false);
      const openFaces = enumerateLabFaces(opened);
      const openKeys = new Set(labFaceKeys(openFaces));

      for (const key of closedKeys) {
        expect(openKeys.has(key), `${key} vanished after secret (${x},${y}) opened`).toBe(true);
      }
      const added = [...openKeys].filter((k) => !closedKeys.has(k));
      expect(added.length, `neighbor faces appear when (${x},${y}) opens`).toBeGreaterThan(0);
      const secretFaces = openFaces.filter((f) => f.cellX === x && f.cellY === y && f.face !== 'floor' && f.face !== 'ceiling');
      expect(secretFaces.every((f) => f.kind === 'secret-open' && !f.voxelOk)).toBe(true);
    }
  });
});

describe('gameplay tile-light table is untouched', () => {
  it('keeps tileBrightness(19,8)=0.05848 and 0 dark/lit flips', () => {
    const lighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: 1,
      bright: 1,
      oil: () => 2
    });
    lighting.setPartyPosition(19, 5);
    expect(lighting.sourceLight(19, 8)).toBe(0);
    expect(lighting.isSquareLit(19, 7)).toBe(false);
    expect(lighting.calculateBrightness(19, 8, false)).toBeCloseTo(0.05848, 5);
    expect(lighting.ambientBrightness()).toBeCloseTo(0.05848, 5);
    lighting.setPartyPosition(1, 6);
    expect(lighting.isSquareLit(1, 6)).toBe(true);
    lighting.setPartyPosition(19, 5);
    expect(lighting.isSquareLit(19, 7)).toBe(false);
    expect(lighting.isSquareLit(19, 5)).toBe(true);
  });
});

describe('lantern follows the camera during step/turn tweens', () => {
  it('sits on the hold offset of the live camera, not the integer party square', () => {
    const cam = new THREE.PerspectiveCamera(CAMERA_FOV, CAMERA_VIEW[0] / CAMERA_VIEW[1], CAMERA_NEAR, 32);
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const mid = new THREE.Vector3();
    poseGridCamera(cam, 1, 7, 0, 0);
    lanternWorldFromCamera(cam, GAME_LANTERN_HOLD, from);
    poseGridCamera(cam, 1, 6, 0, 0);
    lanternWorldFromCamera(cam, GAME_LANTERN_HOLD, to);

    const t = 0.5;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const gx = 1;
    const gy = 7 + (6 - 7) * eased;
    poseGridCamera(cam, gx, gy, 0, Math.sin(t * Math.PI) * 0.038);
    lanternWorldFromCamera(cam, GAME_LANTERN_HOLD, mid);

    expect(mid.z).toBeGreaterThan(Math.min(from.z, to.z));
    expect(mid.z).toBeLessThan(Math.max(from.z, to.z));
    expect(Math.abs(mid.z - from.z)).toBeGreaterThan(0.2);
    expect(Math.abs(mid.z - to.z)).toBeGreaterThan(0.2);
    expect(MOVE_DURATION).toBe(180);
  });

  it('Player.update at mid-step has already moved the camera off the start square', () => {
    const cam = new THREE.PerspectiveCamera(CAMERA_FOV, CAMERA_VIEW[0] / CAMERA_VIEW[1], CAMERA_NEAR, 32);
    const player = new Player(cam, floor1);
    player.setPosition(1, 7, 0);
    const start = lanternWorldFromCamera(cam);
    player.moveForward();
    expect(player.isMoving).toBe(true);
    player.moveStartTime = performance.now() - MOVE_DURATION * 0.5;
    player.update(16);
    const mid = lanternWorldFromCamera(cam);
    expect(player.x).toBe(1);
    expect(player.y).toBe(7);
    expect(mid.distanceTo(start)).toBeGreaterThan(CELL_SIZE * 0.15);
  });
});

describe('pluggable height maps', () => {
  it('names <texture>_height.png next to the albedo', () => {
    expect(heightMapFilename('wall_plain.png')).toBe('wall_plain_height.png');
    expect(heightMapFilename('wall_plain_2.png')).toBe('wall_plain_2_height.png');
    expect(albedoFilenameFromHeight('door_panel_height.png')).toBe('door_panel.png');
  });

  it('keeps *_height.png off colour and variant lists so Classic stays pixel-identical', () => {
    const onDisk = readdirSync(resolve(__dirname, '../public/proto3d/tex3d')).filter((f) => f.endsWith('.png'));
    expect(onDisk).toEqual(
      expect.arrayContaining(['wall_plain_height.png', 'door_open_height.png', 'door_panel_height.png'])
    );
    expect(isHeightMapFilename('wall_plain_height.png')).toBe(true);
    expect(isHeightMapFilename('wall_plain.png')).toBe(false);
    const mixed = ['wall_plain.png', 'wall_plain_height.png', 'wall_plain_2.png', 'door_open_height.png'];
    expect(mixed.filter((f) => !isHeightMapFilename(f))).toEqual(['wall_plain.png', 'wall_plain_2.png']);
    expect(variantFilenames('wall_plain', mixed)).toEqual(['wall_plain.png', 'wall_plain_2.png']);
    const colour = listedTex3dFiles();
    expect(colour.some(isHeightMapFilename)).toBe(false);
    expect(colour).toContain('wall_plain.png');
    expect(colour).toContain('door_open.png');
    expect(listedHeightMapFiles()).toEqual(
      expect.arrayContaining(['wall_plain_height.png', 'door_open_height.png', 'door_panel_height.png'])
    );
    expect(variantFilenames('wall_plain', onDisk).some((f) => f.includes('height'))).toBe(false);
    for (const name of ['wall_plain_height.png', 'door_open_height.png', 'door_panel_height.png']) {
      const buf = readFileSync(resolve(__dirname, '../public/proto3d/tex3d', name));
      expect(buf.readUInt32BE(16), `${name} width`).toBe(128);
      expect(buf.readUInt32BE(20), `${name} height`).toBe(128);
    }
  });

  it('uses a height map when registered and stays flat without one', () => {
    const albedo = {
      width: 4,
      height: 4,
      data: new Uint8ClampedArray(4 * 4 * 4).fill(90)
    };
    for (let i = 3; i < albedo.data.length; i += 4) albedo.data[i] = 255;
    const lumaVol = volumeFromImageData(albedo);
    expect(lumaVol.dims[2]).toBe(DEPTH_LAYERS);

    const height = {
      width: 4,
      height: 4,
      data: new Uint8ClampedArray(4 * 4 * 4)
    };
    for (let i = 0; i < 16; i++) {
      const o = i * 4;
      const bright = i === 0;
      height.data[o] = bright ? 220 : 20;
      height.data[o + 1] = bright ? 220 : 20;
      height.data[o + 2] = bright ? 220 : 20;
      height.data[o + 3] = 255;
    }
    const withH = volumeFromAlbedoAndHeight(albedo, height);
    expect(withH.dims[2]).toBe(DEPTH_LAYERS);
    expect(withH.voxelCount).toBeGreaterThan(0);

    const factory = makeReliefFactory(new Map([['wall_plain.png', height]]));
    expect(factory('wall_plain.png', albedo).kind).toBe('height-map');
    expect(factory('wall_knot.png', albedo).kind).toBe('none');
    expect(factory('wall_plain_2.png', albedo).kind).toBe('none');
    expect(downsampleImageData(albedo, 2).width).toBeLessThanOrEqual(2);
  });

  it('treats transparent height pixels as 0 (deepest)', () => {
    const albedo = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray(2 * 2 * 4).fill(200)
    };
    for (let i = 3; i < albedo.data.length; i += 4) albedo.data[i] = 255;
    const height = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray(2 * 2 * 4)
    };
    height.data[3] = 0;
    height.data[7] = 255;
    height.data[4] = 255;
    height.data[5] = 255;
    height.data[6] = 255;
    const vol = volumeFromAlbedoAndHeight(albedo, height);
    expect(vol.voxelCount).toBe(4);
  });
});

describe('height relief toggle defaults on for lab', () => {
  it('is on unless ?relief=off', () => {
    expect(heightReliefFromSearch(new URLSearchParams(''))).toBe(true);
    expect(heightReliefFromSearch(new URLSearchParams('render=lab'))).toBe(true);
    expect(heightReliefFromSearch(new URLSearchParams('relief=off'))).toBe(false);
    expect(heightReliefFromSearch(new URLSearchParams('relief=0'))).toBe(false);
  });

  it('writes relief=off on the URL when toggled off', () => {
    const loc = { href: 'http://127.0.0.1/sunken-keep/proto3d.html?render=lab' };
    const hrefs: string[] = [];
    vi.stubGlobal('window', { location: loc });
    vi.stubGlobal('history', {
      replaceState: (_s: unknown, _t: string, url: string) => {
        hrefs.push(String(url));
        loc.href = String(url);
      }
    });
    syncHeightReliefQuery(false);
    expect(hrefs.at(-1)).toContain('relief=off');
    syncHeightReliefQuery(true);
    expect(hrefs.at(-1)).not.toMatch(/[?&]relief=/);
  });
});

describe('torch audio stays on game-state hooks', () => {
  it('does not start or stop crackle loops from lab-render sconce meshes', () => {
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(main).toContain('startTorchLoop(sconce)');
    expect(main).toContain('stopTorchLoop(sconce)');
    const audio = readFileSync(resolve(__dirname, '../src/proto3d/audio.ts'), 'utf8');
    expect(audio).toContain('audio.setVolume(0.42)');
    const labDir = ['index.ts', 'lights.ts', 'world.ts', 'sprites.ts'].map((f) =>
      readFileSync(resolve(__dirname, `../src/proto3d/lab-render/${f}`), 'utf8')
    );
    for (const src of labDir) {
      expect(src).not.toContain('startTorchLoop');
      expect(src).not.toContain('stopTorchLoop');
    }
    expect(audio).toContain('audio.setVolume(0.42)');
    expect(main).toContain('this.audioManager.stopTorchLoop(sconce)');
  });
});

describe('sprites stay tinted by their square', () => {
  it('tints billboards from wallTintRgb at sprite.x, sprite.y', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/lab-render/sprites.ts'), 'utf8');
    expect(src).toContain('wallTintRgb(sprite.x, sprite.y');
    expect(src).toContain('mat.color.setRGB');
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
