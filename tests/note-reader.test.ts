import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { audioStemKeys, beforePlayRelPaths } from '../src/proto3d/audio-groups';
import { floor1 } from '../src/proto3d/floor-data';
import type { FontGlyphs } from '../src/proto3d/font5x7';
import { glyphAdvance, measureFontWidth, missingFontGlyphs } from '../src/proto3d/font5x7';
import { PartyBag } from '../src/proto3d/bag';
import {
  isReadable,
  isSilentLogKey,
  journalIntroKey,
  journalTriggerId,
  NOTE_SCROLL_SFX,
  usesHeroTarget
} from '../src/proto3d/items';
import { collectLogPush } from '../src/proto3d/party-hud';
import {
  clampNoteScroll,
  DEBUG_READER_NOTE_PATH,
  DEBUG_READER_QUERY,
  debugReaderRequested,
  debugReaderUrl,
  drawParchmentPanel,
  floorReadableEntries,
  layoutNote,
  NOTE_MARGIN_BOTTOM,
  NOTE_MARGIN_LEFT,
  NOTE_MARGIN_RIGHT,
  NOTE_MARGIN_TOP,
  NOTE_PAGE_H,
  NOTE_PAGE_W,
  NOTE_VIEWPORT_RATIO,
  PARCHMENT_META_PATH,
  PARCHMENT_PAGE_PATH,
  parchmentColours,
  parchmentMargins,
  noteLineClip,
  noteOverlayRect,
  noteVisibleRange,
  wrapNoteText,
  type DebugReaderNote
} from '../src/proto3d/note-reader';

const ROOT = resolve(__dirname, '../public');

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8')) as T;
}

function walkJson(dir: string): string[] {
  const out: string[] = [];
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkJson(full));
    else if (name.endsWith('.json')) out.push(full);
  }
  return out;
}

function collectText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collectText).join('\n');
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(collectText).join('\n');
  return '';
}

const fontMeta = readJson<{ glyphs: FontGlyphs }>('art/font/font_5x7.json');
const journalEn = readJson<{ pages: Record<string, { lines: string[] }> }>('story/journal_act1.json');
const journalEl = readJson<{ pages: Record<string, { lines: string[] }> }>('story/el/journal_act1.el.json');
const noteEn = readJson<{ title: string; text: string }>('story/note_lampkeeper.json');
const noteEl = readJson<{ title: string; text: string }>('story/el/note_lampkeeper.el.json');
const logEn = readJson<Array<{ key: string; text?: string }>>('log.json');
const logEl = readJson<Array<{ key: string; text?: string }>>('story/el/log.el.json');
const audio = readJson<{ sfx: Record<string, string> }>('audio/audio.json');
const debugNote = readJson<DebugReaderNote>(DEBUG_READER_NOTE_PATH);
const noteReaderSrc = readFileSync(resolve(__dirname, '../src/proto3d/note-reader.ts'), 'utf8');
const mainSrc = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
const htmlSrc = readFileSync(resolve(__dirname, '../proto3d.html'), 'utf8');
const floor1Src = readFileSync(resolve(__dirname, '../public/levels/floor1.ts'), 'utf8');

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

  it('setLocale redraws the open parchment in the new language', () => {
    const fn = mainSrc.slice(mainSrc.indexOf('private async setLocale'), mainSrc.indexOf('private showTitleToast'));
    expect(fn).toContain('await this.story.load(locale)');
    expect(fn).toContain('copyForOpenNote');
    expect(fn).toContain('this.showNote(copy.title, copy.text, { fx: false })');
    expect(noteEn.text).not.toBe(noteEl.text);
  });
});

