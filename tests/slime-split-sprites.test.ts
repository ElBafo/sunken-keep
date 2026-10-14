import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { monsterLodName } from '../src/proto3d/sprites';
import { SLIME_PAIR_OFFSET_FRAC } from '../src/core/slime-pair';
import { eyeLiftFor, monsterBodyVisible } from '../src/proto3d/dark-fx';

const sprites = readFileSync(resolve(__dirname, '../src/proto3d/sprites.ts'), 'utf8');
const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
const dark = readFileSync(resolve(__dirname, '../src/proto3d/dark-fx.ts'), 'utf8');

describe('slimeling split / death / LOD', () => {
  it('disposes the big slime on split, blocks a late floor re-add, and retires the id', () => {
    const split = main.slice(main.indexOf("case 'slime_split'"), main.indexOf("case 'hero'"));
    expect(split).toContain('disposeMonsterId(e.from)');
    expect(split).toContain('blockFloorSpawn');
    expect(split).toContain('detachFloorMonsterAt');
    expect(split).toContain('addLiveMonster');
    expect(split).toContain('addEyeForHost');
    expect(split).toContain('removeFloorEyes');
    expect(split).toContain("removeFloorEyes('slime'");
    expect(sprites).toContain('disposeMonsterId');
    expect(sprites).toContain('retiredMonsterIds');
    expect(sprites).toContain('dropDuplicateMonsterSprites');
    expect(sprites).toContain('floorSpawnBlocked');
    expect(sprites).toContain('removeFromParent');
    expect(sprites).toContain('liveAdded');
  });

  it('does not let lantern updates or death anim reshow a disposed monster', () => {
    const fn = sprites.slice(sprites.indexOf('setLitVisible'), sprites.indexOf('private loadTex'));
    expect(fn).toContain('sprite.hidden');
    expect(fn).toContain('sprite.disposed');
    expect(fn).toContain('sprite.object.visible = false');
    expect(sprites).toMatch(/if \(s\.disposed\) return/);
    expect(sprites).not.toMatch(/anim === 'death'[\s\S]{0,80}s\.disposed = false/);
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

  it('draws a body only when lit or adjacent — not every monster within 4 squares', () => {
    expect(dark).not.toContain('cheb <= 4');
    expect(monsterBodyVisible({ adjacent: false, squareLit: false })).toBe(false);
    expect(monsterBodyVisible({ adjacent: true, squareLit: false })).toBe(true);
    expect(monsterBodyVisible({ adjacent: false, squareLit: true })).toBe(true);
    expect(monsterBodyVisible({ adjacent: false, squareLit: false, forceLit: true })).toBe(true);
    expect(main).toContain('fireSlimeReveal');
    expect(main).toContain("speakBark('slime_reveal')");
  });

  it('lifts eyes from monster height and splits one pair per slimeling', () => {
    expect(eyeLiftFor('slime', 0.39)).toBeCloseTo(0.273, 3);
    expect(eyeLiftFor('slime_small', 0.312)).toBeCloseTo(0.2184, 3);
    expect(eyeLiftFor('keep_rat', 0.25)).toBe(0.15);
    expect(dark).toContain('addEyeForHost');
    expect(dark).toContain('removeEyeById');
    expect(dark).toContain('removeFloorEyes');
    expect(dark).toContain('syncEyes');
    expect(dark).toContain('host.object.position.x');
    expect(dark).not.toMatch(/else eye\.monsterId = undefined/);
  });

  it('restores a lone slimeling centred, unflipped, with pan 0', () => {
    expect(sprites).toContain('livingPairVisual');
    expect(main).toContain('syncSlimelingPans');
    expect(main).toContain('visual.pairSlot ? SLIME_SMALL_PAN[visual.pairSlot] : 0');
  });
});
