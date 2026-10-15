import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { refreshLampNoteAfterLocaleChange } from '../src/proto3d/i18n';

describe('lamp note follows locale', () => {
  it('English and Greek lamp notes have different title and body', () => {
    const en = JSON.parse(
      readFileSync(resolve(__dirname, '../public/story/note_lampkeeper.json'), 'utf8')
    ) as { title: string; text: string };
    const el = JSON.parse(
      readFileSync(resolve(__dirname, '../public/story/el/note_lampkeeper.el.json'), 'utf8')
    ) as { title: string; text: string };
    expect(en.title.length).toBeGreaterThan(0);
    expect(en.text.length).toBeGreaterThan(0);
    expect(el.title.length).toBeGreaterThan(0);
    expect(el.text.length).toBeGreaterThan(0);
    expect(el.title).not.toBe(en.title);
    expect(el.text).not.toBe(en.text);
  });

  it('redraws the open reader after a locale change', () => {
    const calls: string[] = [];
    refreshLampNoteAfterLocaleChange({
      noteOpen: true,
      loadLampNote: () => calls.push('load'),
      showNote: () => calls.push('show')
    });
    expect(calls).toEqual(['load', 'show']);
  });

  it('reloads copy without showing when the reader is closed', () => {
    const calls: string[] = [];
    refreshLampNoteAfterLocaleChange({
      noteOpen: false,
      loadLampNote: () => calls.push('load'),
      showNote: () => calls.push('show')
    });
    expect(calls).toEqual(['load']);
  });

  it('setLocale refreshes an open note after loading the new locale', () => {
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    const fn = main.slice(main.indexOf('private async setLocale'), main.indexOf('private showTitleToast'));
    expect(fn).toContain('await this.story.load(locale)');
    expect(fn).toContain('refreshLampNoteAfterLocaleChange');
    expect(fn).toContain('noteOpen: this.noteOpen');
    expect(fn).toContain('loadLampNote: () => this.loadLampNote()');
    expect(fn).toContain('showNote: () => this.showNote()');
  });
});
