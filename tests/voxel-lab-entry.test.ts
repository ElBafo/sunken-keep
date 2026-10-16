import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('voxel-lab is a standalone Vite page', () => {
  const html = readFileSync(resolve(__dirname, '../voxel-lab.html'), 'utf8');
  const viteTs = readFileSync(resolve(__dirname, '../vite.config.ts'), 'utf8');
  const viteJs = readFileSync(resolve(__dirname, '../vite.config.js'), 'utf8');
  const index = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
  const proto = readFileSync(resolve(__dirname, '../proto3d.html'), 'utf8');

  it('has its own full-screen canvas and does not load the game', () => {
    expect(html).toContain('src="/src/voxel-lab/main.ts"');
    expect(html).not.toContain('src="/src/proto3d/main.ts"');
    expect(html).toContain('id="lab-canvas"');
    expect(html).toContain('id="stats"');
    expect(html).toContain('id="btn-shadows"');
    expect(html).toContain('id="btn-lantern"');
    expect(html).toContain('id="btn-mode"');
    expect(html).toContain('id="btn-fwd"');
    expect(html).toContain('id="btn-back"');
    expect(html).toContain('id="btn-left"');
    expect(html).toContain('id="btn-right"');
    expect(html).toContain('Turn Left');
    expect(html).toContain('Turn Right');
    expect(html).toContain('id="btn-match"');
    expect(html).toContain('id="slider-warmth"');
    expect(html).toContain('Light warmth');
    expect(html).toContain('Match game');
    expect(html).not.toContain('id="party-hud"');
    expect(html).not.toContain('id="game-stage"');
  });

  it('turn buttons are at least 44px for thumbs', () => {
    expect(html).toMatch(/button\.lab[\s\S]*min-height:\s*4[4-9]px/);
    expect(html).toMatch(/button\.lab\.turn[\s\S]*min-height:\s*4[4-9]px/);
    expect(html).toMatch(/button\.lab\.turn[\s\S]*min-width:\s*(?:4[4-9]|[5-9]\d|\d{3,})px/);
  });

  it('stats HUD is copyable and large enough to read on a phone', () => {
    expect(html).toMatch(/#stats[\s\S]*font-size:\s*16px/);
    expect(html).toMatch(/#stats[\s\S]*user-select:\s*text/);
    expect(html).toMatch(/#stats[\s\S]*-webkit-user-select:\s*text/);
    expect(html).toMatch(/#stats[\s\S]*white-space:\s*nowrap/);
  });

  it('is registered on the GitHub Pages multi-page build', () => {
    expect(viteTs).toContain('voxel-lab.html');
    expect(viteJs).toContain('voxel-lab.html');
  });

  it('does not alter the game HTML entries', () => {
    expect(index).toContain('src="/src/proto3d/main.ts"');
    expect(proto).toContain('src="/src/proto3d/main.ts"');
    expect(index).not.toContain('voxel-lab');
    expect(proto).not.toContain('voxel-lab');
  });

  it('does not import proto3d wall-mount cull or share the game camera', () => {
    const labMain = readFileSync(resolve(__dirname, '../src/voxel-lab/main.ts'), 'utf8');
    expect(labMain).not.toContain('wall-near-cull');
    expect(labMain).not.toContain('proto3d/torches');
    expect(labMain).not.toContain('proto3d/main');
    expect(labMain).toContain("from './constants'");
  });

  it('full multi-page dist shares one three.js chunk; voxel-lab does not load the game', () => {
    const dist = resolve(__dirname, '../dist');
    const proto = resolve(dist, 'proto3d.html');
    const lab = resolve(dist, 'voxel-lab.html');
    if (!existsSync(proto) || !existsSync(lab)) return;
    const protoHtml = readFileSync(proto, 'utf8');
    const labHtml = readFileSync(lab, 'utf8');
    const threeScripts = protoHtml.match(/assets\/three\.module-[^"]+\.js/g) ?? [];
    expect(threeScripts.length, 'proto3d loads the shared three chunk').toBeGreaterThan(0);
    expect(labHtml, 'voxel-lab preloads the same three chunk').toContain(threeScripts[0]);
    expect(protoHtml).not.toContain('voxelLab-');
    expect(labHtml).not.toMatch(/assets\/main-[^"]+\.js/);
    const assets = readdirSync(resolve(dist, 'assets')).filter((f) => f.endsWith('.js') && !f.endsWith('.map'));
    const threeChunks = assets.filter((f) => f.startsWith('three.module-'));
    expect(threeChunks, 'one shared three.js chunk, not two copies').toEqual([threeScripts[0].split('/').pop()]);
  });
});
