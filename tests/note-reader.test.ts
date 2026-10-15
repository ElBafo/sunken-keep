import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { audioStemKeys, beforePlayRelPaths } from '../src/proto3d/audio-groups';
import { floor1 } from '../src/proto3d/floor-data';
import type { FontGlyphs } from '../src/proto3d/font5x7';
import { missingFontGlyphs } from '../src/proto3d/font5x7';
import { PartyBag } from '../src/proto3d/bag';
import { isReadable, journalIntroKey, journalTriggerId, NOTE_SCROLL_SFX, usesHeroTarget } from '../src/proto3d/items';
import {
  clampNoteScroll,
  floorReadableEntries,
  JOURNAL_PAGE_FRAMES,
  layoutNote,
  NOTE_PARCHMENT,
  noteVisibleRange,
  wrapNoteText
} from '../src/proto3d/note-reader';

const ROOT = resolve(__dirname, '../public');

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8')) as T;
}

const fontMeta = readJson<{ glyphs: FontGlyphs }>('art/font/font_5x7.json');
const journalEn = readJson<{ pages: Record<string, { lines: string[] }> }>('story/journal_act1.json');
const journalEl = readJson<{ pages: Record<string, { lines: string[] }> }>('story/el/journal_act1.el.json');
const noteEn = readJson<{ title: string; text: string }>('story/note_lampkeeper.json');
const noteEl = readJson<{ title: string; text: string }>('story/el/note_lampkeeper.el.json');
const logEn = readJson<Array<{ key: string; text?: string }>>('log.json');
const logEl = readJson<Array<{ key: string; text?: string }>>('story/el/log.el.json');
const audio = readJson<{ sfx: Record<string, string> }>('audio/audio.json');

function logText(log: Array<{ key: string; text?: string }>, key: string): string {
  return log.find((e) => e.key === key)?.text ?? '';
}

describe('floor 1 readable items', () => {
  it('lists the secret journal page and Pell\'s desk note', () => {
    const { pickups, props } = floorReadableEntries(floor1);
    expect(pickups).toEqual([{ x: 4, y: 13, item: 'journal_page', journalPage: 1 }]);
    expect(isReadable(pickups[0].item)).toBe(true);
    expect(usesHeroTarget(pickups[0].item)).toBe(false);
    expect(props).toEqual([{ x: 12, y: 9, readNote: 'note_lampkeeper', prop: 'desk' }]);
  });

  it('keeps the journal page number on the bag slot', () => {
    const bag = new PartyBag();
    bag.add('journal_page', 1, undefined, { journalPage: 1 });
    expect(bag.slots[0]).toMatchObject({ item: 'journal_page', journalPage: 1 });
    bag.add('journal_page', 1, undefined, { journalPage: 2 });
    expect(bag.slots.map((s) => s.journalPage)).toEqual([1, 2]);
  });
});

describe('story copy for readable items', () => {
  it('loads Orrun page 1 and Pell\'s note in English and Greek', () => {
    expect(journalEn.pages['1'].lines.join('\n')).toContain('The Tide asks only for fire.');
    expect(journalEl.pages['1'].lines.join('\n')).toContain('Η Παλίρροια ζητά μόνο φωτιά.');
    expect(noteEn.title).toMatch(/Lamp-keeper/);
    expect(noteEn.text).toContain("Don't tell him.");
    expect(noteEl.title).toContain('λυχνά');
    expect(noteEl.text).toContain('Πρώτα πήραν');
    expect(logText(logEn, journalIntroKey(1))).toMatch(/Orrun/);
    expect(logText(logEl, journalIntroKey(1))).toMatch(/[Α-ω]/);
    expect(journalTriggerId(1)).toBe('journal_page_1');
  });
});

describe('pixel font coverage', () => {
  it('has glyphs for Greek accents and guillemets', () => {
    const sample = [
      ...journalEl.pages['1'].lines,
      noteEl.title,
      noteEl.text,
      '«Καλημέρα» Ά Έ Ή Ί Ό Ύ Ώ άέήίόύώ'
    ].join('\n');
    expect(fontMeta.glyphs['«']).toEqual({ x: 42, y: 100 });
    expect(fontMeta.glyphs['»']).toEqual({ x: 48, y: 100 });
    expect(fontMeta.glyphs['ά']).toBeTruthy();
    expect(fontMeta.glyphs['Ό']).toBeTruthy();
    expect(missingFontGlyphs(sample, fontMeta.glyphs)).toEqual([]);
  });
});

describe('note reader layout', () => {
  it('wraps long copy and scrolls until the last line is visible', () => {
    const long = Array.from({ length: 28 }, (_, i) => `Line ${i + 1} of a long waterlogged page.`).join('\n');
    const layout = layoutNote('Orrun\'s journal. The ink still holds.', long);
    expect(layout.bodyLines.length).toBeGreaterThan(layout.visible);
    const { maxScroll } = clampNoteScroll(0, layout.lines.length, layout.visible, layout.lineH);
    expect(maxScroll).toBeGreaterThan(0);
    const end = clampNoteScroll(9999, layout.lines.length, layout.visible, layout.lineH);
    expect(end.scroll).toBe(maxScroll);
    const range = noteVisibleRange(end.scroll, layout.lines.length, layout.visible, layout.lineH);
    expect(range.last).toBe(layout.lines.length);
    expect(wrapNoteText('one\n\ntwo', 20)).toEqual(['one', '', 'two']);
  });

  it('loads journal page frames as single PNGs behind the text', () => {
    expect(NOTE_PARCHMENT).toBe('art/dungeon/item_journal_page_near.png');
    expect(JOURNAL_PAGE_FRAMES).toEqual([
      'art/dungeon/item_journal_page_near.png',
      'art/dungeon/item_journal_page_mid.png',
      'art/dungeon/item_journal_page_far.png'
    ]);
  });
});

describe('note open sound', () => {
  it('plays the sfx.scroll registry key, not a fail or picker clip', () => {
    expect(audio.sfx.scroll).toBe('sfx_scroll');
    expect(NOTE_SCROLL_SFX).toBe('scroll');
    expect(audioStemKeys('sfx_scroll')).toContain('scroll');
    expect(NOTE_SCROLL_SFX).not.toBe('item_use_fail');
    expect(NOTE_SCROLL_SFX).not.toBe('ui_button');
    expect(beforePlayRelPaths()).toContain('audio/sfx_scroll.mp3');
  });
});
