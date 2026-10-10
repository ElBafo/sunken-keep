import type { HeroId, HandSlot } from '../core/types';

export type ItemMaterial = 'metal' | 'leather' | 'wood' | 'cloth';
export type ItemSlot = 'bag' | 'hand' | 'body';

export interface ItemDef {
  id: string;
  stack: boolean;
  usable: boolean;
  slot: ItemSlot;
  material: ItemMaterial;
  equipHeroes: HeroId[] | 'any';
  score: number;
}

export const BAG_SLOTS = 12;
export const STACK_MAX = 5;

const METAL: ItemMaterial = 'metal';
const LEATHER: ItemMaterial = 'leather';
const WOOD: ItemMaterial = 'wood';
const CLOTH: ItemMaterial = 'cloth';

const DEFS: Record<string, ItemDef> = {
  key: { id: 'key', stack: true, usable: true, slot: 'bag', material: METAL, equipHeroes: [], score: 0 },
  captain_key: {
    id: 'captain_key',
    stack: true,
    usable: true,
    slot: 'bag',
    material: METAL,
    equipHeroes: [],
    score: 0
  },
  potion_red: {
    id: 'potion_red',
    stack: true,
    usable: true,
    slot: 'bag',
    material: CLOTH,
    equipHeroes: [],
    score: 0
  },
  potion_blue: {
    id: 'potion_blue',
    stack: true,
    usable: true,
    slot: 'bag',
    material: CLOTH,
    equipHeroes: [],
    score: 0
  },
  potion_green: {
    id: 'potion_green',
    stack: true,
    usable: true,
    slot: 'bag',
    material: CLOTH,
    equipHeroes: [],
    score: 0
  },
  oil_flask: {
    id: 'oil_flask',
    stack: true,
    usable: true,
    slot: 'bag',
    material: WOOD,
    equipHeroes: [],
    score: 0
  },
  journal_page: {
    id: 'journal_page',
    stack: false,
    usable: true,
    slot: 'bag',
    material: CLOTH,
    equipHeroes: [],
    score: 0
  },
  scroll: {
    id: 'scroll',
    stack: false,
    usable: false,
    slot: 'hand',
    material: CLOTH,
    equipHeroes: ['ilsevar'],
    score: 55
  },
  axe: {
    id: 'axe',
    stack: false,
    usable: false,
    slot: 'hand',
    material: METAL,
    equipHeroes: ['brannoc'],
    score: 69
  },
  shield: {
    id: 'shield',
    stack: false,
    usable: false,
    slot: 'hand',
    material: WOOD,
    equipHeroes: ['brannoc'],
    score: 40
  },
  mace: {
    id: 'mace',
    stack: false,
    usable: false,
    slot: 'hand',
    material: METAL,
    equipHeroes: ['wren'],
    score: 53
  },
  prayer_lantern: {
    id: 'prayer_lantern',
    stack: false,
    usable: false,
    slot: 'hand',
    material: CLOTH,
    equipHeroes: ['wren'],
    score: 45
  },
  wand: {
    id: 'wand',
    stack: false,
    usable: false,
    slot: 'hand',
    material: WOOD,
    equipHeroes: ['ilsevar'],
    score: 50
  },
  dagger: {
    id: 'dagger',
    stack: false,
    usable: false,
    slot: 'hand',
    material: METAL,
    equipHeroes: ['mags'],
    score: 45
  },
  tricks_pouch: {
    id: 'tricks_pouch',
    stack: false,
    usable: false,
    slot: 'hand',
    material: LEATHER,
    equipHeroes: ['mags'],
    score: 20
  },
  iron_shield: {
    id: 'iron_shield',
    stack: false,
    usable: false,
    slot: 'hand',
    material: METAL,
    equipHeroes: ['mags', 'ilsevar'],
    score: 30
  },
  chain_mail: {
    id: 'chain_mail',
    stack: false,
    usable: false,
    slot: 'body',
    material: METAL,
    equipHeroes: ['brannoc', 'wren', 'mags'],
    score: 20
  },
  ashmantle_hammer: {
    id: 'ashmantle_hammer',
    stack: false,
    usable: false,
    slot: 'hand',
    material: METAL,
    equipHeroes: ['brannoc'],
    score: 85
  },
  torch_lit: {
    id: 'torch_lit',
    stack: false,
    usable: false,
    slot: 'hand',
    material: WOOD,
    equipHeroes: 'any',
    score: 16
  },
  torch_burnt: {
    id: 'torch_burnt',
    stack: false,
    usable: false,
    slot: 'hand',
    material: WOOD,
    equipHeroes: 'any',
    score: 10
  },
  torch: {
    id: 'torch',
    stack: false,
    usable: false,
    slot: 'hand',
    material: WOOD,
    equipHeroes: 'any',
    score: 16
  },
  empty_hand: {
    id: 'empty_hand',
    stack: false,
    usable: false,
    slot: 'hand',
    material: CLOTH,
    equipHeroes: 'any',
    score: 8
  },
  fist: {
    id: 'fist',
    stack: false,
    usable: false,
    slot: 'hand',
    material: CLOTH,
    equipHeroes: 'any',
    score: 8
  }
};

export function itemDef(id: string): ItemDef {
  return (
    DEFS[id] ?? {
      id,
      stack: false,
      usable: false,
      slot: 'bag',
      material: CLOTH,
      equipHeroes: [],
      score: 0
    }
  );
}

export function itemMaterial(id: string): ItemMaterial {
  return itemDef(id).material;
}

export function equipSfx(id: string): string {
  return `equip_${itemMaterial(id)}`;
}

export function pickupSfx(id: string): string {
  if (id === 'key' || id === 'captain_key') return 'key';
  if (id === 'oil_flask' || id === 'oil') return 'oil_pickup';
  return 'pickup';
}

export function isStackable(id: string): boolean {
  return itemDef(id).stack;
}

export function canEquip(id: string, hero: HeroId): boolean {
  const who = itemDef(id).equipHeroes;
  if (who === 'any') return true;
  return who.includes(hero);
}

export function equippable(id: string): boolean {
  const def = itemDef(id);
  return def.slot === 'hand' || def.slot === 'body';
}

export function usable(id: string): boolean {
  return itemDef(id).usable;
}

export function compareEquip(nextId: string, heldId: string | undefined): 'better' | 'worse' | 'same' {
  const next = itemDef(nextId).score;
  const held = itemDef(heldId || 'empty_hand').score;
  if (next > held) return 'better';
  if (next < held) return 'worse';
  return 'same';
}

export function preferredHand(id: string): HandSlot {
  if (id === 'shield' || id === 'iron_shield' || id === 'prayer_lantern' || id === 'scroll' || id === 'tricks_pouch') {
    return 'off';
  }
  return 'main';
}

export function normalizeItemId(id: string): string {
  if (id === 'oil') return 'oil_flask';
  if (id === 'torch') return 'torch_lit';
  return id;
}
