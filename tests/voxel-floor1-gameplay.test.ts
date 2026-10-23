import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { INTRO_SKIP_MIN_TAP_PX } from '../src/proto3d/intro-skip';
import { wrapLogMessage } from '../src/voxel-floor1/portrait-layout';
import { DOOR_LOCKED_MESSAGE, floor1BarkAt, HERO_HURT_STEMS, parseGameplayFlags } from '../src/voxel-floor1/gameplay';
import { PartyBag } from '../src/proto3d/bag';
import { canEquip, preferredHand } from '../src/proto3d/items';
import { classicFloor1Loot } from '../src/voxel-floor1/loot';
import { floor1Map, resetFloor1Loot, tileAt } from '../src/voxel-floor1/layout';

type BarkRow = { trigger: string; speaker: string; text: string };

const html = readFileSync(resolve(__dirname, '../voxel-floor1.html'), 'utf8');
const gameplay = readFileSync(resolve(__dirname, '../src/voxel-floor1/gameplay.ts'), 'utf8');
const main = readFileSync(resolve(__dirname, '../src/voxel-floor1/main.ts'), 'utf8');
const index = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const protoMain = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
const barks = JSON.parse(readFileSync(resolve(__dirname, '../public/barks.json'), 'utf8')) as BarkRow[];
const log = JSON.parse(readFileSync(resolve(__dirname, '../public/log.json'), 'utf8')) as Array<{
  key: string;
  text: string;
}>;

