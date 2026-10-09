import { assets } from './assets';
import type { GameState, Hero } from './types';
import type { HeroId } from './constants';
import { Renderer } from './renderer';
import { createPartyAdapter } from './render-adapter';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  VIEW_WIDTH,
  VIEW_HEIGHT,
  HORIZON_Y,
  PANEL_Y,
  HERO_LAYOUT,
  CONTROLS_LAYOUT,
} from './constants';

export class UIRenderer585 {
  private stoneStripTile: HTMLImageElement | null = null;
  private dungeonRenderer: Renderer;

  constructor() {
    // Preload stone strip tile - deferred to avoid WebKit crash
    // Will be loaded on first render if needed
    this.dungeonRenderer = new Renderer();
  }

  // Render full UI (called after dungeon view is rendered)
  render(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Render dungeon view using old renderer (270×380)
    try {
      const party = createPartyAdapter(state);
      const floor = state.floors.get(state.party.floor);
      if (floor && party) {
        // Convert floor to old format for renderer
        const oldFloor = {
          width: floor.width,
          height: floor.height,
          startX: floor.startX,
          startY: floor.startY,
          startDir: floor.startDir,
          tiles: floor.tiles,
          sconces: floor.sconces,
        };
        this.dungeonRenderer.drawViewport(ctx, party, oldFloor as any, now);
      }
    } catch (error) {
      console.error('Renderer error:', error);
      // Fallback: dark stone wall
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      
      // Draw horizon line
      ctx.strokeStyle = '#4a4440';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, HORIZON_Y);
      ctx.lineTo(VIEW_WIDTH, HORIZON_Y);
      ctx.stroke();
    }

    // Fill any extra height below panel with stone strip tile
    this.fillExtraHeight(ctx);

    // Draw panel background at y=380
    this.drawPanel(ctx);

    // Draw hero row (portraits, HP/mana bars, hand buttons)
    this.drawHeroRow(ctx, state, now);

    // Draw log (3 lines)
    this.drawLog(ctx);

    // Draw movement pad
    this.drawMovementPad(ctx);

    // Draw compass
    this.drawCompass(ctx, state.party.dir);

    // Draw potion buttons
    this.drawPotionButtons(ctx, state);

