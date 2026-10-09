import { SaveSystem } from './save-system';
import { assets, sound } from './assets';

interface TitleLayout {
  canvas: [number, number];
  bg: string;
  logo: string;
  logoPos: [number, number];
  tagline: {
    y: number;
    scale: number;
    color: [number, number, number];
    centered: boolean;
  };
  buttons: {
    normal: string;
    pressed: string;
    dim: string;
    size: [number, number];
    positions: Record<string, [number, number]>;
    labelFontScale: number;
  };
  saveSlot: {
    frame: string;
    size: [number, number];
  };
}

interface TitleText {
  buttons: Record<string, string>;
  tagline: string;
  areas: Record<string, string>;
  slot: {
    line1: string;
    line2: string;
    empty: string;
    empty_sub: string;
  };
}

export class TitleScreen {
  private mode: 'title' | 'load' = 'title';
  private layout: TitleLayout | null = null;
  private titleText: TitleText | null = null;
  private glowAlpha: number = 0.4;
  private glowDirection: number = 1;

  constructor() {
    // Load assets async, will be ready before first tap
  }

  async loadAssets(): Promise<void> {
    const baseUrl = '/sunken-keep/';
    try {
      // Load layout
      const layoutResp = await fetch(`${baseUrl}art/ui/title/title.json`);
      this.layout = await layoutResp.json();

      // Load text
      const textResp = await fetch(`${baseUrl}story/title_text.json`);
      this.titleText = await textResp.json();

      // Preload images
      if (this.layout) {
        assets.loadImage(`${baseUrl}art/ui/title/${this.layout.bg}`);
        assets.loadImage(`${baseUrl}art/ui/title/${this.layout.logo}`);
        assets.loadImage(`${baseUrl}art/ui/title/title_windows_glow.png`);
        assets.loadImage(`${baseUrl}art/ui/title/${this.layout.buttons.normal}`);
        assets.loadImage(`${baseUrl}art/ui/title/${this.layout.buttons.pressed}`);
        assets.loadImage(`${baseUrl}art/ui/title/${this.layout.buttons.dim}`);
      }
    } catch (error) {
      console.error('Failed to load title assets:', error);
    }
  }

