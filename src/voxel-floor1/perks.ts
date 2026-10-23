import { fetchJsonCached } from '../proto3d/asset-cache';
import type { HeroId } from '../core';
import { FLOOR1_PERK_CHOICES } from './combat';
import { HERO_DISPLAY, type HudHeroId } from './portrait-layout';

export type PerkCopy = {
  title: string;
  sub: (hero: string) => string;
  confirm: string;
  back: string;
  name: (id: string) => string;
  desc: (id: string) => string;
};

type PerkJson = {
  screen?: { title?: string; sub?: string; confirm?: string; back?: string };
  perks?: Record<string, { name?: string; desc?: string }>;
};

function fill(text: string, vars?: Record<string, string>): string {
  if (!vars) return text;
  let out = text;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
  return out;
}

/** Word-wrap only. Never shortens or ellipsizes game text. */
export function wrapPerkText(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= maxChars || !cur) {
      cur = next;
      continue;
    }
    lines.push(cur);
    cur = word;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

export function perkChoices(hero: HudHeroId, level: number): [string, string] | undefined {
  const key = level >= 5 ? 5 : 3;
  return FLOOR1_PERK_CHOICES[hero as HeroId]?.[key];
}

export function heroDisplayName(id: HudHeroId): string {
  return HERO_DISPLAY[id];
}

export async function loadPerkCopy(locale = 'en'): Promise<PerkCopy> {
  const base = import.meta.env.BASE_URL;
  const path = locale === 'el' ? 'story/el/perks.el.json' : 'story/perks.json';
  const json = (await fetchJsonCached(`${base}${path}`)) as PerkJson;
  const screen = json.screen ?? {};
  const perks = json.perks ?? {};
  return {
    title: screen.title ?? 'Choose a gift',
    sub: (hero) => fill(screen.sub ?? '{hero} has grown. Pick one. It\'s for keeps.', { hero }),
    confirm: screen.confirm ?? 'Take it',
    back: screen.back ?? 'Back',
    name: (id) => perks[id]?.name ?? id,
    desc: (id) => perks[id]?.desc ?? ''
  };
}
