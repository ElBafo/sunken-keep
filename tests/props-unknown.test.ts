import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('unknown props', () => {
  it('warns instead of drawing a placeholder box', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/props.ts'), 'utf8');
    expect(src).toContain('Unknown prop');
    expect(src).toContain('console.warn');
    expect(src).not.toMatch(/addGeneric/);
  });
});
