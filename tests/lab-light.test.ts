import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TORCH_COLOR, LANTERN_COLOR } from '../src/voxel-lab/constants';
import { floor1, floor1Sconces } from '../src/proto3d/floor-data';
import {
  LAB_AMBIENT_SCALE,
  LAB_LANTERN_HEX,
  LAB_LANTERN_RGB,
  LAB_TORCH_HEX,
  LAB_TORCH_RGB,
  hexToRgb01,
  labLightFromSearch,
  syncLabLightQuery
} from '../src/proto3d/lab-light';
import { canLabPatch } from '../src/proto3d/lab-look';
import { createSurfaceLightShared, isSurfaceLitKind, VOXEL_SUNBEAM_INTENSITY } from '../src/proto3d/surface-light';
import { neutralizeBakedVertexColors, VertexLightingManager } from '../src/proto3d/vertex-lighting';
import * as THREE from 'three';

describe('lab light opt-in', () => {
  it('is off unless ?light=lab', () => {
    expect(labLightFromSearch(new URLSearchParams(''))).toBe(false);
    expect(labLightFromSearch(new URLSearchParams('debug=light'))).toBe(false);
    expect(labLightFromSearch(new URLSearchParams('light=1'))).toBe(false);
    expect(labLightFromSearch(new URLSearchParams('light=game'))).toBe(false);
    expect(labLightFromSearch(new URLSearchParams('light=lab'))).toBe(true);
  });

  it('does not load voxel-lab from the always-imported opt-in module', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/lab-light.ts'), 'utf8');
    expect(src).not.toContain('voxel-lab.html');
    expect(src).not.toContain('src/voxel-lab');
    expect(src).not.toContain('three');
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(main).toContain("from './lab-light'");
    expect(main).toContain("await import('./lab-look')");
    expect(main).toMatch(/import type \{ LabLook \} from '\.\/lab-look'/);
  });

  it('uses the lab torch and lantern hues, not the game vertex palette', () => {
    expect(LAB_TORCH_HEX).toBe(TORCH_COLOR);
    expect(LAB_LANTERN_HEX).toBe(LANTERN_COLOR);
    expect(LAB_TORCH_RGB).toEqual(hexToRgb01(0xff9a48));
    expect(LAB_LANTERN_RGB).toEqual(hexToRgb01(0xead1a3));
    expect(LAB_TORCH_RGB[1], 'lab torch is yellower than game [1, 0.86, 0.58]').toBeLessThan(0.7);
    expect(LAB_TORCH_RGB[2]).toBeLessThan(0.35);
  });
});

