import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('voxel-floor1 is a standalone Vite page', () => {
  const html = readFileSync(resolve(__dirname, '../voxel-floor1.html'), 'utf8');
  const viteTs = readFileSync(resolve(__dirname, '../vite.config.ts'), 'utf8');
  const viteJs = readFileSync(resolve(__dirname, '../vite.config.js'), 'utf8');
  const index = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
  const proto = readFileSync(resolve(__dirname, '../proto3d.html'), 'utf8');
  const lab = readFileSync(resolve(__dirname, '../voxel-lab.html'), 'utf8');
  const main = readFileSync(resolve(__dirname, '../src/voxel-floor1/main.ts'), 'utf8');

  it('has its own full-screen canvas and does not load the game', () => {
    expect(html).toContain('src="/src/voxel-floor1/main.ts"');
    expect(html).not.toContain('src="/src/proto3d/main.ts"');
    expect(html).toContain('id="floor1-canvas"');
    expect(html).toContain('id="btn-fwd"');
    expect(html).toContain('id="btn-back"');
    expect(html).toContain('id="btn-left"');
    expect(html).toContain('id="btn-right"');
    expect(html).toContain('id="btn-strafe-left"');
    expect(html).toContain('id="btn-strafe-right"');
    expect(html).toContain('id="btn-quality"');
    expect(html).toContain('id="btn-door"');
    expect(html).toContain('id="game-hud"');
    expect(html).toContain('id="party-strip"');
    expect(html).toContain('id="message-log"');
    expect(html).toContain('id="move-pad"');
    expect(html).toContain('env(safe-area-inset-top');
    expect(html).not.toContain('id="party-hud"');
    expect(html).not.toContain('id="game-stage"');
    expect(html).not.toContain('id="game-letterbox"');
  });

  it('hides the fps readout unless ?dev=1', () => {
    expect(html).toMatch(/id="hud"[^>]*hidden/);
    expect(main).toContain("q.get('dev') === '1'");
  });

  it('is registered on the GitHub Pages multi-page build', () => {
    expect(viteTs).toContain('voxel-floor1.html');
    expect(viteJs).toContain('voxel-floor1.html');
  });

  it('does not alter the game or voxel-lab HTML entries', () => {
    expect(index).toContain('src="/src/proto3d/main.ts"');
    expect(proto).toContain('src="/src/proto3d/main.ts"');
    expect(lab).toContain('src="/src/voxel-lab/main.ts"');
    expect(index).not.toContain('voxel-floor1.html');
    expect(proto).not.toContain('voxel-floor1.html');
    expect(lab).not.toContain('voxel-floor1.html');
  });

  it('does not import proto3d renderer modules', () => {
    expect(main).not.toContain("from '../proto3d/");
    expect(main).not.toContain('lab-render');
    expect(main).toContain('measurePortraitLayout');
    expect(main).toContain('applyCameraProjection');
    expect(main).toContain("from '../voxel-lab/look'");
    expect(main).toContain('torchesActive');
    expect(main).toContain('sunbeamsActive');
    expect(existsSync(resolve(__dirname, '../src/voxel-floor1/level.ts'))).toBe(true);
  });
});
