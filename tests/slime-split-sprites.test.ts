import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { monsterLodName } from '../src/proto3d/sprites';
import { SLIME_PAIR_OFFSET_FRAC } from '../src/core/slime-pair';

const sprites = readFileSync(resolve(__dirname, '../src/proto3d/sprites.ts'), 'utf8');
const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');

describe('slimeling split / death / LOD', () => {
  it('disposes the big slime render object on split and blocks a late floor re-add', () => {
    const split = main.slice(main.indexOf("case 'slime_split'"), main.indexOf("case 'hero'"));
    expect(split).toContain('disposeMonsterId(e.from)');
    expect(split).toContain('blockFloorSpawn');
    expect(split).toContain('addLiveMonster');
    expect(sprites).toContain('disposeMonsterId');
    expect(sprites).toContain('floorSpawnBlocked');
    expect(sprites).toContain('removeFromParent');
    expect(sprites).toContain('liveAdded');
  });

  it('does not let lantern updates reshow a hidden or disposed monster', () => {
    const fn = sprites.slice(sprites.indexOf('setLitVisible'), sprites.indexOf('private loadTex'));
    expect(fn).toContain('sprite.hidden');
    expect(fn).toContain('sprite.disposed');
    expect(fn).toContain('sprite.object.visible = false');
  });

  it('keeps death over hurt/idle, then detaches after the last death frame', () => {
    expect(sprites).toContain("anim !== 'death'");
    expect(sprites).toContain('s.dying');
    expect(sprites).toContain('finishDeath');
    expect(sprites).toMatch(/anim === 'death'[\s\S]*detachMonster|finishDeath\(sprite\)/);
  });

  it('uses near/mid/far at 2/3/4 squares with the 0.55 pair offset', () => {
    expect(monsterLodName(2, true)).toBe('near');
    expect(monsterLodName(3, true)).toBe('mid');
    expect(monsterLodName(4, true)).toBe('far');
    expect(SLIME_PAIR_OFFSET_FRAC).toBe(0.55);
    expect(sprites).toContain('SLIME_PAIR_OFFSET_FRAC * size.w');
    expect(sprites).toContain('lodSets?.mid');
    expect(sprites).toContain('lodSets?.far');
  });

  it('keeps monster bodies visible across the 1-4 square LOD range', () => {
    const dark = readFileSync(resolve(__dirname, '../src/proto3d/dark-fx.ts'), 'utf8');
    expect(dark).toContain('cheb <= 4');
    expect(sprites).toContain('syncLiveMonsters');
    expect(sprites).toContain('object.visible = true');
  });
});
