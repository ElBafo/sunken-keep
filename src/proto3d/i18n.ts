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
  private barks = new Map<string, string>();
  private names: Json = {};
  private ui: Json = {};
  private title: Json = {};
  private note: Json = {};

  async load(locale: Locale = 'en') {
    this.locale = locale;
    const base = import.meta.env.BASE_URL;
    const [log, names, ui, title, note, barks] = await Promise.all([
      this.fetchJson<LogEntry[]>(this.url(base, 'log.json', locale)),
      this.fetchJson<Json>(this.url(base, 'names.json', locale)),
      this.fetchJson<Json>(this.url(base, 'ui_text.json', locale)),
      this.fetchJson<Json>(this.url(base, 'title_text.json', locale)),
      this.fetchJson<Json>(this.url(base, 'note_lampkeeper.json', locale)),
      this.fetchJson<Array<{ trigger?: string; text?: string }>>(this.url(base, 'barks.json', locale))
    ]);
    this.logs.clear();
    for (const entry of log ?? []) {
      if (!entry?.key) continue;
      if (typeof entry.text === 'string') {
        this.logs.set(entry.key, entry.text);
      } else if (Array.isArray(entry.lines) && entry.lines.length) {
        this.logs.set(entry.key, entry.lines.join('\n'));
      }
    }
    this.barks.clear();
    for (const entry of barks ?? []) {
      if (entry?.trigger && typeof entry.text === 'string') this.barks.set(entry.trigger, entry.text);
    }
    this.names = names ?? {};
    this.ui = ui ?? {};
    this.title = title ?? {};
    this.note = note ?? {};
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
      const res = await fetch(url);
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  log(key: string, vars?: Record<string, string | number>): string {
    const raw = this.logs.get(key);
    if (!raw) return '';
    return capitalizeLog(fill(raw, vars));
  }

  bark(trigger: string): string {
    return this.barks.get(trigger) ?? '';
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

  titleText(path: string, vars?: Record<string, string | number>): string {
    const raw = getPath(this.title, path);
    if (typeof raw !== 'string') return '';
    return fill(raw, vars);
  }

  heroName(id: string): string {
    const heroes = this.names.heroes;
    if (heroes && typeof heroes === 'object') {
      const name = (heroes as Json)[id];
      if (typeof name === 'string') return name;
    }
    return id;
  }

  monsterName(id: string): string {
    const monsters = this.names.monsters;
    if (monsters && typeof monsters === 'object') {
      const name = (monsters as Json)[id];
      if (typeof name === 'string') return name;
    }
    return id.replace(/_/g, ' ');
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
