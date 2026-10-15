import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('site root serves the 3D game', () => {
  const index = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
  const proto = readFileSync(resolve(__dirname, '../proto3d.html'), 'utf8');
  const manifest = JSON.parse(
    readFileSync(resolve(__dirname, '../public/manifest.json'), 'utf8')
  ) as { start_url: string; icons: Array<{ src: string }> };
  const protoManifest = JSON.parse(
    readFileSync(resolve(__dirname, '../public/proto3d/manifest.json'), 'utf8')
  ) as { start_url: string; icons: Array<{ src: string }> };

  it('index.html loads the 3D entry and tap-to-start overlay', () => {
    expect(index).toContain('src="/src/proto3d/main.ts"');
    expect(index).not.toContain('src="/src/main.ts"');
    expect(index).toContain('id="tap-to-start"');
    expect(index).toContain('id="render-canvas"');
    expect(index).toContain('id="note-canvas"');
    expect(index).toContain('href="%BASE_URL%manifest.json"');
    expect(index).toMatch(/apple-touch-icon[^>]+icon_drowning_180\.png/);
  });

  it('proto3d.html remains a 3D entry so old links and Home Screen icons work', () => {
    expect(proto).toContain('src="/src/proto3d/main.ts"');
    expect(proto).toContain('id="tap-to-start"');
    expect(proto).toContain('id="render-canvas"');
    expect(proto).toContain('href="%BASE_URL%proto3d/manifest.json"');
  });

  it('manifests start at the 3D game with app icons', () => {
    expect(manifest.start_url).toBe('./');
    expect(manifest.icons.map((i) => i.src)).toEqual(
      expect.arrayContaining(['icon_drowning_192.png', 'icon_drowning_512.png'])
    );
    expect(protoManifest.start_url).toContain('proto3d.html');
    expect(protoManifest.icons.some((i) => i.src.includes('icon_drowning'))).toBe(true);
  });

  it('unknown URLs redirect to the 3D game instead of 404ing', () => {
    const notFound = readFileSync(resolve(__dirname, '../public/404.html'), 'utf8');
    expect(notFound).toContain('/sunken-keep/');
    expect(notFound).toContain('location.replace');
    expect(notFound).toMatch(/Play The Sunken Keep/i);
  });
});
