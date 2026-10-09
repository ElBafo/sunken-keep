import { assets } from './assets';
import type { SaveSlot } from './types';
import { SaveSystem } from './save-system';
import { sound } from './assets';

export class TitleScreen {
  private selectedSlot: number = 1;
  private mode: 'title' | 'load' = 'title';

  // Render title screen
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Background (dark stone)
    ctx.fillStyle = '#1a1612';
    ctx.fillRect(0, 0, width, height);

    const baseUrl = '/sunken-keep/';

    if (this.mode === 'title') {
      this.renderTitle(ctx, width, height, baseUrl);
    } else {
      this.renderLoadMenu(ctx, width, height);
    }
  }

  private renderTitle(ctx: CanvasRenderingContext2D, width: number, height: number, baseUrl: string): void {
    // Title
    ctx.fillStyle = '#d8ccb0';
    ctx.font = 'bold 24px serif';
    ctx.textAlign = 'center';
    ctx.fillText('THE SUNKEN KEEP', width / 2, 80);

    // Subtitle
    ctx.font = '14px serif';
    ctx.fillStyle = '#8a7a6a';
    ctx.fillText('Act I: The Flooded Halls', width / 2, 110);

    // Get most recent save
    const mostRecentSlot = SaveSystem.getMostRecentSlot();
    const hasSave = mostRecentSlot !== null;

    // Buttons
    const buttonY = 160;
    const buttonHeight = 40;
    const buttonSpacing = 50;

    // New Game button
    this.drawButton(ctx, width / 2 - 100, buttonY, 200, buttonHeight, 'NEW GAME', '#4a8a3a');

    // Continue button (only if save exists)
    if (hasSave) {
      this.drawButton(ctx, width / 2 - 100, buttonY + buttonSpacing, 200, buttonHeight, 'CONTINUE', '#6a6a8a');
    }

    // Load button
    this.drawButton(ctx, width / 2 - 100, buttonY + buttonSpacing * 2, 200, buttonHeight, 'LOAD GAME', '#8a6a4a');
  }

  private renderLoadMenu(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Title
    ctx.fillStyle = '#d8ccb0';
    ctx.font = 'bold 20px serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOAD GAME', width / 2, 60);

    // Get all save slots
    const saves = SaveSystem.getAllSlots();

    // Draw save slots
    const slotY = 100;
    const slotHeight = 70;
    const slotSpacing = 80;

    for (let i = 0; i < 3; i++) {
      const save = saves[i];
      const y = slotY + i * slotSpacing;
      const isEmpty = !save;

      // Slot background
      ctx.fillStyle = this.selectedSlot === i + 1 ? '#3a3a4a' : '#2a2a2a';
      ctx.fillRect(20, y, width - 40, slotHeight);

      // Border
      ctx.strokeStyle = this.selectedSlot === i + 1 ? '#6a6a8a' : '#4a4a4a';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, y, width - 40, slotHeight);

      // Slot label
      ctx.fillStyle = '#d8ccb0';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Slot ${i + 1}`, 30, y + 25);

      if (isEmpty) {
        ctx.font = '12px monospace';
        ctx.fillStyle = '#6a6a6a';
        ctx.fillText('Empty', 30, y + 50);
      } else {
        // Save info
        ctx.font = '12px monospace';
        ctx.fillStyle = '#8a8a8a';
        const date = new Date(save.timestamp);
        ctx.fillText(`Floor ${save.floor} - ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`, 30, y + 50);
      }
    }

    // Back button
    this.drawButton(ctx, width / 2 - 80, slotY + slotSpacing * 3 + 20, 160, 35, 'BACK', '#8a3a3a');
  }

  private drawButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, text: string, color: string): void {
    // Background
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);

    // Border
    ctx.strokeStyle = '#d8ccb0';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
  }

  // Handle click
  handleClick(x: number, y: number, width: number, height: number): 'new' | 'continue' | 'load' | number | 'back' | null {
    if (this.mode === 'title') {
      return this.handleTitleClick(x, y, width, height);
    } else {
      return this.handleLoadClick(x, y, width, height);
    }
  }

  private handleTitleClick(x: number, y: number, width: number, height: number): 'new' | 'continue' | 'load' | null {
    const buttonY = 160;
    const buttonHeight = 40;
    const buttonSpacing = 50;
    const buttonX = width / 2 - 100;
    const buttonWidth = 200;

    // Check New Game
    if (this.isInRect(x, y, buttonX, buttonY, buttonWidth, buttonHeight)) {
      sound.play('ui_button');
      return 'new';
    }

    // Check Continue
    const mostRecentSlot = SaveSystem.getMostRecentSlot();
    if (mostRecentSlot !== null) {
      if (this.isInRect(x, y, buttonX, buttonY + buttonSpacing, buttonWidth, buttonHeight)) {
        sound.play('ui_button');
        return 'continue';
      }
    }

    // Check Load
    if (this.isInRect(x, y, buttonX, buttonY + buttonSpacing * 2, buttonWidth, buttonHeight)) {
      sound.play('ui_button');
      this.mode = 'load';
      return 'load';
    }

    return null;
  }

  private handleLoadClick(x: number, y: number, width: number, height: number): number | 'back' | null {
    const slotY = 100;
    const slotHeight = 70;
    const slotSpacing = 80;

    // Check slots
    for (let i = 0; i < 3; i++) {
      const y = slotY + i * slotSpacing;
      if (this.isInRect(x, y, 20, y, width - 40, slotHeight)) {
        this.selectedSlot = i + 1;
        sound.play('ui_button');
        return i + 1;
      }
    }

    // Check back button
    const backY = slotY + slotSpacing * 3 + 20;
    if (this.isInRect(x, y, width / 2 - 80, backY, 160, 35)) {
      sound.play('ui_button');
      this.mode = 'title';
      return 'back';
    }

    return null;
  }

  private isInRect(x: number, y: number, rx: number, ry: number, rw: number, rh: number): boolean {
    return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
  }

  // Reset to title
  reset(): void {
    this.mode = 'title';
    this.selectedSlot = 1;
  }
}