describe('lab look keeps gameplay lighting', () => {
  it('does not change sourceLight / isSquareLit / ambient tile table', () => {
    const lighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: 1,
      bright: 1,
      oil: () => 2
    });
    lighting.skipSurfaceBake = true;
    lighting.setPartyPosition(19, 5);
    expect(lighting.sourceLight(19, 8)).toBe(0);
    expect(lighting.isSquareLit(19, 7)).toBe(false);
    expect(lighting.calculateBrightness(19, 8, false)).toBeCloseTo(0.05848, 5);
    expect(lighting.ambientBrightness()).toBeCloseTo(0.05848, 5);
    expect(LAB_AMBIENT_SCALE).toBe(0.55);
    const classicShared = createSurfaceLightShared();
    const labShared = createSurfaceLightShared();
    lighting.fillSurfaceShared(classicShared);
    lighting.fillSurfaceShared(labShared, { ambientScale: LAB_AMBIENT_SCALE });
    expect(classicShared.uAmbientRgb.value.x).toBeGreaterThan(0.05);
    expect(labShared.uAmbientRgb.value.x / classicShared.uAmbientRgb.value.x).toBeCloseTo(
      LAB_AMBIENT_SCALE,
      5
    );
    lighting.setPartyPosition(19, 3);
    expect(lighting.isSquareLit(19, 7)).toBe(false);
    expect(lighting.isSquareLit(19, 6)).toBe(false);
  });

  it('sprite lab tint is warmer than the game wall tint', () => {
    const lighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: 1,
      bright: 1,
      oil: () => 2
    });
    lighting.setPartyPosition(1, 7);
    const game = lighting.wallTintRgb(1, 6);
    const lab = lighting.wallTintRgb(1, 6, { torch: LAB_TORCH_RGB, lantern: LAB_LANTERN_RGB });
    expect(lab[0]).toBeGreaterThan(lab[2]);
    expect(lab[1] / lab[0], 'lab torch chroma is more orange').toBeLessThan(game[1] / game[0]);
    lighting.setPartyPosition(19, 3);
    const lair = lighting.wallTintRgb(19, 7, { torch: LAB_TORCH_RGB, lantern: LAB_LANTERN_RGB });
    expect((lair[0] + lair[1] + lair[2]) / 3).toBeCloseTo(lighting.ambientBrightness(), 2);
  });

  it('patches dungeon surfaces and skips props / flames', () => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    wall.userData.kind = 'wall';
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    floor.userData.kind = 'floor';
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    door.userData.kind = 'door-panel';
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    flame.userData.kind = 'torch-flame';
    flame.userData.skipVertexLighting = true;
    const prop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    prop.userData.kind = 'desk';
    prop.userData.lanternProp = true;
    expect(canLabPatch(wall)).toBe(true);
    expect(canLabPatch(floor)).toBe(true);
    expect(canLabPatch(door)).toBe(true);
    expect(isSurfaceLitKind('ceiling')).toBe(true);
    expect(canLabPatch(flame)).toBe(false);
    expect(canLabPatch(prop)).toBe(false);
  });

  it('shader path uses lab hues, 3D sunbeams, gloss, and no palette', () => {
    const look = readFileSync(resolve(__dirname, '../src/proto3d/lab-look.ts'), 'utf8');
    expect(look).toContain('patchVoxelLookMaterial');
    expect(look).toContain('LAB_TORCH_RGB');
    expect(look).toContain('LAB_LANTERN_RGB');
    expect(look).toContain('uSunbeam3D');
    expect(look).toContain('VOXEL_SUNBEAM_INTENSITY');
    expect(look).toContain('setPaletteEnabled(false)');
    expect(look).toContain('LAB_AMBIENT_SCALE');
    expect(look).toContain('skipSurfaceBake');
    expect(look).toContain('neutralizeBakedVertexColors');
    expect(look).toContain('tintSprites');
    const surf = readFileSync(resolve(__dirname, '../src/proto3d/voxel-surface.ts'), 'utf8');
    expect(surf).toContain('do not multiply baked Gouraud');
    expect(surf).toContain('never as a self-glow');
    expect(VOXEL_SUNBEAM_INTENSITY).toBeGreaterThan(0);
    const geom = readFileSync(resolve(__dirname, '../src/proto3d/voxel-geom.ts'), 'utf8');
    expect(geom).toContain('GAME_DEPTH_LAYERS = 3');
  });
});

