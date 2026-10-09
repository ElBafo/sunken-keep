import { assets } from './assets';

export type Expression = 'neutral' | 'smirk' | 'wince' | 'shocked';
export type HealthState = 'healthy' | 'wounded' | 'near_death';

export interface Character {
  id: string;
  name: string;
  maxHp: number;
  hp: number;
  expression: Expression;
  talkingUntil: number;
  hitFlashUntil: number;
  idleAnimTime: number;
  lastIdleAnim: number;
}

export const characters: Character[] = [
  { id: 'brannoc', name: 'Brannoc', maxHp: 45, hp: 45, expression: 'neutral', talkingUntil: 0, hitFlashUntil: 0, idleAnimTime: 0, lastIdleAnim: 0 },
  { id: 'wren', name: 'Sister Wren', maxHp: 32, hp: 32, expression: 'neutral', talkingUntil: 0, hitFlashUntil: 0, idleAnimTime: 0, lastIdleAnim: 0 },
  { id: 'ilsevar', name: 'Ilsevar', maxHp: 24, hp: 24, expression: 'neutral', talkingUntil: 0, hitFlashUntil: 0, idleAnimTime: 0, lastIdleAnim: 0 },
  { id: 'mags', name: 'Mags', maxHp: 28, hp: 28, expression: 'neutral', talkingUntil: 0, hitFlashUntil: 0, idleAnimTime: 0, lastIdleAnim: 0 }
];

export function getHealthState(char: Character): HealthState {
  const percent = char.hp / char.maxHp;
  if (percent < 0.25) return 'near_death';
  if (percent < 0.6) return 'wounded';
  return 'healthy';
}

export function getPortraitPath(char: Character, state: HealthState): string {
  // Use health-state portraits
  const statePath = `/sunken-keep/art/portraits/${char.id}_${state}.png`;
  if (assets.getImage(statePath)) {
    return statePath;
  }
  
  // Fall back to healthy
  return `/sunken-keep/art/portraits/${char.id}_healthy.png`;
}

export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  char: Character,
  x: number,
  y: number,
  now: number
) {
  const state = getHealthState(char);
  const path = getPortraitPath(char, state);
  const img = assets.getImage(path);
  
  if (!img || !img.complete || !assets.isImageReady(img)) return;

  // Draw base portrait
  try {
    ctx.drawImage(img, x, y);
  } catch (e) {
    console.error(`Failed to draw portrait ${path}:`, e);
    return;
  }

  // Apply subtle tint/darkening for wounded states if variant doesn't exist
  if (state !== 'healthy' && !assets.getImage(`/sunken-keep/art/portraits/${char.id}_${state}.png`)) {
    ctx.save();
    ctx.globalAlpha = state === 'near_death' ? 0.4 : 0.2;
    ctx.fillStyle = '#220000';
    ctx.fillRect(x, y, 64, 64);
    ctx.restore();
  }

  // Talking mouth animation (simple open/close)
  if (now < char.talkingUntil) {
    const mouthFrame = Math.floor((now / 150) % 2);
    if (mouthFrame === 1) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + 28, y + 42, 8, 4);
    }
  }

  // Hit flash
  if (now < char.hitFlashUntil) {
    const flashFrame = Math.floor((now - (char.hitFlashUntil - 120)) / 60);
    const flashPath = `/sunken-keep/art/overlays/hit_flash_${flashFrame + 1}.png`;
    const flash = assets.getImage(flashPath);
    if (flash && flash.complete && assets.isImageReady(flash)) {
      try {
        ctx.drawImage(flash, x, y);
      } catch (e) {
        console.error(`Failed to draw hit flash ${flashPath}:`, e);
      }
    }
  }
}

export function damageCharacter(char: Character, amount: number) {
  char.hp = Math.max(0, char.hp - amount);
  char.hitFlashUntil = Date.now() + 120;
  char.expression = 'wince';
  setTimeout(() => {
    if (char.expression === 'wince') char.expression = 'neutral';
  }, 500);
}

export function healCharacter(char: Character, amount: number) {
  char.hp = Math.min(char.maxHp, char.hp + amount);
  char.expression = 'smirk';
  setTimeout(() => {
    if (char.expression === 'smirk') char.expression = 'neutral';
  }, 500);
}

export function resetIdleTimers() {
  const now = Date.now();
  characters.forEach(c => {
    c.idleAnimTime = now;
  });
}

// Load all portrait variations
export function loadPortraits() {
  const names = ['brannoc', 'wren', 'ilsevar', 'mags'];
  const states: HealthState[] = ['healthy', 'wounded', 'near_death'];

  names.forEach(name => {
    // Load health state portraits
    states.forEach(state => {
      assets.loadImage(`/sunken-keep/art/portraits/${name}_${state}.png`);
    });
  });

  // Load hit flash overlays
  assets.loadImage('/sunken-keep/art/overlays/hit_flash_1.png');
  assets.loadImage('/sunken-keep/art/overlays/hit_flash_2.png');
}
