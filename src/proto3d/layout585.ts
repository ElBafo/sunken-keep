import type { HeroId } from '../constants';

export type LayoutRect = [number, number, number, number];

export interface LayoutHero {
  name: HeroId;
  portrait_opens_sheet: LayoutRect;
  hand_main: LayoutRect;
  hand_off: LayoutRect;
  hpBar: LayoutRect;
  manaBar: LayoutRect | null;
}

export interface InventoryPaperdoll {
  main: LayoutRect;
  off: LayoutRect;
  armour: LayoutRect;
  trinket: LayoutRect;
}

export interface InventoryScreenLayout {
  slots: LayoutRect[];
  paperdoll: Record<HeroId, Array<Partial<InventoryPaperdoll> & Record<string, LayoutRect>>>;
  close: LayoutRect;
  desc: LayoutRect;
}

export interface Layout585 {
  canvas: [number, number];
  view: LayoutRect;
  panelTop: number;
  oilBar: LayoutRect;
  log: LayoutRect;
  heroes: LayoutHero[];
  inventory: LayoutRect;
  potionHealth: LayoutRect;
  potionMana: LayoutRect;
  inventoryScreen: InventoryScreenLayout;
}

function isRect(value: unknown): value is LayoutRect {
  return Array.isArray(value) && value.length === 4 && value.every((n) => Number.isFinite(n));
}

function requireRect(value: unknown, key: string): LayoutRect {
  if (!isRect(value)) throw new Error(`layout585.json is missing ${key}`);
  return value;
}

/** Load every panel/view box from art/ui/layout585/layout585.json. No coordinate fallbacks. */
export async function loadLayout585(): Promise<Layout585> {
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}art/ui/layout585/layout585.json`);
  if (!res.ok) throw new Error(`Failed to load layout585.json (${res.status})`);
  const raw = (await res.json()) as Record<string, unknown>;
  const canvas = raw.canvas;
  if (!Array.isArray(canvas) || canvas.length < 2 || !Number.isFinite(canvas[0]) || !Number.isFinite(canvas[1])) {
    throw new Error('layout585.json is missing canvas');
  }
  if (!Number.isFinite(raw.panelTop)) throw new Error('layout585.json is missing panelTop');
  const heroesRaw = raw.heroes;
  if (!Array.isArray(heroesRaw) || heroesRaw.length === 0) {
    throw new Error('layout585.json is missing heroes');
  }
  const heroes: LayoutHero[] = heroesRaw.map((hero, i) => {
    const h = hero as Record<string, unknown>;
    if (typeof h.name !== 'string') throw new Error(`layout585.json heroes[${i}] is missing name`);
    return {
      name: h.name as HeroId,
      portrait_opens_sheet: requireRect(h.portrait_opens_sheet, `heroes[${i}].portrait_opens_sheet`),
      hand_main: requireRect(h.hand_main, `heroes[${i}].hand_main`),
      hand_off: requireRect(h.hand_off, `heroes[${i}].hand_off`),
      hpBar: requireRect(h.hpBar, `heroes[${i}].hpBar`),
      manaBar: h.manaBar == null ? null : requireRect(h.manaBar, `heroes[${i}].manaBar`)
    };
  });
  const screenRaw = (raw.inventory_screen ?? {}) as Record<string, unknown>;
  const slotsRaw = screenRaw.slots;
  const slots: LayoutRect[] = Array.isArray(slotsRaw)
    ? slotsRaw.map((s, i) => requireRect(s, `inventory_screen.slots[${i}]`))
    : [];
  const dollsRaw = (screenRaw.paperdoll ?? {}) as Record<string, unknown>;
  const paperdoll: InventoryScreenLayout['paperdoll'] = {
    brannoc: [],
    wren: [],
    ilsevar: [],
    mags: []
  };
  for (const id of ['brannoc', 'wren', 'ilsevar', 'mags'] as HeroId[]) {
    const list = dollsRaw[id];
    if (!Array.isArray(list)) continue;
    paperdoll[id] = list.map((entry, i) => {
      const rec = entry as Record<string, unknown>;
      const out: Record<string, LayoutRect> = {};
      for (const [k, v] of Object.entries(rec)) out[k] = requireRect(v, `inventory_screen.paperdoll.${id}[${i}].${k}`);
      return out;
    });
  }
  return {
    canvas: [Number(canvas[0]), Number(canvas[1])],
    view: requireRect(raw.view, 'view'),
    panelTop: Number(raw.panelTop),
    oilBar: requireRect(raw.oilBar, 'oilBar'),
    log: requireRect(raw.log, 'log'),
    heroes,
    inventory: requireRect(raw.inventory, 'inventory'),
    potionHealth: requireRect(raw.potion_health, 'potion_health'),
    potionMana: requireRect(raw.potion_mana, 'potion_mana'),
    inventoryScreen: {
      slots,
      paperdoll,
      close: requireRect(screenRaw.close, 'inventory_screen.close'),
      desc: requireRect(screenRaw.desc, 'inventory_screen.desc')
    }
  };
}

export function toPanelLocal(rect: LayoutRect, panelTop: number): LayoutRect {
  return [rect[0], rect[1] - panelTop, rect[2], rect[3]];
}

/** Height of the proto3d HUD strip: portraits through the 3-line log (not the 2D D-pad). */
export function panelContentHeight(layout: Layout585): number {
  const rects: LayoutRect[] = [layout.log, layout.oilBar];
  for (const hero of layout.heroes) {
    rects.push(hero.portrait_opens_sheet, hero.hand_main, hero.hand_off, hero.hpBar);
    if (hero.manaBar) rects.push(hero.manaBar);
  }
  const maxBottom = rects.reduce((max, rect) => Math.max(max, rect[1] + rect[3]), layout.panelTop);
  return Math.max(1, maxBottom - layout.panelTop);
}
