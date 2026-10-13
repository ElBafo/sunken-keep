import { describe, expect, it } from 'vitest';
import { listedTex3dFiles, variantFilenames } from '../src/proto3d/texture-variants';
import { hasWallMips, wallMipSpec } from '../src/proto3d/wall-mips';

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
});
