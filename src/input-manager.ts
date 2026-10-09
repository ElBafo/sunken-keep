import type { HeroId } from './constants';
import { HERO_LAYOUT, CONTROLS_LAYOUT } from './constants';

export class InputManager {
  // Check if point is inside rectangle
  private isInRect(x: number, y: number, rect: [number, number, number, number]): boolean {
    const [rx, ry, rw, rh] = rect;
    return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
  }

  // Check if click is on a hand button, returns {heroId, hand} or null
  checkHandButton(x: number, y: number): { heroId: HeroId; hand: 'main' | 'off' } | null {
    const heroes: HeroId[] = ['brannoc', 'wren', 'ilsevar', 'mags'];

    for (const heroId of heroes) {
      const layout = HERO_LAYOUT[heroId];

      // Check main hand
      if (this.isInRect(x, y, layout.handMain)) {
        return { heroId, hand: 'main' };
      }

      // Check off hand
      if (this.isInRect(x, y, layout.handOff)) {
        return { heroId, hand: 'off' };
      }
    }

    return null;
  }

  // Check movement pad buttons
  checkMovementPad(x: number, y: number): string | null {
    const pad = CONTROLS_LAYOUT.pad;
    const buttons: Array<[string, [number, number, number, number]]> = [
      ['turn_left', pad.turn_left],
      ['forward', pad.forward],
      ['turn_right', pad.turn_right],
      ['strafe_left', pad.strafe_left],
      ['back', pad.back],
      ['strafe_right', pad.strafe_right],
    ];

    for (const [key, rect] of buttons) {
      if (this.isInRect(x, y, rect)) {
        return key;
      }
    }

    return null;
  }

  // Check potion buttons
  checkPotionButton(x: number, y: number): 'health' | 'mana' | null {
    if (this.isInRect(x, y, CONTROLS_LAYOUT.potion_health)) {
      return 'health';
    }
    if (this.isInRect(x, y, CONTROLS_LAYOUT.potion_mana)) {
      return 'mana';
    }
    return null;
  }

  // Check menu button
  checkMenuButton(x: number, y: number): boolean {
    return this.isInRect(x, y, CONTROLS_LAYOUT.menu);
  }

  // Check save button
  checkSaveButton(x: number, y: number): boolean {
    return this.isInRect(x, y, CONTROLS_LAYOUT.save);
  }

  // Check portrait (for character sheet)
  checkPortrait(x: number, y: number): HeroId | null {
    const heroes: HeroId[] = ['brannoc', 'wren', 'ilsevar', 'mags'];

    for (const heroId of heroes) {
      const layout = HERO_LAYOUT[heroId];
      if (this.isInRect(x, y, layout.portrait)) {
        return heroId;
      }
    }

    return null;
  }
}

export const inputManager = new InputManager();
