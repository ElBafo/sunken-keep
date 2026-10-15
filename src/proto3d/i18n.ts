import { fetchJsonCached } from './asset-cache';
import type { BarkLine, BarkTier } from './bark-picker';
import { isReadable, journalIntroKey, type ReadableDoc } from './items';

/** Locale-aware story / UI text. English default; Greek via `?lang=el` or a saved setting. */

export type Locale = 'en' | 'el';

const LANG_STORAGE = 'proto3d.lang';

export function resolveLocale(params: URLSearchParams, persist = true): Locale {
  const q = params.get('lang');
  if (q === 'el' || q === 'en') {
    if (persist) saveLocale(q);
    return q;
  }
  if (persist) {
    const saved = loadSavedLocale();
    if (saved) return saved;
  }
  return 'en';
}

export function saveLocale(locale: Locale) {
  try {
    localStorage.setItem(LANG_STORAGE, locale);
  } catch {
    // quota / private mode
  }
}

/** Which document the parchment reader is showing, so a locale switch can reload it. */
export type OpenNoteRef =
  | { kind: 'lampkeeper' }
  | { kind: 'journal'; page: number }
  | { kind: 'debug'; title: { en: string; el: string }; body: { en: string; el: string } };

export function copyForOpenNote(
  locale: Locale,
  ref: OpenNoteRef | null,
  story: {
    lampkeeperNote(): { title: string; text: string };
    readableItem(item: string, page?: number): { title: string; text: string } | null;
  }
): { title: string; text: string } | null {
  if (!ref) return null;
  if (ref.kind === 'debug') {
    const loc = locale === 'el' ? 'el' : 'en';
    return { title: ref.title[loc] || ref.title.en, text: ref.body[loc] || ref.body.en };
  }
  if (ref.kind === 'journal') {
    const doc = story.readableItem('journal_page', ref.page);
    return doc ? { title: doc.title, text: doc.text } : null;
  }
  const doc = story.lampkeeperNote();
  return { title: doc.title, text: doc.text };
}

export function loadSavedLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LANG_STORAGE);
    if (raw === 'el' || raw === 'en') return raw;
  } catch {
    // ignore
  }
  return null;
}

export interface LogEntry {
  key: string;
  text: string;
  when?: string;
  lines?: string[];
  /** Skip ui_log_line for this entry only. */
  silent?: boolean;
}

type Json = Record<string, unknown>;

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Json)[part];
  }
  return cur;
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return out;
}

function capitalizeLine(text: string): string {
  return text.replace(/^(\s*)(\S)/, (_m, ws: string, ch: string) => ws + ch.toUpperCase());
}

function capitalizeLog(text: string): string {
  return text.split('\n').map(capitalizeLine).join('\n');
}

export class StoryText {
  locale: Locale = 'en';
  private logs = new Map<string, string>();
  private logSilent = new Set<string>();
  private barks = new Map<string, BarkLine[]>();
  private names: Json = {};
  private ui: Json = {};
  private title: Json = {};
  private note: Json = {};
  private journal: Json = {};

  async load(locale: Locale = 'en') {
    this.locale = locale;
    const base = import.meta.env.BASE_URL;
    const [log, names, ui, title, note, journal, barks] = await Promise.all([
      this.fetchJson<LogEntry[]>(this.url(base, 'log.json', locale)),
      this.fetchJson<Json>(this.url(base, 'names.json', locale)),
      this.fetchJson<Json>(this.url(base, 'ui_text.json', locale)),
      this.fetchJson<Json>(this.url(base, 'title_text.json', locale)),
      this.fetchJson<Json>(this.url(base, 'note_lampkeeper.json', locale)),
      this.fetchJson<Json>(this.url(base, 'journal_act1.json', locale)),
      this.fetchJson<Array<Record<string, unknown>>>(this.url(base, 'barks.json', locale))
    ]);
    this.logs.clear();
    this.logSilent.clear();
    for (const entry of log ?? []) {
      if (!entry?.key) continue;
      if (typeof entry.text === 'string') {
        this.logs.set(entry.key, entry.text);
      } else if (Array.isArray(entry.lines) && entry.lines.length) {
        this.logs.set(entry.key, entry.lines.join('\n'));
      }
      if (entry.silent) this.logSilent.add(entry.key);
    }
    this.barks.clear();
    for (const entry of barks ?? []) {
      const trigger = typeof entry.trigger === 'string' ? entry.trigger : '';
      const text = typeof entry.text === 'string' ? entry.text : '';
      const speaker = typeof entry.speaker === 'string' ? entry.speaker : '';
      if (!trigger || !text || !speaker) continue;
      const line: BarkLine = { trigger, speaker, text };
      if (typeof entry.face === 'string') line.face = entry.face;
      if (typeof entry.listener === 'string') line.listener = entry.listener;
      if (typeof entry.listenerFace === 'string') line.listenerFace = entry.listenerFace;
      if (entry.tier === 'tutorial' || entry.tier === 'story' || entry.tier === 'flavour') {
        line.tier = entry.tier as BarkTier;
      }
      if (entry.condition && typeof entry.condition === 'object') {
        line.condition = entry.condition as Record<string, boolean>;
      }
      if (typeof entry.act === 'number') line.act = entry.act;
      const list = this.barks.get(trigger) ?? [];
      list.push(line);
      this.barks.set(trigger, list);
    }
    this.names = names ?? {};
    this.ui = ui ?? {};
    this.title = title ?? {};
    this.note = note ?? {};
    this.journal = journal ?? {};
  }