describe('lab light menu and HTML', () => {
  it('settings menu can toggle lab light without touching voxel-lab', () => {
    const proto = readFileSync(resolve(__dirname, '../proto3d.html'), 'utf8');
    const index = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    expect(proto).toContain('id="btn-lab-light-on"');
    expect(index).toContain('id="btn-lab-light-on"');
    expect(proto).toContain('id="settings-lab-light-label"');
    expect(proto).not.toContain('voxel-lab.html');
    expect(index).not.toContain('src/voxel-lab');
  });

  it('uses Lighting Lab/Classic and 3D walls On/Off', () => {
    const en = JSON.parse(readFileSync(resolve(__dirname, '../public/story/ui_text.json'), 'utf8'));
    const el = JSON.parse(readFileSync(resolve(__dirname, '../public/story/el/ui_text.el.json'), 'utf8'));
    expect(en.step4_title_saves.settings.lab_light).toBe('Lighting');
    expect(en.step4_title_saves.settings.lab_light_lab).toBe('Lab');
    expect(en.step4_title_saves.settings.lab_light_classic).toBe('Classic');
    expect(en.step4_title_saves.settings.voxel).toBe('3D walls');
    expect(el.step4_title_saves.settings.lab_light).toBe('Φως');
    expect(el.step4_title_saves.settings.lab_light_lab).toBe('Lab');
    expect(el.step4_title_saves.settings.lab_light_classic).toBe('Κλασικό');
    const proto = readFileSync(resolve(__dirname, '../proto3d.html'), 'utf8');
    expect(proto).toContain('>Lab</button>');
    expect(proto).toContain('>Classic</button>');
    expect(proto).toContain('id="btn-voxel-on"');
    expect(proto).toContain('id="btn-voxel-off"');
    const labIdx = proto.indexOf('id="settings-lab-light-label"');
    const voxelIdx = proto.indexOf('id="settings-voxel-label"');
    expect(labIdx).toBeGreaterThan(0);
    expect(voxelIdx).toBeGreaterThan(labIdx);
  });

  it('syncs ?light=lab on the URL', () => {
    const loc = { href: 'http://127.0.0.1/sunken-keep/proto3d.html?test=1' };
    const hrefs: string[] = [];
    vi.stubGlobal('window', { location: loc });
    vi.stubGlobal('history', {
      replaceState: (_s: unknown, _t: string, url: string) => {
        hrefs.push(String(url));
        loc.href = String(url);
      }
    });
    syncLabLightQuery(true);
    expect(hrefs.at(-1)).toContain('light=lab');
    syncLabLightQuery(false);
    expect(hrefs.at(-1)).not.toMatch(/[?&]light=/);
  });
});

describe('lab+voxel does not keep the PR #40 bake', () => {
  it('wipes baked vertex colours to white and disables vertexColors', () => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const colors = new Float32Array(geo.attributes.position.count * 3).fill(0.7);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.kind = 'wall';
    mesh.userData.voxelMesh = true;
    neutralizeBakedVertexColors(mesh);
    expect(mat.vertexColors).toBe(false);
    const col = geo.attributes.color;
    expect(col.getX(0)).toBe(1);
    expect(col.getY(0)).toBe(1);
    expect(col.getZ(0)).toBe(1);
  });

  it('registerVoxelMesh skips the Gouraud bake while skipSurfaceBake is on', () => {
    const lighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: 1,
      bright: 1,
      oil: () => 2
    });
    lighting.skipSurfaceBake = true;
    lighting.setPartyPosition(1, 7);
    const geo = new THREE.PlaneGeometry(2, 2);
    const baked = new Float32Array(geo.attributes.position.count * 3).fill(0.85);
    geo.setAttribute('color', new THREE.BufferAttribute(baked, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.kind = 'wall';
    mesh.userData.voxelMesh = true;
    mesh.userData.lightX = 1;
    mesh.userData.lightY = 6;
    lighting.registerVoxelMesh(mesh);
    expect(mat.vertexColors, 'lab must not re-enable vertex colours').toBe(false);
    expect(geo.attributes.color.getX(0)).toBe(1);
  });

  it('Classic registerVoxelMesh still bakes when skipSurfaceBake is off', () => {
    const lighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: 1,
      bright: 1,
      oil: () => 2
    });
    lighting.setPartyPosition(19, 5);
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.kind = 'wall';
    mesh.userData.voxelMesh = true;
    mesh.userData.lightX = 19;
    mesh.userData.lightY = 8;
    lighting.registerVoxelMesh(mesh);
    expect(mat.vertexColors).toBe(true);
    const r = geo.attributes.color.getX(0);
    const g = geo.attributes.color.getY(0);
    const b = geo.attributes.color.getZ(0);
    expect((r + g + b) / 3).toBeCloseTo(lighting.ambientBrightness(), 2);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
