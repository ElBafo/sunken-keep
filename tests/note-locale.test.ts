import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { copyForOpenNote } from '../src/proto3d/i18n';

const noteEn = JSON.parse(
  readFileSync(resolve(__dirname, '../public/story/note_lampkeeper.json'), 'utf8')
) as { title: string; text: string };
const noteEl = JSON.parse(
  readFileSync(resolve(__dirname, '../public/story/el/note_lampkeeper.el.json'), 'utf8')
) as { title: string; text: string };
const journalEn = JSON.parse(
  readFileSync(resolve(__dirname, '../public/story/journal_act1.json'), 'utf8')
) as { pages: Record<string, { lines: string[] }> };
const journalEl = JSON.parse(
  readFileSync(resolve(__dirname, '../public/story/el/journal_act1.el.json'), 'utf8')
) as { pages: Record<string, { lines: string[] }> };

function stubStory(locale: 'en' | 'el') {
  const note = locale === 'el' ? noteEl : noteEn;
  const journal = locale === 'el' ? journalEl : journalEn;
  return {
    lampkeeperNote: () => ({ title: note.title, text: note.text }),
    readableItem: (_item: string, page = 1) => {
      const lines = journal.pages[String(page)]?.lines ?? [];
      return { title: locale === 'el' ? 'Ορρούν' : 'Orrun', text: lines.join('\n') };
    }
  };
}

describe('open note follows locale', () => {
  it('English and Greek lamp notes have different title and body', () => {
    expect(noteEn.title.length).toBeGreaterThan(0);
    expect(noteEl.title).not.toBe(noteEn.title);
    expect(noteEl.text).not.toBe(noteEn.text);
  });

  it('returns the lamp-keeper note in the new language', () => {
    const en = copyForOpenNote('en', { kind: 'lampkeeper' }, stubStory('en'));
    const el = copyForOpenNote('el', { kind: 'lampkeeper' }, stubStory('el'));
    expect(en?.title).toBe(noteEn.title);
    expect(en?.text).toBe(noteEn.text);
    expect(el?.title).toBe(noteEl.title);
    expect(el?.text).toBe(noteEl.text);
  });

  it('returns journal page 1 in the new language', () => {
    const en = copyForOpenNote('en', { kind: 'journal', page: 1 }, stubStory('en'));
    const el = copyForOpenNote('el', { kind: 'journal', page: 1 }, stubStory('el'));
    expect(en?.text).toContain('The Tide asks only for fire.');
    expect(el?.text).toContain('Η Παλίρροια ζητά μόνο φωτιά.');
  });

  it('returns the debug reader body for the active locale', () => {
    const debug = {
      kind: 'debug' as const,
      title: { en: 'Test', el: 'Δοκιμή' },
      body: { en: 'English body', el: 'Ελληνικό κείμενο' }
    };
    expect(copyForOpenNote('en', debug, stubStory('en'))).toEqual({ title: 'Test', text: 'English body' });
    expect(copyForOpenNote('el', debug, stubStory('el'))).toEqual({ title: 'Δοκιμή', text: 'Ελληνικό κείμενο' });
  });

  it('does not invent copy when no note is open', () => {
    expect(copyForOpenNote('el', null, stubStory('el'))).toBeNull();
  });

  it('setLocale reloads story then redraws an open note without a new scroll sfx', () => {
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    const fn = main.slice(main.indexOf('private async setLocale'), main.indexOf('private showTitleToast'));
    expect(fn).toContain('await this.story.load(locale)');
    expect(fn).toContain('this.loadLampNote()');
    expect(fn).toContain('copyForOpenNote(locale, this.openNoteRef, this.story)');
    expect(fn).toContain('this.showNote(copy.title, copy.text, { fx: false })');
  });
});