  /**
   * EN: `log.json` / `barks.json` at the site root, other files in `story/`.
   * Greek: `story/el/<file>.el.json` with the same keys.
   */
  private url(base: string, file: string, locale: Locale): string {
    if (locale === 'en') {
      if (file === 'log.json' || file === 'barks.json') return `${base}${file}`;
      return `${base}story/${file}`;
    }
    const stem = file.replace(/\.json$/, '');
    return `${base}story/el/${stem}.el.json`;
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    try {
      return await fetchJsonCached<T>(url);
    } catch {
      return null;
    }
  }

  log(key: string, vars?: Record<string, string | number>): string {
    const raw = this.logs.get(key);
    if (!raw) return '';
    return capitalizeLog(fill(raw, vars));
  }

  logIsSilent(key: string): boolean {
    return this.logSilent.has(key);
  }

  bark(trigger: string): string {
    return this.barks.get(trigger)?.[0]?.text ?? '';
  }

  barkEntry(trigger: string): BarkLine | null {
    return this.barks.get(trigger)?.[0] ?? null;
  }

  barksFor(trigger: string): BarkLine[] {
    return this.barks.get(trigger)?.slice() ?? [];
  }

  uiText(path: string, vars?: Record<string, string | number>): string {
    const prefixes = ['', 'step1_party_panel.', 'step2_combat.', 'step3_inventory.', 'step4_title_saves.'];
    for (const prefix of prefixes) {
      const raw = getPath(this.ui, `${prefix}${path}`);
      if (typeof raw === 'string') return fill(raw, vars);
    }
    return '';
  }

  noteTitle(): string {
    return typeof this.note.title === 'string' ? this.note.title : '';
  }

  noteText(): string {
    return typeof this.note.text === 'string' ? this.note.text : '';
  }

  journalLines(page: number): string[] {
    const pages = this.journal.pages;
    if (!pages || typeof pages !== 'object') return [];
    const entry = (pages as Json)[String(page)];
    if (!entry || typeof entry !== 'object') return [];
    const lines = (entry as Json).lines;
    if (!Array.isArray(lines)) return [];
    return lines.filter((l): l is string => typeof l === 'string');
  }

  lampkeeperNote(): ReadableDoc {
    return {
      kind: 'note',
      id: 'note_lampkeeper',
      title: this.noteTitle(),
      text: this.noteText()
    };
  }

  readableItem(item: string, journalPage?: number): ReadableDoc | null {
    if (!isReadable(item)) return null;
    const page = journalPage && journalPage > 0 ? journalPage : 1;
    const intro = this.log(journalIntroKey(page));
    return {
      kind: 'journal',
      id: `journal_page_${page}`,
      title: intro || this.itemName(item),
      text: this.journalLines(page).join('\n')
    };
  }

  titleText(path: string, vars?: Record<string, string | number>): string {
    const raw = getPath(this.title, path);
    if (typeof raw !== 'string') return '';
    return fill(raw, vars);
  }

  titleLines(path: string): string[] {
    const raw = getPath(this.title, path);
    if (Array.isArray(raw)) return raw.filter((l): l is string => typeof l === 'string');
    if (raw && typeof raw === 'object') {
      const lines = (raw as Json).lines;
      if (Array.isArray(lines)) return lines.filter((l): l is string => typeof l === 'string');
    }
    if (typeof raw === 'string' && raw) return [raw];
    return [];
  }

  private nameIn(group: string, id: string): string {
    const bag = this.names[group];
    if (bag && typeof bag === 'object') {
      const name = (bag as Json)[id];
      if (typeof name === 'string') return name;
    }
    return '';
  }

  heroName(id: string): string {
    return this.nameIn('heroes', id) || id;
  }

  speakerName(id: string): string {
    return this.nameIn('heroes', id) || this.nameIn('npcs', id) || id;
  }

  monsterName(id: string): string {
    return this.nameIn('monsters', id);
  }

  itemName(id: string): string {
    const raw = getPath(this.ui, `step3_inventory.items.${id}.name`);
    return typeof raw === 'string' ? raw : id;
  }

  itemDesc(id: string): string {
    const desc = getPath(this.ui, `step3_inventory.items.${id}.desc`);
    if (typeof desc === 'string') return desc;
    const logKey = getPath(this.ui, `step3_inventory.items.${id}.desc_log`);
    if (typeof logKey === 'string') return this.log(logKey);
    return '';
  }

  itemEffect(id: string): string {
    const raw = getPath(this.ui, `step3_inventory.items.${id}.effect`);
    return typeof raw === 'string' ? raw : '';
  }

  handLabel(gearId: string): string {
    const key = gearId === 'empty_hand' ? 'fist' : gearId;
    return this.uiText(`step1_party_panel.hands.${key}`);
  }
}
