import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('site root serves the voxel game', () => {
  const index = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
  const classic = readFileSync(resolve(__dirname, '../classic.html'), 'utf8');
  const proto = readFileSync(resolve(__dirname, '../proto3d.html'), 'utf8');
  const voxel = readFileSync(resolve(__dirname, '../voxel-floor1.html'), 'utf8');
  const lab = readFileSync(resolve(__dirname, '../voxel-lab.html'), 'utf8');
  const sw = readFileSync(resolve(__dirname, '../public/sw.js'), 'utf8');
  const viteTs = readFileSync(resolve(__dirname, '../vite.config.ts'), 'utf8');
  const viteJs = readFileSync(resolve(__dirname, '../vite.config.js'), 'utf8');
  const manifest = JSON.parse(
    readFileSync(resolve(__dirname, '../public/manifest.json'), 'utf8')
  ) as { start_url: string; id?: string; icons: Array<{ src: string }> };
  const protoManifest = JSON.parse(
    readFileSync(resolve(__dirname, '../public/proto3d/manifest.json'), 'utf8')
  ) as { start_url: string; icons: Array<{ src: string }> };

  it('index.html loads the voxel Floor 1 entry with Home Screen tags', () => {
    expect(index).toContain('src="/src/voxel-floor1/main.ts"');
    expect(index).not.toContain('src="/src/proto3d/main.ts"');
    expect(index).not.toContain('src="/src/main.ts"');
    expect(index).toContain('id="tap-to-start"');
    expect(index).toContain('id="floor1-canvas"');
    expect(index).toContain('id="title-overlay"');
    expect(index).toContain('id="intro-overlay"');
    expect(index).toContain('id="note-canvas"');
    expect(index).toContain('href="%BASE_URL%manifest.json"');
    expect(index).toMatch(/apple-touch-icon[^>]+icon_drowning_180\.png/);
    expect(index).toContain('apple-mobile-web-app-capable');
    expect(index).toContain('%BASE_URL%sw.js');
    expect(index).not.toContain('voxel-floor1.html');
    expect(index).not.toContain('classic.html');
  });

  it('voxel-floor1.html still loads the same voxel game so old links work', () => {
    expect(voxel).toContain('src="/src/voxel-floor1/main.ts"');
    expect(voxel).toContain('id="floor1-canvas"');
    expect(voxel).toContain('id="title-overlay"');
    expect(voxel).not.toContain('src="/src/proto3d/main.ts"');
  });

  it('classic.html is a hidden proto3d backup and proto3d.html stays playable', () => {
    expect(classic).toContain('src="/src/proto3d/main.ts"');
    expect(classic).toContain('id="tap-to-start"');
    expect(classic).toContain('id="render-canvas"');
    expect(classic).toMatch(/name="robots"[^>]+noindex/);
    expect(classic).not.toContain('href="%BASE_URL%manifest.json"');
    expect(proto).toContain('src="/src/proto3d/main.ts"');
    expect(proto).toContain('href="%BASE_URL%proto3d/manifest.json"');
    expect(lab).toContain('src="/src/voxel-lab/main.ts"');
  });

  it('manifests start at the voxel game with app icons', () => {
    expect(manifest.start_url).toBe('./');
    expect(manifest.id ?? manifest.start_url).toBe('./');
    expect(manifest.icons.map((i) => i.src)).toEqual(
      expect.arrayContaining(['icon_drowning_192.png', 'icon_drowning_512.png'])
    );
    expect(protoManifest.start_url).toContain('proto3d.html');
    expect(protoManifest.icons.some((i) => i.src.includes('icon_drowning'))).toBe(true);
  });

  it('service worker network-fetches HTML so / cannot keep a cached classic shell', () => {
    expect(existsSync(resolve(__dirname, '../public/sw.js'))).toBe(true);
    expect(sw).toContain("request.mode === 'navigate'");
    expect(sw).toContain("cache: 'reload'");
    expect(sw).toContain('caches.delete');
  });

  it('registers classic.html on the GitHub Pages multi-page build', () => {
    expect(viteTs).toContain('classic.html');
    expect(viteJs).toContain('classic.html');
    expect(viteTs).toContain('voxel-floor1.html');
    expect(viteJs).toContain('voxel-lab.html');
  });

  it('built pages keep voxel at / and classic on the backup URL', () => {
    const dist = resolve(__dirname, '../dist');
    const distIndex = resolve(dist, 'index.html');
    const distClassic = resolve(dist, 'classic.html');
    const distVoxel = resolve(dist, 'voxel-floor1.html');
    const distLab = resolve(dist, 'voxel-lab.html');
    if (!existsSync(distIndex) || !existsSync(distClassic)) return;
    const builtIndex = readFileSync(distIndex, 'utf8');
    const builtClassic = readFileSync(distClassic, 'utf8');
    const builtVoxel = readFileSync(distVoxel, 'utf8');
    expect(builtIndex).toContain('id="floor1-canvas"');
    expect(builtIndex).toMatch(/assets\/(?:main|voxelFloor1)-[^"]+\.js/);
    expect(builtIndex).not.toContain('id="game-letterbox"');
    expect(builtClassic).toContain('id="render-canvas"');
    expect(builtClassic).toContain('id="game-letterbox"');
    expect(builtClassic).toMatch(/name="robots"[^>]+noindex/);
    expect(builtVoxel).toContain('id="floor1-canvas"');
    if (existsSync(distLab)) {
      expect(readFileSync(distLab, 'utf8')).toContain('id="lab-canvas"');
    }
  });

  it('unknown URLs redirect to the home game instead of 404ing', () => {
    const notFound = readFileSync(resolve(__dirname, '../public/404.html'), 'utf8');
    expect(notFound).toContain('/sunken-keep/');
    expect(notFound).toContain('location.replace');
    expect(notFound).toMatch(/Play The Sunken Keep/i);
  });
});
