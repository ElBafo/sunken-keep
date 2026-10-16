import { readFileSync } from 'fs';
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
});
