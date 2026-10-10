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

export interface StackCountPos {
  rightX: number;
  glyphTop: number;
}

export interface CloseIconSpec {
  icon: string;
  size: [number, number];
  pos: [number, number];
}

export interface InventoryScreenLayout {
  slots: LayoutRect[];
  paperdoll: Record<HeroId, Array<Partial<InventoryPaperdoll> & Record<string, LayoutRect>>>;
  close: LayoutRect;
  closeIcon: CloseIconSpec;
  desc: LayoutRect;
  descLines: LayoutRect[];
  hintLine: LayoutRect;
  stackCount: StackCountPos[];
  slotImages: { normal: string; selected: string };
}

export interface PanelIconCount {
  colour: string;
  colourEmpty: string;
  shadow: string;
  rightEdgeOffset: number;
  glyphTopOffset: number;
}

export interface PanelIconSpec {
  rect: LayoutRect;
  icon?: string;
  iconEmpty?: string;
  iconPos?: [number, number];
  pressed?: string;
  normal?: string;
  count?: PanelIconCount;
}

export const PAD_KEYS = ['turn_left', 'forward', 'turn_right', 'strafe_left', 'back', 'strafe_right'] as const;
export type PadKey = (typeof PAD_KEYS)[number];
export type PadLayout = Record<PadKey, LayoutRect>;

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
  menu: LayoutRect | null;
  save: LayoutRect | null;
  compass: LayoutRect | null;
  pad: PadLayout | null;
  panelIcons: Record<string, PanelIconSpec>;
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
  const padRaw = raw.pad as Record<string, unknown> | undefined;
  let pad: PadLayout | null = null;
  if (padRaw && typeof padRaw === 'object') {
    const next = {} as PadLayout;
    for (const key of PAD_KEYS) {
      if (!isRect(padRaw[key])) {
        pad = null;
        break;
      }
      next[key] = padRaw[key] as LayoutRect;
      pad = next;
    }
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
    menu: isRect(raw.menu) ? raw.menu : null,
    save: isRect(raw.save) ? raw.save : null,
    compass: isRect(raw.compass) ? raw.compass : null,
    pad,
    panelIcons: parsePanelIcons(raw.panelIcons),
    inventoryScreen: parseInventoryScreen(screenRaw, slots, paperdoll)
  };
}

function asXywh(raw: LayoutRect): LayoutRect {
  const [a, b, c, d] = raw;
  if (c > a && d > b && c - a <= 48 && d - b <= 48) return [a, b, c - a, d - b];
  return raw;
}

function parseRectList(raw: unknown, key: string): LayoutRect[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s, i) => requireRect(s, `${key}[${i}]`));
}

function parseStackCount(raw: unknown, slots: LayoutRect[]): StackCountPos[] {
  if (Array.isArray(raw)) {
    return raw.map((entry, i) => {
      const rec = (entry ?? {}) as Record<string, unknown>;
      return {
        rightX: Number.isFinite(rec.rightX) ? Number(rec.rightX) : slots[i]?.[0] + 36,
        glyphTop: Number.isFinite(rec.glyphTop) ? Number(rec.glyphTop) : slots[i]?.[1] + 29
      };
    });
  }
  return slots.map(([x, y]) => ({ rightX: x + 36, glyphTop: y + 29 }));
}

function parseInventoryScreen(
  screenRaw: Record<string, unknown>,
  slotsAabb: LayoutRect[],
  paperdoll: InventoryScreenLayout['paperdoll']
): InventoryScreenLayout {
  const slotRects = parseRectList(screenRaw.slotRects, 'inventory_screen.slotRects').map(asXywh);
  const slots = (slotRects.length ? slotRects : slotsAabb.map(asXywh)).slice(0, 12);
  const descLines = parseRectList(screenRaw.descLines, 'inventory_screen.descLines');
  const images = (screenRaw.slotImages ?? {}) as Record<string, unknown>;
  const closeIconRaw = (screenRaw.closeIcon ?? {}) as Record<string, unknown>;
  const iconPos = Array.isArray(closeIconRaw.pos) ? closeIconRaw.pos : [243, 15];
  const iconSize = Array.isArray(closeIconRaw.size) ? closeIconRaw.size : [12, 12];
  return {
    slots,
    paperdoll,
    close: requireRect(screenRaw.close, 'inventory_screen.close'),
    closeIcon: {
      icon: typeof closeIconRaw.icon === 'string' ? closeIconRaw.icon : 'ui/panel/icon_close.png',
      size: [Number(iconSize[0]) || 12, Number(iconSize[1]) || 12],
      pos: [Number(iconPos[0]) || 243, Number(iconPos[1]) || 15]
    },
    desc: requireRect(screenRaw.desc, 'inventory_screen.desc'),
    descLines,
    hintLine: isRect(screenRaw.hintLine) ? screenRaw.hintLine : [11, 390, 248, 10],
    stackCount: parseStackCount(screenRaw.stackCount, slots),
    slotImages: {
      normal: typeof images.normal === 'string' ? images.normal : 'ui/items/slot_40.png',
      selected: typeof images.selected === 'string' ? images.selected : 'ui/items/slot_40_selected.png'
    }
  };
}

function parsePanelIcons(raw: unknown): Record<string, PanelIconSpec> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, PanelIconSpec> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const rec = value as Record<string, unknown>;
    if (!isRect(rec.rect)) continue;
    const countRaw = rec.count;
    let count: PanelIconCount | undefined;
    if (countRaw && typeof countRaw === 'object') {
      const c = countRaw as Record<string, unknown>;
      count = {
        colour: typeof c.colour === 'string' ? c.colour : '#d8ccb0',
        colourEmpty: typeof c.colourEmpty === 'string' ? c.colourEmpty : '#918d7d',
        shadow: typeof c.shadow === 'string' ? c.shadow : '#1a1210 at +1,+1',
        rightEdgeOffset: Number.isFinite(c.rightEdgeOffset) ? Number(c.rightEdgeOffset) : 25,
        glyphTopOffset: Number.isFinite(c.glyphTopOffset) ? Number(c.glyphTopOffset) : 18
      };
    }
    const iconPos = Array.isArray(rec.iconPos) && rec.iconPos.length >= 2
      ? ([Number(rec.iconPos[0]), Number(rec.iconPos[1])] as [number, number])
      : undefined;
    out[key] = {
      rect: rec.rect,
      icon: typeof rec.icon === 'string' ? rec.icon : undefined,
      iconEmpty: typeof rec.iconEmpty === 'string' ? rec.iconEmpty : undefined,
      iconPos,
      pressed: typeof rec.pressed === 'string' ? rec.pressed : undefined,
      normal: typeof rec.normal === 'string' ? rec.normal : undefined,
      count
    };
  }
  return out;
}

/** Resolve a panelIcons path (`ui/panel/foo.png`) to the public art URL. */
export function panelArtPath(rel: string): string {
  if (rel.startsWith('art/')) return rel;
  if (rel.startsWith('ui/') || rel.startsWith('font/')) return `art/${rel}`;
  return rel;
}

export function toPanelLocal(rect: LayoutRect, panelTop: number): LayoutRect {
  return [rect[0], rect[1] - panelTop, rect[2], rect[3]];
}

/** Height of the proto3d HUD strip: full 270×585 panel below `panelTop`, including wells. */
export function panelContentHeight(layout: Layout585): number {
  return Math.max(1, layout.canvas[1] - layout.panelTop);
}