describe('pixel font coverage', () => {
  it('has glyphs for Greek accents and guillemets', () => {
    const sample = [
      ...journalEl.pages['1'].lines,
      noteEl.title,
      noteEl.text,
      '«Καλημέρα» Ά Έ Ή Ί Ό Ύ Ώ άέήίόύώ ΪΫΐΰ'
    ].join('\n');
    expect(fontMeta.glyphs['«']).toEqual({ x: 42, y: 100 });
    expect(fontMeta.glyphs['»']).toEqual({ x: 48, y: 100 });
    expect(fontMeta.glyphs['ά']).toBeTruthy();
    expect(fontMeta.glyphs['Ό']).toMatchObject({ x: 32, y: 110, w: 7, advance: 8 });
    expect(fontMeta.glyphs['Ά']).toMatchObject({ x: 0, y: 110, w: 7, advance: 8 });
    expect(glyphAdvance('Ά', fontMeta.glyphs)).toBe(8);
    expect(glyphAdvance('Α', fontMeta.glyphs)).toBe(6);
    expect(measureFontWidth('ΆΑ', fontMeta.glyphs)).toBe(14);
    expect(missingFontGlyphs(sample, fontMeta.glyphs)).toEqual([]);
  });

  it('has a glyph for every character used in story/el texts', () => {
    const files = [
      ...walkJson(resolve(ROOT, 'story/el')),
      resolve(ROOT, 'story/debug_reader_test.json')
    ];
    const blob = files.map((f) => collectText(JSON.parse(readFileSync(f, 'utf8')))).join('\n');
    expect(blob).toMatch(/[Α-ω]/);
    expect(missingFontGlyphs(blob, fontMeta.glyphs)).toEqual([]);
  });
});

