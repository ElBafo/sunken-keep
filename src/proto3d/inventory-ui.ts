import type { HeroId } from '../core/types';
import { StoryText } from './i18n';
import { drawFont5x7, type FontGlyphs } from './font5x7';
import {
  canEquip,
  compareEquip,
  equippable,
  preferredHand,
  sameEquipJob,
  STACK_MAX,
  usable
} from './items';
import type { PartyBag } from './bag';
import { panelArtPath, type InventoryScreenLayout, type LayoutRect } from './layout585';

type Rect = LayoutRect;
type DollSlot = 'main' | 'off' | 'armour' | 'trinket';

const HEROES: HeroId[] = ['brannoc', 'wren', 'ilsevar', 'mags'];
const CANVAS_W = 270;
const CANVAS_H = 585;
const NAME_COLOUR = '#ffbe5a';
const BODY_COLOUR = '#d8ccb0';
const COMPARE_COLOUR = { better: '#8fc46a', worse: '#d8664e', same: '#918d7d' } as const;
const SHADOW = { colour: '#1a1210', dx: 1, dy: 1 };
const PORTRAIT_SIZE = 32;
const PORTRAIT_Y = 44;
const ICON = 24;

function aabbToRect(raw: LayoutRect): Rect {
  const [a, b, c, d] = raw;
  if (c > a && d > b && c - a <= 48 && d - b <= 48) return [a, b, c - a, d - b];
  return raw;
}

