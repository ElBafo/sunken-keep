import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('layout585 oil bar', () => {
  it('places Wren’s oil gauge at [70,440,65,6]', () => {
    const layout = JSON.parse(
      readFileSync(resolve(__dirname, '../public/art/ui/layout585/layout585.json'), 'utf8')
    ) as { oilBar: number[] };
    expect(layout.oilBar).toEqual([70, 440, 65, 6]);
  });
});
