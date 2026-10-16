import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { listedTex3dFiles, variantFilenames } from '../src/proto3d/texture-variants';
import { hasWallMips, wallMipSpec } from '../src/proto3d/wall-mips';

function pngSize(rel: string): { w: number; h: number; bytes: number } {
  const buf = readFileSync(resolve(__dirname, '../public/proto3d/tex3d', rel));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length };
}

describe('wall mipmaps', () => {
  it('loads artist 128/64/32 chains and ignores those files as variants', () => {
    expect(hasWallMips('wall_plain.png')).toBe(true);
    const spec = wallMipSpec('wall_plain.png');
    expect(spec?.['128']).toBe('wall_plain.png');
    expect(spec?.['64']).toMatch(/_64\.png$/);
    expect(spec?.['32']).toMatch(/_32\.png$/);

    const files = listedTex3dFiles();
    const names = variantFilenames('wall_plain', files);
    expect(names.some((f) => f.includes('_64') || f.includes('_32'))).toBe(false);
    expect(names[0]).toBe('wall_plain.png');
  });

  it('keeps door_panel 64/32 as downscales of the wall-sized 128, not a tiny door sprite', () => {
    const full = pngSize('door_panel.png');
    const m64 = pngSize('door_panel_64.png');
    const m32 = pngSize('door_panel_32.png');
    expect(full).toEqual(expect.objectContaining({ w: 128, h: 128 }));
    expect(m64).toEqual(expect.objectContaining({ w: 64, h: 64 }));
    expect(m32).toEqual(expect.objectContaining({ w: 32, h: 32 }));
    // The old 64 was a ~cut-out lamp/door on black (~few KB). The wall-sized
    // downsample is in the same ballpark as wall_plain_64.
    expect(m64.bytes, 'door_panel_64 is a full wall tile, not the old ~2KB cut-out').toBeGreaterThan(2500);
  });
});