  // Render title screen
  render(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void {
    if (!this.layout || !this.titleText) {
      // Fallback
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#d8ccb0';
      ctx.font = 'bold 24px serif';
      ctx.textAlign = 'center';
      ctx.fillText('Loading...', width / 2, height / 2);
      return;
    }

    if (this.mode === 'title') {
      this.renderTitle(ctx, width, height, now);
    } else {
      this.renderLoadMenu(ctx, width, height);
    }
  }

  private renderTitle(ctx: CanvasRenderingContext2D, width: number, height: number, _now: number): void {
    if (!this.layout || !this.titleText) return;

    const baseUrl = '/sunken-keep/art/ui/title/';

    // Background
    const bg = assets.loadImage(`${baseUrl}${this.layout.bg}`);
    if (assets.isImageReady(bg)) {
      ctx.drawImage(bg, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(0, 0, width, height);
    }

    // Animated windows glow (breathing effect)
    const glow = assets.loadImage(`${baseUrl}title_windows_glow.png`);
    if (assets.isImageReady(glow)) {
      // Update glow alpha
      this.glowAlpha += this.glowDirection * 0.01;
      if (this.glowAlpha >= 1.0) {
        this.glowAlpha = 1.0;
        this.glowDirection = -1;
      } else if (this.glowAlpha <= 0.4) {
        this.glowAlpha = 0.4;
        this.glowDirection = 1;
      }

      ctx.save();
      ctx.globalAlpha = this.glowAlpha;
      ctx.drawImage(glow, 0, 0, width, height);
      ctx.restore();
    }

    // Logo
    const logo = assets.loadImage(`${baseUrl}${this.layout.logo}`);
    if (assets.isImageReady(logo)) {
      ctx.drawImage(logo, this.layout.logoPos[0], this.layout.logoPos[1]);
    }

    // Tagline
    const tagline = this.titleText.tagline;
    const tagY = this.layout.tagline.y;
    const tagColor = this.layout.tagline.color;
    ctx.fillStyle = `rgb(${tagColor[0]}, ${tagColor[1]}, ${tagColor[2]})`;
    ctx.font = `${this.layout.tagline.scale * 12}px serif`;
    ctx.textAlign = this.layout.tagline.centered ? 'center' : 'left';
    const tagX = this.layout.tagline.centered ? width / 2 : 10;
    ctx.fillText(tagline, tagX, tagY);

    // Buttons
    const hasSave = SaveSystem.getMostRecentSlot() !== null;
    const buttonNames = ['Continue', 'New Game', 'Load', 'Settings'];

    for (const btnName of buttonNames) {
      if (btnName === 'Continue' && !hasSave) {
        // Draw dimmed Continue button
        this.drawButton(ctx, btnName, 'dim');
      } else {
        this.drawButton(ctx, btnName, 'normal');
      }
    }
  }

  private drawButton(ctx: CanvasRenderingContext2D, name: string, state: 'normal' | 'pressed' | 'dim'): void {
    if (!this.layout || !this.titleText) return;

    const baseUrl = '/sunken-keep/art/ui/title/';
    const pos = this.layout.buttons.positions[name];
    if (!pos) return;

    const [x, y] = pos;
    const [w, h] = this.layout.buttons.size;

    // Button background
    const imgName = state === 'dim' ? this.layout.buttons.dim : 
                    state === 'pressed' ? this.layout.buttons.pressed : 
                    this.layout.buttons.normal;
    const btnImg = assets.loadImage(`${baseUrl}${imgName}`);
    
    if (assets.isImageReady(btnImg)) {
      ctx.drawImage(btnImg, x, y, w, h);
    } else {
      // Fallback
      ctx.fillStyle = state === 'dim' ? '#3a3a3a' : '#5a5a5a';
      ctx.fillRect(x, y, w, h);
    }

    // Button label
    const label = this.titleText.buttons[name.toLowerCase().replace(' ', '_')] || name;
    ctx.fillStyle = state === 'dim' ? '#6a6a6a' : '#d8ccb0';
    ctx.font = `${this.layout.buttons.labelFontScale * 8}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
  }

  private renderLoadMenu(ctx: CanvasRenderingContext2D, width: number, _height: number): void {
    if (!this.layout || !this.titleText) return;

    const baseUrl = '/sunken-keep/art/ui/title/';

    // Background
    const bg = assets.loadImage(`${baseUrl}${this.layout.bg}`);
    if (assets.isImageReady(bg)) {
      ctx.drawImage(bg, 0, 0, width, 585);
    } else {
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(0, 0, width, 585);
    }

    // Title
    ctx.fillStyle = '#d8ccb0';
    ctx.font = 'bold 20px serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOAD GAME', width / 2, 60);

    // Save slots
    const saves = SaveSystem.getAllSlots();
    const slotY = 100;
    const slotSpacing = 90;

    for (let i = 0; i < 3; i++) {
      const save = saves[i];
      const y = slotY + i * slotSpacing;
      this.drawSaveSlot(ctx, i + 1, save, 10, y);
    }

    // Back button
    const backY = slotY + slotSpacing * 3 + 10;
    this.drawSimpleButton(ctx, width / 2 - 70, backY, 140, 30, 'BACK', '#8a3a3a');
  }

  private drawSaveSlot(ctx: CanvasRenderingContext2D, slot: number, save: any, x: number, y: number): void {
    if (!this.layout || !this.titleText) return;

    const baseUrl = '/sunken-keep/art/ui/title/';
    const [w, h] = this.layout.saveSlot.size;

    // Frame
    const frame = assets.loadImage(`${baseUrl}${this.layout.saveSlot.frame}`);
    if (assets.isImageReady(frame)) {
      ctx.drawImage(frame, x, y, w, h);
    } else {
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#4a4a4a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    }

    // Slot label
    ctx.fillStyle = '#d8ccb0';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Slot ${slot}`, x + 8, y + 20);

    if (!save) {
      // Empty
      ctx.font = '12px monospace';
      ctx.fillStyle = '#6a6a6a';
      ctx.fillText(this.titleText.slot.empty, x + 8, y + 43);
      ctx.fillText(this.titleText.slot.empty_sub, x + 8, y + 56);
    } else {
      // Save info
      const area = this.titleText.areas[save.floor] || 'Unknown';
      const date = new Date(save.timestamp);
      const time = `${Math.floor(date.getTime() / 60000)} min`;

      ctx.font = '12px monospace';
      ctx.fillStyle = '#8a8a8a';
      const line1 = this.titleText.slot.line1.replace('{n}', save.floor).replace('{area}', area);
      const line2 = this.titleText.slot.line2.replace('{time}', time);
      ctx.fillText(line1, x + 8, y + 43);
      ctx.fillText(line2, x + 8, y + 56);
    }
  }

  private drawSimpleButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, text: string, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#d8ccb0';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
  }

  // Handle click
  handleClick(x: number, y: number): 'new_game' | 'continue' | 'load' | 'settings' | number | 'back' | null {
    if (!this.layout) return null;

    if (this.mode === 'title') {
      return this.handleTitleClick(x, y);
    } else {
      return this.handleLoadClick(x, y);
    }
  }

  private handleTitleClick(x: number, y: number): 'new_game' | 'continue' | 'load' | 'settings' | null {
    if (!this.layout) return null;

    const hasSave = SaveSystem.getMostRecentSlot() !== null;

    // Check each button
    const buttons = ['Continue', 'New Game', 'Load', 'Settings'];
    for (const btnName of buttons) {
      if (btnName === 'Continue' && !hasSave) continue;

      const pos = this.layout.buttons.positions[btnName];
      if (!pos) continue;

      const [bx, by] = pos;
      const [w, h] = this.layout.buttons.size;

      if (x >= bx && x < bx + w && y >= by && y < by + h) {
        sound.play('ui_button');
        return btnName.toLowerCase().replace(' ', '_') as any;
      }
    }

    return null;
  }

  private handleLoadClick(x: number, y: number): number | 'back' | null {
    const slotY = 100;
    const slotSpacing = 90;
    const slotWidth = 250;
    const slotHeight = 70;

    // Check slots
    for (let i = 0; i < 3; i++) {
      const sy = slotY + i * slotSpacing;
      if (x >= 10 && x < 10 + slotWidth && y >= sy && y < sy + slotHeight) {
        sound.play('ui_button');
        return i + 1;
      }
    }

    // Check back button
    const backY = slotY + slotSpacing * 3 + 10;
    const backX = 135 - 70;
    if (x >= backX && x < backX + 140 && y >= backY && y < backY + 30) {
      sound.play('ui_button');
      this.mode = 'title';
      return 'back';
    }

    return null;
  }

  // Reset to title
  reset(): void {
    this.mode = 'title';
  }

  // Get mode for external checks
  getMode(): 'title' | 'load' {
    return this.mode;
  }

  // Set mode
  setMode(mode: 'title' | 'load'): void {
    this.mode = mode;
  }
}
