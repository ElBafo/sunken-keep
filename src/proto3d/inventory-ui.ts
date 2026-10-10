import type { HeroId } from '../core/types';
import { StoryText } from './i18n';
import { drawFont5x7, type FontGlyphs } from './font5x7';
import { canEquip, compareEquip, equippable, usable } from './items';
import type { PartyBag } from './bag';
import type { InventoryScreenLayout, LayoutRect } from './layout585';

type Rect = LayoutRect;

function aabbToRect(raw: LayoutRect): Rect {
  const [a, b, c, d] = raw;
  if (c > a && d > b && c - a <= 48 && d - b <= 48) return [a, b, c - a, d - b];
  return raw;
}

export class InventoryUi {
  open = false;
  selected = -1;
  pickHero: 'potion_red' | 'potion_blue' | 'potion_green' | null = null;
  lastCompare: string | null = null;
  private host: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private story: StoryText;
  private bag: PartyBag;
  private layout: InventoryScreenLayout;
  private images = new Map<string, HTMLImageElement>();
  private icons = new Map<string, string>();
  private fontImg: HTMLImageElement | null = null;
  private fontCellW = 6;
  private fontGlyphs: FontGlyphs = {};
  private equipment: () => Record<HeroId, { main: string; off: string; armour?: string }>;
  private onUse: (index: number) => void;
  private onEquip: (index: number, hero: HeroId) => void;
  private onClose: () => void;
  private playUi: (name: string) => void;

  constructor(
    story: StoryText,
    bag: PartyBag,
    layout: InventoryScreenLayout,
    hooks: {
      equipment: () => Record<HeroId, { main: string; off: string; armour?: string }>;
      onUse: (index: number) => void;
      onEquip: (index: number, hero: HeroId) => void;
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
    this.onClose = hooks.onClose;
    this.playUi = hooks.playUi;
    this.host = document.getElementById('inventory-screen')!;
    this.canvas = document.getElementById('inventory-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.width = 270;
    this.canvas.height = 380;
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
    const items = (await fetch(`${base}art/ui/items/items.json`).then((r) => r.json())) as {
      icons?: Record<string, string>;
    };
    for (const [id, file] of Object.entries(items.icons ?? {})) this.icons.set(id, file);
    const jobs: Array<Promise<void>> = [
      loadImg('art/font/font_5x7.png').then((img) => {
        this.fontImg = img;
      }),
      fetch(`${base}art/font/font_5x7.json`)
        .then((r) => r.json())
        .then((meta: { cellWidth?: number; glyphs?: FontGlyphs }) => {
          if (Number.isFinite(meta.cellWidth)) this.fontCellW = meta.cellWidth!;
          if (meta.glyphs) this.fontGlyphs = meta.glyphs;
        })
        .catch(() => undefined)
    ];
    for (const [id, file] of this.icons) {
      jobs.push(
        loadImg(file)
          .then((img) => {
            this.images.set(id, img);
          })
          .catch(() => undefined)
      );
    }
    await Promise.all(jobs);
    this.mount();
    this.draw();
  }

  private mount() {
    this.host.querySelectorAll('.inv-slot, .inv-action, .inv-close').forEach((el) => el.remove());
    const close = this.placeBtn(this.host, this.layout.close, 'inv-close', 'close');
    close.textContent = this.story.uiText('bag.close');
    close.addEventListener('pointerup', (e) => {
      if (!e.isPrimary) return;
      e.preventDefault();
      e.stopPropagation();
      this.onClose();
    });
    this.layout.slots.forEach((raw, i) => {
      const rect = aabbToRect(raw);
      const btn = this.placeBtn(this.host, rect, 'inv-slot', `slot-${i}`);
      btn.dataset.index = String(i);
      btn.addEventListener('pointerup', (e) => {
        if (!e.isPrimary) return;
        e.preventDefault();
        e.stopPropagation();
        this.select(i);
      });
    });
    this.drawActions();
  }

  private placeBtn(host: HTMLElement, rect: Rect, cls: string, name: string) {
    const [x, y, w, h] = rect;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    btn.dataset.name = name;
    btn.style.left = `${(x / 270) * 100}%`;
    btn.style.top = `${(y / 380) * 100}%`;
    btn.style.width = `${(w / 270) * 100}%`;
    btn.style.height = `${(h / 380) * 100}%`;
    host.appendChild(btn);
    return btn;
  }

  private drawActions() {
    this.host.querySelectorAll('.inv-action').forEach((el) => el.remove());
    const slot = this.bag.slots[this.selected];
    if (!slot || this.pickHero) return;
    const buttons: Array<{ label: string; kind: string; hero?: HeroId }> = [];
    if (usable(slot.item)) {
      buttons.push({ label: this.story.uiText('bag.use'), kind: 'use' });
    }
    if (equippable(slot.item)) {
      const heroes: HeroId[] = ['brannoc', 'wren', 'ilsevar', 'mags'];
      for (const hero of heroes) {
        if (!canEquip(slot.item, hero)) continue;
        const label = `${this.story.uiText('bag.equip')} ${this.story.heroName(hero)}`.trim();
        buttons.push({ label, kind: 'equip', hero });
      }
    }
    buttons.push({
      label: this.story.uiText('bag.close'),
      kind: 'back'
    });
    const y0 = 308;
    const gap = 2;
    const h = 34;
    const w = Math.max(60, Math.floor((256 - gap * (buttons.length - 1)) / Math.max(1, buttons.length)));
    buttons.forEach((b, i) => {
      const btn = this.placeBtn(this.host, [7 + i * (w + gap), y0, w, h], 'inv-action', b.kind);
      btn.textContent = b.label;
      if (b.hero) btn.dataset.hero = b.hero;
      btn.addEventListener('pointerup', (e) => {
        if (!e.isPrimary) return;
        e.preventDefault();
        e.stopPropagation();
        if (b.kind === 'use') this.onUse(this.selected);
        else if (b.kind === 'equip' && b.hero) this.onEquip(this.selected, b.hero);
        else if (b.kind === 'back') this.select(-1);
      });
    });
  }

  select(index: number) {
    this.selected = index;
    this.pickHero = null;
    const slot = this.bag.slots[index];
    this.lastCompare = null;
    if (slot && equippable(slot.item)) {
      const heroes: HeroId[] = ['brannoc', 'wren', 'ilsevar', 'mags'];
      const hero = heroes.find((h) => canEquip(slot.item, h));
      if (hero) {
        const eq = this.equipment()[hero];
        const held = slot.item === 'chain_mail' ? eq?.armour : eq?.[slot.item === 'shield' || slot.item === 'iron_shield' ? 'off' : 'main'];
        const cmp = compareEquip(slot.item, held);
        const key = cmp === 'better' ? 'compare_better' : cmp === 'worse' ? 'compare_worse' : 'compare_same';
        this.lastCompare = this.story.uiText(`bag.${key}`);
      }
    }
    this.drawActions();
    this.draw();
  }

  show() {
    this.open = true;
    this.host.hidden = false;
    this.host.classList.add('show');
    document.getElementById('message-toast')?.classList.remove('show');
    this.select(-1);
    this.playUi('inventory_open');
  }

  hide() {
    this.open = false;
    this.pickHero = null;
    this.selected = -1;
    this.host.classList.remove('show');
    this.host.hidden = true;
    this.host.querySelectorAll('.inv-action').forEach((el) => el.remove());
    this.playUi('inventory_close');
  }

  redraw() {
    this.drawActions();
    this.draw();
  }

  private draw() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 270, 380);
    ctx.fillStyle = 'rgba(10, 8, 6, 0.92)';
    ctx.fillRect(0, 0, 270, 380);
    ctx.strokeStyle = '#8a7348';
    ctx.strokeRect(1, 1, 268, 378);
    this.drawFont(this.story.uiText('bag.title'), 8, 10);
    this.drawPaperdoll();
    this.layout.slots.forEach((raw, i) => {
      const [x, y, w, h] = aabbToRect(raw);
      ctx.fillStyle = i === this.selected ? '#3a3220' : '#1c1812';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = i === this.selected ? '#f0d060' : '#5a4a30';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      const slot = this.bag.slots[i];
      if (!slot) return;
      const img = this.images.get(slot.item);
      if (img) {
        const s = Math.min(24, w - 4, h - 4);
        ctx.drawImage(img, x + (w - s) / 2, y + (h - s) / 2, s, s);
      }
      if (slot.count > 1) {
        const label = this.story.uiText('bag.count', { n: slot.count });
        if (label) this.drawFont(label, x + 2, y + h - 9);
      }
    });
    this.drawDesc();
  }