function wrapText(text: string, maxChars: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= maxChars) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    if (word.length > maxChars) {
      for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
      cur = '';
    } else {
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export class InventoryUi {
  open = false;
  selected = -1;
  pickHero: 'potion_red' | 'potion_blue' | 'potion_green' | null = null;
  lastCompare: string | null = null;
  lastCompareKind: 'better' | 'worse' | 'same' | null = null;
  private host: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private story: StoryText;
  private bag: PartyBag;
  private layout: InventoryScreenLayout;
  private images = new Map<string, HTMLImageElement>();
  private itemIcons = new Map<string, string>();
  private handIcons = new Map<string, string>();
  private fontImg: HTMLImageElement | null = null;
  private fontCellW = 6;
  private fontGlyphs: FontGlyphs = {};
  private closePressed = false;
  private equipment: () => Record<HeroId, { main: string; off: string; armour?: string }>;
  private onUse: (index: number) => void;
  private onEquip: (index: number, hero: HeroId, slot?: DollSlot) => void;
  private onDrink: (index: number, hero: HeroId) => void;
  private onClose: () => void;
  private playUi: (name: string) => void;

  constructor(
    story: StoryText,
    bag: PartyBag,
    layout: InventoryScreenLayout,
    hooks: {
      equipment: () => Record<HeroId, { main: string; off: string; armour?: string }>;
      onUse: (index: number) => void;
      onEquip: (index: number, hero: HeroId, slot?: DollSlot) => void;
      onDrink: (index: number, hero: HeroId) => void;
      onClose: () => void;
      playUi: (name: string) => void;
    }
  ) {
    this.story = story;
    this.bag = bag;
    this.layout = layout;
    this.equipment = hooks.equipment;
    this.onUse = hooks.onUse;
    this.onEquip = hooks.onEquip;
    this.onDrink = hooks.onDrink;
    this.onClose = hooks.onClose;
    this.playUi = hooks.playUi;
    this.host = document.getElementById('inventory-screen')!;
    this.canvas = document.getElementById('inventory-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
  }

  get equipPick(): boolean {
    const slot = this.bag.slots[this.selected];
    return !!slot && equippable(slot.item);
  }

  async load() {
    const base = import.meta.env.BASE_URL;
    const loadImg = (rel: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load ${rel}`));
        img.src = `${base}${rel}`;
      });
    const cache = async (key: string, rel: string) => {
      try {
        this.images.set(key, await loadImg(rel));
      } catch {
        /* optional plate / icon */
      }
    };
    const items = (await fetch(`${base}art/ui/items/items.json`).then((r) => r.json())) as {
      icons?: Record<string, string>;
    };
    const hands = (await fetch(`${base}art/ui/hands/hands.json`).then((r) => r.json())) as {
      icons?: Record<string, string>;
    };
    for (const [id, file] of Object.entries(items.icons ?? {})) this.itemIcons.set(id, file);
    for (const [id, file] of Object.entries(hands.icons ?? {})) this.handIcons.set(id, file);

    const jobs: Array<Promise<void>> = [
      cache('font', 'art/font/font_5x7.png'),
      fetch(`${base}art/font/font_5x7.json`)
        .then((r) => r.json())
        .then((meta: { cellWidth?: number; glyphs?: FontGlyphs }) => {
          if (Number.isFinite(meta.cellWidth)) this.fontCellW = meta.cellWidth!;
          if (meta.glyphs) this.fontGlyphs = meta.glyphs;
        })
        .then(() => undefined)
        .catch(() => undefined),
      cache('stone', 'art/ui/layout585/stone_strip_tile.png'),
      cache('slot', panelArtPath(this.layout.slotImages.normal)),
      cache('slotSel', panelArtPath(this.layout.slotImages.selected)),
      cache('close', panelArtPath(this.layout.closeIcon.icon)),
      cache('pressed28', 'art/ui/panel/well_pressed_28.png'),
      cache('brannoc', 'art/portraits/brannoc_healthy.png'),
      cache('wren', 'art/portraits/wren_lantern_bright.png'),
      cache('ilsevar', 'art/portraits/ilsevar_healthy.png'),
      cache('mags', 'art/portraits/mags_healthy.png')
    ];
    for (const file of new Set([...this.itemIcons.values(), ...[...this.handIcons.values()].map((f) => `art/ui/hands/${f}`)])) {
      jobs.push(cache(file, file.startsWith('art/') ? file : `art/ui/hands/${file}`));
    }
    await Promise.all(jobs);
    this.fontImg = this.images.get('font') ?? null;
    this.mount();
    this.draw();
  }

  private mount() {
    this.host.querySelectorAll('.inv-slot, .inv-action, .inv-close, .inv-doll, .inv-hero').forEach((el) => el.remove());
    const close = this.placeBtn(this.host, this.layout.close, 'inv-close', 'close');
    close.setAttribute('aria-label', this.story.uiText('bag.close'));
    close.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) return;
      this.closePressed = true;
      this.draw();
    });
    const clearClose = () => {
      if (!this.closePressed) return;
      this.closePressed = false;
      this.draw();
    };
    close.addEventListener('pointerup', (e) => {
      if (!e.isPrimary) return;
      e.preventDefault();
      e.stopPropagation();
      clearClose();
      this.onClose();
    });
    close.addEventListener('pointercancel', clearClose);
    close.addEventListener('pointerleave', clearClose);

    this.layout.slots.forEach((raw, i) => {
      const btn = this.placeBtn(this.host, aabbToRect(raw), 'inv-slot', `slot-${i}`);
      btn.dataset.index = String(i);
      btn.addEventListener('pointerup', (e) => {
        if (!e.isPrimary) return;
        e.preventDefault();
        e.stopPropagation();
        this.select(i === this.selected ? -1 : i);
      });
    });

    for (const hero of HEROES) {
      const portrait = this.portraitRect(hero);
      if (portrait) {
        const face = this.placeBtn(this.host, portrait, 'inv-hero', `hero-${hero}`);
        face.dataset.hero = hero;
        face.setAttribute('aria-label', this.story.heroName(hero));
        face.addEventListener('pointerup', (e) => {
          if (!e.isPrimary) return;
          e.preventDefault();
          e.stopPropagation();
          this.applyToHero(hero);
        });
      }
      for (const entry of this.layout.paperdoll[hero] ?? []) {
        const slot = Object.keys(entry)[0] as DollSlot;
        const rect = entry[slot];
        if (!rect) continue;
        const btn = this.placeBtn(this.host, aabbToRect(rect), 'inv-doll', `${hero}-${slot}`);
        btn.dataset.hero = hero;
        btn.dataset.slot = slot;
        btn.addEventListener('pointerup', (e) => {
          if (!e.isPrimary) return;
          e.preventDefault();
          e.stopPropagation();
          this.applyToHero(hero, slot);
        });
      }
    }

    this.host.addEventListener('pointerup', (e) => {
      if (!e.isPrimary) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('.inv-slot, .inv-close, .inv-doll, .inv-hero')) return;
      this.useOnView();
    });
  }

  private placeBtn(host: HTMLElement, rect: Rect, cls: string, name: string) {
    const [x, y, w, h] = rect;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    btn.dataset.name = name;
    btn.style.left = `${(x / CANVAS_W) * 100}%`;
    btn.style.top = `${(y / CANVAS_H) * 100}%`;
    btn.style.width = `${(w / CANVAS_W) * 100}%`;
    btn.style.height = `${(h / CANVAS_H) * 100}%`;
    host.appendChild(btn);
    return btn;
  }

  private portraitRect(hero: HeroId): Rect | null {
    const boxes = (this.layout.paperdoll[hero] ?? [])
      .map((entry) => {
        const rect = entry[Object.keys(entry)[0] as DollSlot];
        return rect ? aabbToRect(rect) : null;
      })
      .filter((r): r is Rect => !!r);
    if (!boxes.length) return null;
    const x0 = Math.min(...boxes.map((r) => r[0]));
    const x1 = Math.max(...boxes.map((r) => r[0] + r[2]));
    const x = Math.round((x0 + x1) / 2 - PORTRAIT_SIZE / 2);
    return [x, PORTRAIT_Y, PORTRAIT_SIZE, PORTRAIT_SIZE];
  }

  private applyToHero(hero: HeroId, slot?: DollSlot) {
    if (this.selected < 0) return;
    const entry = this.bag.slots[this.selected];
    if (!entry) return;
    if (entry.item === 'potion_red' || entry.item === 'potion_blue' || entry.item === 'potion_green') {
      this.onDrink(this.selected, hero);
      return;
    }
    if (equippable(entry.item)) {
      this.onEquip(this.selected, hero, slot);
      return;
    }
    this.playUi('item_use_fail');
  }

  private useOnView() {
    if (this.selected < 0) return;
    const entry = this.bag.slots[this.selected];
    if (!entry || !usable(entry.item) || entry.item.startsWith('potion_')) return;
    this.onUse(this.selected);
  }

  select(index: number) {
    this.selected = index;
    this.pickHero = null;
    this.lastCompare = null;
    this.lastCompareKind = null;
    const slot = this.bag.slots[index];
    if (slot && equippable(slot.item)) {
      const hero = HEROES.find((h) => canEquip(slot.item, h));
      if (hero) {
        const eq = this.equipment()[hero];
        const hand = slot.item === 'chain_mail' ? undefined : preferredHand(slot.item);
        const held = slot.item === 'chain_mail' ? eq?.armour : hand ? eq?.[hand] : undefined;
        if (sameEquipJob(slot.item, held)) {
          const cmp = compareEquip(slot.item, held);
          this.lastCompareKind = cmp;
          this.lastCompare = this.story.uiText(`bag.compare_${cmp}`);
        }
      }
    }
    this.draw();
  }

  show() {
    this.open = true;
    this.host.hidden = false;
    this.host.classList.add('show');
    document.body.classList.add('bag-open');
    document.getElementById('message-toast')?.classList.remove('show');
    this.select(-1);
    this.playUi('inventory_open');
  }

  hide() {
    this.open = false;
    this.pickHero = null;
    this.selected = -1;
    this.lastCompare = null;
    this.lastCompareKind = null;
    this.closePressed = false;
    this.host.classList.remove('show');
    this.host.hidden = true;
    document.body.classList.remove('bag-open');
    this.playUi('inventory_close');
  }

  redraw() {
    this.draw();
  }

  private draw() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const stone = this.images.get('stone');
    if (stone) {
      for (let y = 0; y < CANVAS_H; y += stone.height || 32) {
        ctx.drawImage(stone, 0, y);
      }
    } else {
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    this.drawClose();
    this.drawPaperdoll();
    this.drawSlots();
    this.drawDesc();
  }

  private drawClose() {
    const [x, y, w, h] = this.layout.close;
    const icon = this.images.get('close');
    const [ix, iy] = this.layout.closeIcon.pos;
    if (this.closePressed) {
      const plate = this.images.get('pressed28');
      if (plate) this.ctx.drawImage(plate, x - 1, y - 1);
      else {
        this.ctx.fillStyle = '#1a1210';
        this.ctx.fillRect(x, y, w, h);
      }
      if (icon) this.ctx.drawImage(icon, ix, iy + 1);
      return;
    }
    if (icon) this.ctx.drawImage(icon, ix, iy);
  }

  private drawSlots() {
    const ctx = this.ctx;
    this.layout.slots.forEach((raw, i) => {
      const [x, y, w, h] = aabbToRect(raw);
      const frame = this.images.get(i === this.selected ? 'slotSel' : 'slot');
      if (frame) ctx.drawImage(frame, x, y);
      else {
        ctx.fillStyle = '#0c0a08';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = i === this.selected ? '#e08a3c' : '#8a7348';
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
      const slot = this.bag.slots[i];
      if (!slot) return;
      const img = this.itemImage(slot.item);
      if (img) ctx.drawImage(img, x + 8, y + 8, ICON, ICON);
      const shown = Math.min(STACK_MAX, slot.count);
      if (shown >= 2) {
        const pos = this.layout.stackCount[i];
        const digits = String(shown);
        const textX = (pos?.rightX ?? x + 36) - (digits.length * this.fontCellW - 1);
        const textY = pos?.glyphTop ?? y + 29;
        this.drawFont(digits, textX, textY, BODY_COLOUR);
      }
    });
  }

  private drawPaperdoll() {
    const ctx = this.ctx;
    const eq = this.equipment();
    for (const hero of HEROES) {
      const face = this.portraitRect(hero);
      const portrait = face ? this.images.get(hero) : null;
      if (face && portrait) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(portrait, face[0], face[1], face[2], face[3]);
      }
      for (const entry of this.layout.paperdoll[hero] ?? []) {
        const slot = Object.keys(entry)[0] as DollSlot;
        const raw = entry[slot];
        if (!raw) continue;
        const [x, y, w, h] = aabbToRect(raw);
        ctx.fillStyle = '#0c0a08';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#8a7348';
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        const item = slot === 'armour' || slot === 'trinket' ? eq[hero]?.armour : eq[hero]?.[slot];
        if (!item || item === 'empty_hand' || item === 'fist') continue;
        const img = slot === 'armour' || slot === 'trinket' ? this.itemImage(item) : this.handImage(hero, item);
        if (img) ctx.drawImage(img, x + 3, y + 3, ICON, ICON);
      }
    }
  }

  private drawDesc() {
    const [dx, dy, dw, dh] = this.layout.desc;
    const ctx = this.ctx;
    ctx.fillStyle = '#0c0a08';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeStyle = '#8a7348';
    ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);

    const lines = this.layout.descLines.length
      ? this.layout.descLines
      : [
          [dx + 4, dy + 3, dw - 8, 10],
          [dx + 4, dy + 13, dw - 8, 10],
          [dx + 4, dy + 23, dw - 8, 10],
          [dx + 4, dy + 33, dw - 8, 10]
        ];
    const slot = this.bag.slots[this.selected];
    if (this.pickHero) {
      this.drawFont(this.story.uiText('bag.who_drinks'), lines[0][0], lines[0][1], NAME_COLOUR);
    } else if (!slot) {
      if (!this.bag.slots.length) {
        this.drawFont(this.story.uiText('bag.empty_bag'), lines[0][0], lines[0][1], BODY_COLOUR);
      }
    } else {
      const [nx, ny, nw] = lines[0];
      const maxChars = Math.max(8, Math.floor(nw / this.fontCellW));
      const compare = this.lastCompare ?? '';
      const reserved = compare ? compare.length + 1 : 0;
      this.drawFont(this.story.itemName(slot.item).slice(0, Math.max(4, maxChars - reserved)), nx, ny, NAME_COLOUR);
      if (compare && this.lastCompareKind) {
        const textX = nx + nw - (compare.length * this.fontCellW - 1);
        this.drawFont(compare, textX, ny, COMPARE_COLOUR[this.lastCompareKind]);
      }
      const body = [this.story.itemDesc(slot.item), this.story.itemEffect(slot.item)].filter(Boolean).join(' ');
      const wrapped = wrapText(body, maxChars);
      wrapped.slice(0, Math.max(0, lines.length - 1)).forEach((line, i) => {
        const dest = lines[i + 1];
        if (dest) this.drawFont(line, dest[0], dest[1], BODY_COLOUR);
      });
    }
    if (slot && !this.pickHero) {
      const [hx, hy, hw] = this.layout.hintLine;
      const hint = this.story.uiText('bag.pick_hero');
      this.drawFont(hint.slice(0, Math.floor(hw / this.fontCellW)), hx, hy, NAME_COLOUR);
    }
  }

  private itemImage(id: string): HTMLImageElement | undefined {
    const file = this.itemIcons.get(id);
    return (file && this.images.get(file)) || this.images.get(id);
  }

  private handImage(hero: HeroId, item: string): HTMLImageElement | undefined {
    const key = item === 'empty_hand' || item === 'fist' ? `fist_${hero}` : item;
    const file = this.handIcons.get(key) ?? (item === 'iron_shield' ? this.handIcons.get('shield') : undefined);
    if (file) return this.images.get(`art/ui/hands/${file}`) ?? this.images.get(file);
    return this.itemImage(item);
  }

  private drawFont(text: string, x: number, y: number, colour = BODY_COLOUR) {
    drawFont5x7(this.ctx, this.fontImg, text, x, y, this.fontGlyphs, this.fontCellW, colour, SHADOW);
  }
}
