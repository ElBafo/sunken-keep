import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('monster display names', () => {
  it('looks up slime_small from names by id and never builds a name from the id', () => {
    const en = JSON.parse(readFileSync(resolve(__dirname, '../public/story/names.json'), 'utf8')) as {
      monsters: Record<string, string>;
    };
    const el = JSON.parse(readFileSync(resolve(__dirname, '../public/story/el/names.el.json'), 'utf8')) as {
      monsters: Record<string, string>;
    };
    const storyEn = JSON.parse(readFileSync(resolve(__dirname, '../story/names.json'), 'utf8')) as {
      monsters: Record<string, string>;
    };
    const storyEl = JSON.parse(readFileSync(resolve(__dirname, '../story/el/names.el.json'), 'utf8')) as {
      monsters: Record<string, string>;
    };
    expect(en.monsters.slime_small).toBe('slimeling');
    expect(el.monsters.slime_small).toBe('Γλιτσούλα');
    expect(storyEn.monsters.slime_small).toBe('slimeling');
    expect(storyEl.monsters.slime_small).toBe('Γλιτσούλα');

    const i18n = readFileSync(resolve(__dirname, '../src/proto3d/i18n.ts'), 'utf8');
    expect(i18n).toContain("nameIn('monsters', id)");
    expect(i18n).not.toContain('id.replace(/_/g');
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(main).toContain('this.story.monsterName(out.monster)');
  });
});
