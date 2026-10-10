import type { HeroId, HandSlot } from '../core/types';
import type { HeroState, MonsterState } from '../core/types';

export const SAVE_VERSION = 1;
const PREFIX = 'proto3d.save.v1.';
export const SLOT_COUNT = 3;
const AUTOSAVE_KEEP = 2;

export type SaveKind = 'slot' | 'autosave' | 'floor';

export interface SavedHero {
  id: HeroId;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  ac: number;
  level: number;
  xp: number;
  formation: 'front' | 'back';
  equipment: { main: string; off: string };
  armour?: string;
  pendingPerk: number | null;
  downed: boolean;
}

export interface SavedMonster {
  id: string;
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}

export interface SavedSconce {
  x: number;
  y: number;
  face: string;
  lit: boolean;
  empty: boolean;
  capped: boolean;
}

export interface SavedTile {
  x: number;
  y: number;
  doorOpen?: boolean;
  doorLocked?: boolean;
  secretOpen?: boolean;
  chestOpen?: boolean;
  chestItems?: string[];
  item?: string | null;
}

export interface SavedBagEntry {
  item: string;
  count: number;
  from?: { hero: HeroId; hand: HandSlot };
}

export interface SavePayload {
  version: number;
  kind: SaveKind;
  slot?: number;
  timestamp: number;
  playTimeMs: number;
  locale: 'en' | 'el';
  floor: number;
  position: { x: number; y: number; dir: number };
  oil: number;
  hasKey: boolean;
  party: SavedHero[];
  bag: SavedBagEntry[];
  monsters: SavedMonster[];
  tiles: SavedTile[];
  sconces: SavedSconce[];
  flags: string[];
  firedOnce: string[];
  goals: Record<string, 'hidden' | 'active' | 'done' | 'failed'>;
  escapeRunActive: boolean;
  leader: HeroId;
}

export type SlotSummary = {
  slot: number;
  payload: SavePayload;
} | null;

export function persistStorage(): void {
  try {
    const storage = navigator.storage;
    if (storage && typeof storage.persist === 'function') {
      (globalThis as { __proto3dPersistCalled?: boolean }).__proto3dPersistCalled = true;
      void storage.persist();
    }
  } catch {
    // private mode / unsupported
  }
}

function slotKey(slot: number): string {
  return `${PREFIX}slot.${slot}`;
}

function autosaveKey(): string {
  return `${PREFIX}autosaves`;
}

function floorKey(floor: number): string {
  return `${PREFIX}floor.${floor}`;
}

function readRaw(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    persistStorage();
    return true;
  } catch {
    return false;
  }
}

export function parseSave(raw: unknown): SavePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  if (rec.version !== SAVE_VERSION) return null;
  if (!Array.isArray(rec.party) || !Array.isArray(rec.monsters)) return null;
  if (!rec.position || typeof rec.position !== 'object') return null;
  const payload = rec as unknown as SavePayload;
  if (!Array.isArray(payload.firedOnce)) payload.firedOnce = [];
  if (!payload.goals || typeof payload.goals !== 'object') payload.goals = {};
  return payload;
}

export function slotOccupied(slot: number): boolean {
  return readRaw(slotKey(slot)) != null;
}

export function loadSlot(slot: number): SavePayload | 'corrupt' | null {
  const raw = readRaw(slotKey(slot));
  if (raw == null) return null;
  return parseSave(raw) ?? 'corrupt';
}

export function writeSlot(slot: number, payload: SavePayload): boolean {
  return writeRaw(slotKey(slot), { ...payload, kind: 'slot', slot });
}

export function listSlots(): SlotSummary[] {
  return [1, 2, 3].map((slot) => {
    const data = loadSlot(slot);
    if (!data || data === 'corrupt') return null;
    return { slot, payload: data };
  });
}

export function newestSlot(): { slot: number; payload: SavePayload } | null {
  let best: { slot: number; payload: SavePayload } | null = null;
  for (const entry of listSlots()) {
    if (!entry) continue;
    if (!best || entry.payload.timestamp > best.payload.timestamp) best = entry;
  }
  const autos = listAutosaves();
  for (const a of autos) {
    if (!best || a.timestamp > best.payload.timestamp) {
      best = { slot: 0, payload: a };
    }
  }
  return best;
}

export function hasAnySave(): boolean {
  return newestSlot() != null || listAutosaves().length > 0;
}

export function listAutosaves(): SavePayload[] {
  const raw = readRaw(autosaveKey());
  if (!Array.isArray(raw)) return [];
  return raw.map(parseSave).filter((s): s is SavePayload => !!s);
}

export function writeAutosave(payload: SavePayload): boolean {
  const next = [{ ...payload, kind: 'autosave' as const }, ...listAutosaves()].slice(0, AUTOSAVE_KEEP);
  return writeRaw(autosaveKey(), next);
}

export function newestAutosave(): SavePayload | null {
  return listAutosaves()[0] ?? null;
}

export function writeFloorSnapshot(payload: SavePayload): boolean {
  return writeRaw(floorKey(payload.floor), { ...payload, kind: 'floor' });
}

export function loadFloorSnapshot(floor: number): SavePayload | null {
  return parseSave(readRaw(floorKey(floor)));
}

export function formatPlayTime(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function snapshotHero(h: HeroState, armour?: string): SavedHero {
  return {
    id: h.id,
    hp: h.hp,
    maxHp: h.maxHp,
    mana: h.mana,
    maxMana: h.maxMana,
    ac: h.ac,
    level: h.level,
    xp: h.xp,
    formation: h.formation,
    equipment: { ...h.equipment },
    armour,
    pendingPerk: h.pendingPerk,
    downed: h.downed
  };
}

export function snapshotMonster(m: MonsterState): SavedMonster {
  return {
    id: m.id,
    kind: m.kind,
    x: m.x,
    y: m.y,
    hp: m.hp,
    maxHp: m.maxHp,
    alive: m.alive
  };
}