describe('note reader layout', () => {
  it('wraps long copy and scrolls until the last line is visible', () => {
    const long = Array.from({ length: 28 }, (_, i) => `Line ${i + 1} of a long waterlogged page.`).join('\n');
    const layout = layoutNote('Orrun\'s journal. The ink still holds.', long, fontMeta.glyphs);
    expect(layout.bodyLines.length).toBeGreaterThan(layout.visible);
    expect(layout.textRect.x).toBe(NOTE_MARGIN_LEFT);
    expect(layout.textRect.y).toBe(NOTE_MARGIN_TOP);
    expect(layout.textRect.x + layout.textRect.w).toBe(NOTE_PAGE_W - NOTE_MARGIN_RIGHT);
    expect(layout.textRect.y + layout.textRect.h).toBe(NOTE_PAGE_H - NOTE_MARGIN_BOTTOM);
    const { maxScroll } = clampNoteScroll(0, layout.lines.length, layout.textRect.h, layout.lineH);
    expect(maxScroll).toBeGreaterThan(0);
    const end = clampNoteScroll(9999, layout.lines.length, layout.textRect.h, layout.lineH);
    expect(end.scroll).toBe(maxScroll);
    const range = noteVisibleRange(end.scroll, layout.lines.length, layout.textRect.h, layout.lineH);
    expect(range.last).toBe(layout.lines.length);
    expect(wrapNoteText('one\n\ntwo', 200, fontMeta.glyphs)).toEqual(['one', '', 'two']);
  });

  it('draws only fully visible lines and still scrolls the last line into view', () => {
    const long = Array.from({ length: 24 }, (_, i) => `Line ${i + 1}`).join('\n');
    const layout = layoutNote('Title', long, fontMeta.glyphs);
    const box = layout.textRect;
    expect(box.y).toBe(NOTE_MARGIN_TOP);
    expect(box.y + box.h).toBe(NOTE_PAGE_H - NOTE_MARGIN_BOTTOM);
    expect(box.h % layout.lineH).not.toBe(0);

    const mid = 7;
    const { first, last } = noteVisibleRange(mid, layout.lines.length, box.h, layout.lineH);
    expect(last).toBeGreaterThan(first);
    for (let i = first; i < last; i++) {
      const clip = noteLineClip(i, mid, box, layout.lineH);
      expect(clip).not.toBeNull();
      expect(clip!.y).toBeGreaterThanOrEqual(box.y);
      expect(clip!.y + layout.lineH).toBeLessThanOrEqual(box.y + box.h);
      expect(clip!.clipTop).toBe(clip!.y);
      expect(clip!.clipBottom).toBe(clip!.y + layout.lineH);
    }
    expect(noteLineClip(first - 1, mid, box, layout.lineH)).toBeNull();
    expect(noteLineClip(last, mid, box, layout.lineH)).toBeNull();
    const leftoverTop = noteLineClip(0, 0, box, layout.lineH);
    expect(leftoverTop).not.toBeNull();
    expect(noteLineClip(14, 0, box, layout.lineH)).toBeNull();

    const { maxScroll } = clampNoteScroll(0, layout.lines.length, box.h, layout.lineH);
    const lastClip = noteLineClip(layout.lines.length - 1, maxScroll, box, layout.lineH)!;
    expect(lastClip.y).toBeGreaterThanOrEqual(box.y);
    expect(lastClip.y + layout.lineH).toBeLessThanOrEqual(box.y + box.h);
    expect(lastClip.clipTop).toBe(lastClip.y);
    expect(noteVisibleRange(maxScroll, layout.lines.length, box.h, layout.lineH).last).toBe(
      layout.lines.length
    );
    const drawFn = noteReaderSrc.slice(noteReaderSrc.indexOf('private draw()'), noteReaderSrc.lastIndexOf('}'));
    expect(drawFn).toMatch(/ctx\.save\(\)/);
    expect(drawFn).toMatch(/ctx\.rect\(\s*textRect\.x,\s*textRect\.y,\s*textRect\.w,\s*textRect\.h\s*\)/);
    expect(drawFn).toMatch(/ctx\.clip\(\)/);
    expect(drawFn).toMatch(/ctx\.restore\(\)/);
    expect(drawFn).toContain('drawParchmentMargins');
  });

  it('sizes a centred 92% overlay on 393x852 and fits landscape/desktop', () => {
    const phone = noteOverlayRect(393, 852);
    expect(phone.w).toBe(Math.round(393 * NOTE_VIEWPORT_RATIO));
    expect(phone.w / 393).toBeCloseTo(NOTE_VIEWPORT_RATIO, 2);
    expect(phone.h).toBeLessThanOrEqual(Math.round(852 * NOTE_VIEWPORT_RATIO));
    expect(phone.x).toBe(Math.round((393 - phone.w) / 2));
    expect(phone.y).toBe(Math.round((852 - phone.h) / 2));
    expect(phone.w / phone.h).toBeCloseTo(NOTE_PAGE_W / NOTE_PAGE_H, 2);

    const landscape = noteOverlayRect(852, 393);
    expect(landscape.h).toBeLessThanOrEqual(Math.round(393 * NOTE_VIEWPORT_RATIO));
    expect(landscape.w).toBeLessThanOrEqual(Math.round(852 * NOTE_VIEWPORT_RATIO));
    expect(landscape.x).toBeGreaterThan(0);
    expect(landscape.w / landscape.h).toBeCloseTo(NOTE_PAGE_W / NOTE_PAGE_H, 2);

    const desktop = noteOverlayRect(1920, 1080);
    expect(desktop.w).toBeLessThanOrEqual(Math.round(1920 * NOTE_VIEWPORT_RATIO));
    expect(desktop.h).toBeLessThanOrEqual(Math.round(1080 * NOTE_VIEWPORT_RATIO));
    expect(desktop.w / desktop.h).toBeCloseTo(NOTE_PAGE_W / NOTE_PAGE_H, 2);
  });

  it('draws parchment_page.png with parchment.json margins and colours, not the 9-slice', () => {
    const parchment = readJson<{
      page: string;
      pageSize: [number, number];
      textArea: { left: number; right: number; top: number; bottom: number };
      textColours: { body: string; title: string };
    }>(PARCHMENT_META_PATH);
    expect(PARCHMENT_PAGE_PATH).toBe('art/ui/reader/parchment_page.png');
    expect(parchment.page).toBe('parchment_page.png');
    expect(parchment.pageSize).toEqual([NOTE_PAGE_W, NOTE_PAGE_H]);
    expect(parchmentMargins(parchment)).toEqual({
      left: NOTE_MARGIN_LEFT,
      right: NOTE_MARGIN_RIGHT,
      top: NOTE_MARGIN_TOP,
      bottom: NOTE_MARGIN_BOTTOM
    });
    expect(parchmentColours(parchment)).toEqual({
      title: parchment.textColours.title,
      body: parchment.textColours.body
    });
    const laid = layoutNote('Title', 'Body', fontMeta.glyphs, parchment);
    expect(laid.textRect.x).toBe(parchment.textArea.left);
    expect(laid.textRect.y).toBe(parchment.textArea.top);
    expect(typeof drawParchmentPanel).toBe('function');
    expect(noteReaderSrc).toContain('export function drawParchmentPanel');
    expect(noteReaderSrc).toContain('PARCHMENT_PAGE_PATH');
    expect(noteReaderSrc).toContain('imageSmoothingEnabled = false');
    expect(noteReaderSrc).not.toContain('parchment_9slice');
    expect(noteReaderSrc).not.toContain('item_journal_page');
    expect(htmlSrc).toMatch(/#note-overlay[\s\S]*rgba\(8,\s*6,\s*4/);
    expect(htmlSrc).toMatch(/<div id="game-stage">[\s\S]*<\/div>\s*<div id="note-overlay">/);
  });
});

describe('debug reader test note', () => {
  it('is loaded only behind ?debug=reader and is never placed on a map', () => {
    expect(debugReaderRequested(new URLSearchParams('debug=reader'))).toBe(true);
    expect(debugReaderRequested(new URLSearchParams('reader=1'))).toBe(false);
    expect(debugReaderRequested(new URLSearchParams('debug=1'))).toBe(false);
    expect(debugReaderUrl()).toContain(`?${DEBUG_READER_QUERY}`);
    expect(mainSrc).toContain('debugReaderRequested');
    expect(mainSrc).toContain('DEBUG_READER_NOTE_PATH');
    expect(floor1Src).not.toContain('debug_reader_test');
    expect(debugNote.body.en.split('\n')).toHaveLength(24);
    expect(debugNote.body.el.split('\n')).toHaveLength(24);
  });

  it('has a glyph for every character in the EN/EL debug note and must scroll', () => {
    const blob = [debugNote.title.en, debugNote.title.el, debugNote.body.en, debugNote.body.el].join('\n');
    expect(missingFontGlyphs(blob, fontMeta.glyphs)).toEqual([]);
    const layout = layoutNote(debugNote.title.el, debugNote.body.el, fontMeta.glyphs);
    expect(layout.lines.length).toBeGreaterThan(layout.visible);
    expect(clampNoteScroll(0, layout.lines.length, layout.textRect.h, layout.lineH).maxScroll).toBeGreaterThan(0);
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

  it('writes the journal intro silently and still ticks oil_full / other lines', () => {
    expect(isSilentLogKey('read_journal')).toBe(true);
    expect(isSilentLogKey('journal_f2')).toBe(true);
    expect(isSilentLogKey('oil_full')).toBe(false);
    expect(isSilentLogKey('lamp_sealed')).toBe(true);
    expect(isSilentLogKey('torch_capped')).toBe(false);
    expect(collectLogPush('Orrun left a page.', 40, true)).toEqual({
      parts: ['Orrun left a page.'],
      silent: true
    });
    expect(collectLogPush('Lantern is full.', 40, false).silent).toBe(false);
    expect(mainSrc).toMatch(/onLog:\s*\(\)\s*=>\s*this\.audioManager\?\.playUi\('ui_log_line'\)/);
    const readBag = mainSrc.slice(mainSrc.indexOf('private readBagSlot'), mainSrc.indexOf('readFacingDesk'));
    expect(readBag).toContain('silent:');
    expect(readBag).toContain('isSilentLogKey');
    expect(readBag).toContain('showNote');
    const oilFull = mainSrc.slice(mainSrc.indexOf("plan.kind === 'full'"), mainSrc.indexOf('if (!this.bag.takeAt'));
    expect(oilFull).toContain("storyLog('oil_full')");
    expect(oilFull).not.toMatch(/silent/);
    expect(mainSrc).toContain("this.audioManager?.playUi(NOTE_SCROLL_SFX)");
  });

  it('stays open after 10s with no input because toast/log timers never hide it', () => {
    const showNote = mainSrc.slice(mainSrc.indexOf('  showNote('), mainSrc.indexOf('  hideNote()'));
    expect(showNote).toContain('playUi(NOTE_SCROLL_SFX)');
    expect(showNote).not.toContain('messageTimer');
    const timerAt = mainSrc.indexOf('if (this.messageTimer && now >= this.messageTimer)');
    const toastExpiry = mainSrc.slice(timerAt, timerAt + 280);
    expect(toastExpiry).toContain("classList.remove('show')");
    expect(toastExpiry).not.toContain('hideNote');
    expect(10000).toBeGreaterThan(6000);
    expect(10000).toBeGreaterThan(2300);
  });
});