  private drawPaperdoll() {
    const eq = this.equipment();
    const dolls = this.layout.paperdoll;
    (Object.keys(dolls) as HeroId[]).forEach((hero) => {
      for (const entry of dolls[hero]) {
        const slot = Object.keys(entry)[0] as 'main' | 'off' | 'armour' | 'trinket';
        const rect = entry[slot];
        if (!rect) continue;
        const [x, y, w, h] = aabbToRect(rect);
        ctxStrokeWell(this.ctx, x, y, w, h);
        const item = slot === 'armour' || slot === 'trinket' ? eq[hero]?.armour : eq[hero]?.[slot];
        if (!item || item === 'empty_hand') continue;
        const img = this.images.get(item);
        if (img) this.ctx.drawImage(img, x + 3, y + 3, Math.min(24, w - 6), Math.min(24, h - 6));
      }
    });
  }

  private drawDesc() {
    const [x, y, w] = this.layout.desc;
    const slot = this.bag.slots[this.selected];
    const lines: string[] = [];
    if (this.pickHero) {
      lines.push(this.story.uiText('bag.who_drinks'));
    } else if (!slot) {
      if (!this.bag.slots.length) {
        lines.push(this.story.uiText('bag.empty_bag'));
      }
    } else {
      lines.push(this.story.itemName(slot.item));
      const desc = this.story.itemDesc(slot.item);
      if (desc) lines.push(desc);
      const effect = this.story.itemEffect(slot.item);
      if (effect) lines.push(effect);
      if (this.lastCompare) lines.push(this.lastCompare);
    }
    lines.forEach((line, i) => this.drawFont(line.slice(0, Math.floor(w / 6)), x, y + i * 9));
  }

  private drawFont(text: string, x: number, y: number) {
    drawFont5x7(this.ctx, this.fontImg, text, x, y, this.fontGlyphs, this.fontCellW);
  }
}

function ctxStrokeWell(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#1c1812';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#5a4a30';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