    // Draw menu and save buttons
    this.drawMenuSaveButtons(ctx);
  }

  private fillExtraHeight(ctx: CanvasRenderingContext2D): void {
    // If canvas is taller than 585, fill extra space with stone strip
    if (CANVAS_HEIGHT > 585 && this.stoneStripTile && this.stoneStripTile.complete) {
      const tileHeight = this.stoneStripTile.height;
      const startY = 585;
      let y = startY;
      
      while (y < CANVAS_HEIGHT) {
        ctx.drawImage(this.stoneStripTile, 0, y);
        y += tileHeight;
      }
    }
  }

  private drawPanel(ctx: CanvasRenderingContext2D): void {
    const baseUrl = '/sunken-keep/';
    const panelBg = assets.getImage(`${baseUrl}art/ui/layout585/panel_585.png`);
    
    if (panelBg && panelBg.complete) {
      ctx.drawImage(panelBg, 0, PANEL_Y);
    } else {
      // Fallback: dark panel
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(0, PANEL_Y, CANVAS_WIDTH, CANVAS_HEIGHT - PANEL_Y);
    }
  }

  private drawHeroRow(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
    const baseUrl = '/sunken-keep/';
    const heroIds: HeroId[] = ['brannoc', 'wren', 'ilsevar', 'mags'];

    heroIds.forEach(heroId => {
      const hero = state.heroes[heroId];
      const layout = HERO_LAYOUT[heroId];

      // Draw portrait
      this.drawPortrait(ctx, hero, layout.portrait, now);

      // Draw HP bar
      this.drawHPBar(ctx, hero, layout.hpBar);

      // Draw mana bar (if hero has mana)
      if (layout.manaBar && hero.maxMana > 0) {
        this.drawManaBar(ctx, hero, layout.manaBar);
      }

      // Draw hand buttons
      this.drawHandButton(ctx, hero, 'main', layout.handMain, now, baseUrl);
      this.drawHandButton(ctx, hero, 'off', layout.handOff, now, baseUrl);
    });
  }

  private drawPortrait(
    ctx: CanvasRenderingContext2D,
    hero: Hero,
    rect: [number, number, number, number],
    _now: number
  ): void {
    const [x, y, w, h] = rect;
    const baseUrl = '/sunken-keep/';

    // Determine health state
    const hpPercent = hero.hp / hero.maxHp;
    let state = 'healthy';
    if (hpPercent < 0.25) state = 'near_death';
    else if (hpPercent < 0.6) state = 'wounded';

    // Load portrait
    const portraitPath = `${baseUrl}art/portraits/${hero.id}_${state}.png`;
    const portrait = assets.getImage(portraitPath);

    if (portrait && portrait.complete) {
      ctx.drawImage(portrait, x, y, w, h);
    } else {
      // Fallback: solid color
      ctx.fillStyle = hero.id === 'brannoc' ? '#8a4a2a' : hero.id === 'wren' ? '#4a6a8a' : hero.id === 'ilsevar' ? '#6a4a8a' : '#4a8a4a';
      ctx.fillRect(x, y, w, h);
    }

    // Draw frame indicator for formation
    if (hero.formation === 'front') {
      // Bronze frame for front row
      ctx.strokeStyle = '#cd7f32';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    } else {
      // Iron frame for back row
      ctx.strokeStyle = '#8a8a8a';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    }
  }

  private drawHPBar(ctx: CanvasRenderingContext2D, hero: Hero, rect: [number, number, number, number]): void {
    const [x, y, w, h] = rect;
    const percent = Math.max(0, hero.hp / hero.maxHp);
    const barWidth = w * percent;

    // Background
    ctx.fillStyle = '#2a1a1a';
    ctx.fillRect(x, y, w, h);

    // HP bar
    const color = hero.hp > hero.maxHp * 0.3 ? '#4a8a3a' : '#8a3a3a';
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth, h);
  }

  private drawManaBar(ctx: CanvasRenderingContext2D, hero: Hero, rect: [number, number, number, number]): void {
    const [x, y, w, h] = rect;
    const percent = Math.max(0, hero.mana / hero.maxMana);
    const barWidth = w * percent;

    // Background
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(x, y, w, h);

    // Mana bar
    ctx.fillStyle = '#3a5a8a';
    ctx.fillRect(x, y, barWidth, h);
  }

  private drawHandButton(
    ctx: CanvasRenderingContext2D,
    hero: Hero,
    hand: 'main' | 'off',
    rect: [number, number, number, number],
    now: number,
    baseUrl: string
  ): void {
    const [x, y, w, h] = rect;
    const item = hero.equipment[hand];

    // Background
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x, y, w, h);

    // Border
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Load hand icon
    let iconName = '';
    if (item === 'empty_hand') {
      iconName = `fist_${hero.id}`;
    } else {
      iconName = item;
    }

    const iconPath = `${baseUrl}art/ui/hands/hand_${iconName}.png`;
    const icon = assets.loadImage(iconPath); // Use loadImage to ensure it starts loading

    if (assets.isImageReady(icon)) {
      // Center 24x24 icon in 31x28 button
      const iconX = x + (w - 24) / 2;
      const iconY = y + (h - 24) / 2;

      // Check if recovering
      const recoveryEnd = hero.recovery[hand];
      const recovering = recoveryEnd > now;

      // Check if back row melee (greyed out)
      const item = hero.equipment[hand];
      const meleeItems = ['axe', 'shield', 'mace', 'dagger', 'empty_hand'];
      const isBackRowMelee = meleeItems.includes(item) && hero.formation === 'back';

      if (recovering) {
        // Dim the icon
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.drawImage(icon, iconX, iconY, 24, 24);
        ctx.restore();

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x, y, w, h);
      } else if (isBackRowMelee) {
        // Grey out back row melee
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.drawImage(icon, iconX, iconY, 24, 24);
        ctx.restore();

        // Draw red X
        ctx.strokeStyle = '#8a3a3a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 4);
        ctx.lineTo(x + w - 4, y + h - 4);
        ctx.moveTo(x + w - 4, y + 4);
        ctx.lineTo(x + 4, y + h - 4);
        ctx.stroke();
      } else {
        ctx.drawImage(icon, iconX, iconY, 24, 24);
      }
    }
  }

  private drawLog(_ctx: CanvasRenderingContext2D): void {
    // TODO: Draw 3-line log from message log
    // For now, skip to keep milestone focused
  }

  private drawMovementPad(ctx: CanvasRenderingContext2D): void {
    const baseUrl = '/sunken-keep/';
    const pad = CONTROLS_LAYOUT.pad;

    // Draw each button
    Object.entries(pad).forEach(([key, rect]) => {
      const [x, y, w, h] = rect;

      // Background
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x, y, w, h);

      // Border
      ctx.strokeStyle = '#5a5a5a';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);

      // Icon (if available)
      const iconPath = `${baseUrl}art/ui/panel/icon_${key}.png`;
      const icon = assets.getImage(iconPath);
      if (icon && icon.complete) {
        const iconX = x + (w - icon.width) / 2;
        const iconY = y + (h - icon.height) / 2;
        ctx.drawImage(icon, iconX, iconY);
      }
    });
  }

  private drawCompass(ctx: CanvasRenderingContext2D, dir: number): void {
    const [x, y, w, h] = CONTROLS_LAYOUT.compass;
    const baseUrl = '/sunken-keep/';

    // Background
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x, y, w, h);

    // Border
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Compass sprite
    const directions = ['N', 'E', 'S', 'W'];
    const compassPath = `${baseUrl}art/ui/panel/compass_${directions[dir]}.png`;
    const compass = assets.getImage(compassPath);

    if (compass && compass.complete) {
      ctx.drawImage(compass, x, y);
    } else {
      // Fallback: draw letter
      ctx.fillStyle = '#8a6a4a';
      ctx.font = '24px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(directions[dir], x + w / 2, y + h / 2);
    }
  }

  private drawPotionButtons(ctx: CanvasRenderingContext2D, state: GameState): void {
    // Health potion
    const [hx, hy, hw, hh] = CONTROLS_LAYOUT.potion_health;
    ctx.fillStyle = state.inventory.potions.health > 0 ? '#8a3a3a' : '#2a2a2a';
    ctx.fillRect(hx, hy, hw, hh);
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 1;
    ctx.strokeRect(hx, hy, hw, hh);

    // Count
    if (state.inventory.potions.health > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px monospace';
      ctx.fillText(String(state.inventory.potions.health), hx + 2, hy + 10);
    }

    // Mana potion
    const [mx, my, mw, mh] = CONTROLS_LAYOUT.potion_mana;
    ctx.fillStyle = state.inventory.potions.mana > 0 ? '#3a5a8a' : '#2a2a2a';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, mw, mh);

    if (state.inventory.potions.mana > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px monospace';
      ctx.fillText(String(state.inventory.potions.mana), mx + 2, my + 10);
    }
  }

  private drawMenuSaveButtons(ctx: CanvasRenderingContext2D): void {
    const baseUrl = '/sunken-keep/';

    // Menu button
    const [mx, my, mw, mh] = CONTROLS_LAYOUT.menu;
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#5a5a5a';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, mw, mh);

    const menuIcon = assets.getImage(`${baseUrl}art/ui/panel/icon_menu.png`);
    if (menuIcon && menuIcon.complete) {
      const iconX = mx + (mw - menuIcon.width) / 2;
      const iconY = my + (mh - menuIcon.height) / 2;
      ctx.drawImage(menuIcon, iconX, iconY);
    }

    // Save button  
    const [sx, sy, sw, sh] = CONTROLS_LAYOUT.save;
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = '#5a5a5a';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, sy, sw, sh);

    // Draw "S" for save
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', sx + sw / 2, sy + sh / 2);
  }
}
