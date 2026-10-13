import { describe, expect, it } from 'vitest';
import { INTRO_SKIP_MIN_TAP_PX } from '../src/proto3d/intro-skip';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('intro skip copy and tap size', () => {
  it('uses ui_text intro.skip in English and Greek', () => {
    const en = JSON.parse(readFileSync(resolve(__dirname, '../public/story/ui_text.json'), 'utf8')) as {
      intro: { skip: string };
    };
    const el = JSON.parse(readFileSync(resolve(__dirname, '../public/story/el/ui_text.el.json'), 'utf8')) as {
      intro: { skip: string };
    };
    expect(en.intro.skip).toBe('Skip');
    expect(el.intro.skip).toBe('Παράλειψη');
    expect(INTRO_SKIP_MIN_TAP_PX).toBeGreaterThanOrEqual(44);
  });
});