describe('voxel floor 1 intro / audio / bark port', () => {
  it('reuses Classic intro, title, audio, and bark modules instead of copying them', () => {
    expect(gameplay).toContain("from '../proto3d/intro'");
    expect(gameplay).toContain("from '../proto3d/intro-skip'");
    expect(gameplay).toContain("from '../proto3d/title'");
    expect(gameplay).toContain("from '../proto3d/audio'");
    expect(gameplay).toContain("from '../proto3d/floor1-sounds'");
    expect(gameplay).toContain("from '../proto3d/bark-picker'");
    expect(HERO_HURT_STEMS.join(' ')).toMatch(/brannoc/);
    expect(HERO_HURT_STEMS.join(' ')).toMatch(/wren/);
    expect(HERO_HURT_STEMS.join(' ')).toMatch(/ilsevar/);
    expect(HERO_HURT_STEMS.join(' ')).toMatch(/mags/);
    expect(gameplay).toContain("from '../proto3d/i18n'");
    expect(gameplay).toContain("from '../proto3d/story-progress'");
    expect(gameplay).toContain("from '../proto3d/bag'");
    expect(gameplay).toContain("from '../proto3d/inventory-ui'");
    expect(gameplay).toContain("from '../proto3d/items'");
    expect(gameplay).toContain("from '../proto3d/layout585'");
    expect(gameplay).toContain("from '../proto3d/note-reader'");
    expect(gameplay).toContain('this.story.readableItem');
    expect(html).toContain('id="note-overlay"');
    expect(html).toContain('id="note-canvas"');
    expect(gameplay).toContain('enterPlayFromIntro');
    expect(gameplay).toContain('mountIntroSkip');
    expect(gameplay).toContain('crossfadeToIntro');
    expect(gameplay).toContain('playHeroHurt');
    expect(gameplay).toContain('playHeroDown');
    expect(gameplay).toContain('startFloorLoops');
    expect(gameplay).toContain("import.meta.env.BASE_URL");
    expect(main).not.toContain("from '../proto3d/");
    expect(index).not.toContain('voxel-floor1/gameplay');
    expect(protoMain).not.toContain('voxel-floor1/gameplay');
  });

  it('skips the intro chrome for ?test=1 so existing floor walk tests stay playable', () => {
    expect(parseGameplayFlags('?test=1')).toEqual({ skipChrome: true, showTitle: false });
    expect(parseGameplayFlags('?test=1&title=1')).toEqual({ skipChrome: false, showTitle: true });
    expect(parseGameplayFlags('')).toEqual({ skipChrome: false, showTitle: false });
    expect(gameplay).toContain("q.get('test') === '1'");
  });

  it('keeps the Classic Skip control on the intro overlay', () => {
    expect(html).toContain('id="intro-overlay"');
    expect(html).toContain('id="intro-canvas"');
    expect(html).toContain('id="tap-to-start"');
    const block = html.slice(html.indexOf('.intro-skip'), html.indexOf('.intro-skip[hidden]'));
    expect(block).toMatch(/top:\s*12px/);
    expect(block).toMatch(/right:\s*12px/);
    expect(block).toMatch(/min-width:\s*44px/);
    expect(block).toMatch(/min-height:\s*44px/);
    expect(INTRO_SKIP_MIN_TAP_PX).toBeGreaterThanOrEqual(44);
    expect(gameplay).toContain('onSkip: () => this.skipIntro()');
    expect(gameplay).toContain('setOnFinished(() => this.skipIntro())');
  });

  it('walks onto the first floor-1 bark tile with the full Mags line', () => {
    expect(tileAt(floor1Map, 2, 9)?.bark).toBe('f1_start');
    expect(floor1BarkAt(2, 9)).toBe('f1_start');
    expect(floor1BarkAt(3, 14)).toBeUndefined();
    const line = barks.find((row) => row.trigger === 'f1_start');
    expect(line?.speaker).toBe('mags');
    expect(line?.text).toBe('Tam went in last spring. If he\'s in here, I\'m finding him.');
    const wrapped = wrapLogMessage(`Mags: ${line!.text}`, 28);
    expect(wrapped.join('')).not.toMatch(/\.\.\.|…/);
    expect(wrapped.join('').replace(/\s+/g, '')).toBe(`Mags:${line!.text}`.replace(/\s+/g, ''));
    const enter = log.find((row) => row.key === 'enter_floor1');
    expect(enter?.text).toMatch(/upper halls/i);
    expect(gameplay).toContain("fire('enter_floor1')");
    expect(gameplay).toContain('this.hooks?.pushLog(line)');
  });

  it('does not touch Classic pages or voxel water / floor overlay files', () => {
    expect(gameplay).not.toContain("from './water'");
    expect(gameplay).not.toContain('water-decals');
    expect(main).toContain("from './water'");
    expect(index).toContain('src="/src/proto3d/main.ts"');
  });

  it('maps Classic floor-1 loot onto the same voxel cells', () => {
    const loot = classicFloor1Loot();
    expect(loot).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x: 2, y: 5, item: 'key' }),
        expect.objectContaining({ x: 6, y: 3, item: 'potion_red' }),
        expect.objectContaining({ x: 5, y: 5, item: 'potion_blue' }),
        expect.objectContaining({ x: 7, y: 7, item: 'potion_green' }),
        expect.objectContaining({ x: 12, y: 8, item: 'oil_flask' }),
        expect.objectContaining({ x: 4, y: 10, item: 'potion_red' }),
        expect.objectContaining({ x: 4, y: 13, item: 'journal_page', journalPage: 1 }),
        expect.objectContaining({ x: 5, y: 7, chest: true, chestItems: ['potion_red'] })
      ])
    );
    expect(loot.some((row) => row.x === 4 && row.y === 2)).toBe(false);
  });

  it('keeps the keyhole lock line and can pick up a key, then equip from the bag', () => {
    expect(DOOR_LOCKED_MESSAGE).toBe('The door is locked. It needs a key.');
    expect(gameplay).toContain('DOOR_LOCKED_MESSAGE');
    expect(gameplay).toContain("playDoor('door_locked'");
    expect(gameplay).toContain("playDoor('door_unlock'");
    expect(main).toContain("showPrompt('The door is locked. It needs a key.')");
    expect(main).toContain('pickupItemAt');
    expect(main).toContain('equipBagSlot');
    resetFloor1Loot();
    expect(tileAt(floor1Map, 2, 5)?.item).toBe('key');
    const bag = new PartyBag();
    const id = tileAt(floor1Map, 2, 5)!.item!;
    expect(bag.add(id)).toBe(1);
    tileAt(floor1Map, 2, 5)!.item = undefined;
    expect(bag.has('key')).toBe(true);
    expect(tileAt(floor1Map, 2, 5)?.item).toBeUndefined();
    expect(bag.remove('key', 1)).toBe(true);
    expect(bag.has('key')).toBe(false);
    bag.add('iron_shield');
    expect(canEquip('iron_shield', 'mags')).toBe(true);
    expect(preferredHand('iron_shield')).toBe('off');
    const taken = bag.takeAt(0, 1);
    expect(taken?.item).toBe('iron_shield');
    bag.add('tricks_pouch');
    expect(bag.has('tricks_pouch')).toBe(true);
    resetFloor1Loot();
  });

  it('opens the classic journal reader from the bag and keeps the HUD bag button above the bag', () => {
    expect(gameplay).toContain('readBagSlot');
    expect(gameplay).toContain('journalIntroKey');
    expect(gameplay).toContain('NOTE_SCROLL_SFX');
    expect(gameplay).not.toMatch(/The Tide asks only for fire/);
    expect(html).toMatch(/#btn-bag\s*\{\s*z-index:\s*100;/);
    expect(html).toMatch(/#inventory-screen[\s\S]*z-index:\s*90/);
    expect(html).toMatch(/#note-overlay[\s\S]*z-index:\s*400/);
  });
});
