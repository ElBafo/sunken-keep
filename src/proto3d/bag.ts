import type { HeroId, HandSlot } from '../core/types';
import { BAG_SLOTS, STACK_MAX, isStackable, normalizeItemId } from './items';

export interface BagEntry {
  item: string;
  count: number;
  from?: { hero: HeroId; hand: HandSlot };
}

export interface PartySaveState {
  bag: BagEntry[];
  equipment: Record<HeroId, { main: string; off: string; armour?: string }>;
  oil: number;
}

export class PartyBag {
  slots: BagEntry[] = [];

  serialize(): BagEntry[] {
    return this.slots.map((s) => ({ ...s, from: s.from ? { ...s.from } : undefined }));
  }

  load(entries: BagEntry[]) {
    this.slots = entries.map((s) => ({ ...s, from: s.from ? { ...s.from } : undefined }));
  }

  clear() {
    this.slots = [];
  }

  countOf(id: string): number {
    const item = normalizeItemId(id);
    return this.slots.filter((s) => s.item === item).reduce((n, s) => n + s.count, 0);
  }

  has(id: string): boolean {
    return this.countOf(id) > 0;
  }

  /** Add items. Returns how many were stored. */
  add(id: string, count = 1, from?: BagEntry['from']): number {
    const item = normalizeItemId(id);
    let left = count;
    if (isStackable(item)) {
      for (const slot of this.slots) {
        if (left <= 0) break;
        if (slot.item !== item || slot.count >= STACK_MAX) continue;
        const room = STACK_MAX - slot.count;
        const take = Math.min(room, left);
        slot.count += take;
        left -= take;
      }
    }
    while (left > 0 && this.slots.length < BAG_SLOTS) {
      const take = isStackable(item) ? Math.min(STACK_MAX, left) : 1;
      this.slots.push({ item, count: take, from });
      left -= take;
    }
    return count - left;
  }

  remove(id: string, count = 1): boolean {
    const item = normalizeItemId(id);
    if (this.countOf(item) < count) return false;
    let left = count;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const slot = this.slots[i];
      if (slot.item !== item) continue;
      const take = Math.min(slot.count, left);
      slot.count -= take;
      left -= take;
      if (slot.count <= 0) this.slots.splice(i, 1);
    }
    return true;
  }

  takeAt(index: number, count = 1): BagEntry | null {
    const slot = this.slots[index];
    if (!slot) return null;
    const take = Math.min(count, slot.count);
    slot.count -= take;
    const out: BagEntry = { item: slot.item, count: take, from: slot.from };
    if (slot.count <= 0) this.slots.splice(index, 1);
    return out;
  }

  takeFrom(hero: HeroId, hand: HandSlot): string | null {
    const i = this.slots.findIndex((s) => s.from?.hero === hero && s.from?.hand === hand);
    if (i < 0) return null;
    const [slot] = this.slots.splice(i, 1);
    return slot.item;
  }
}
