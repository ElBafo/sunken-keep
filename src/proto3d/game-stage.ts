import { cropSpriteBlobUrl, loadSpriteImage } from './atlas';

export const GAME_STAGE_W = 270;
export const GAME_STAGE_H = 585;
/** Viewports this compact (iPhone, browser Safari) use a fractional contain scale. */
export const COMPACT_MAX_SHORT_SIDE = 500;

export function isCompactViewport(viewW: number, viewH: number): boolean {
  return Math.min(viewW, viewH) <= COMPACT_MAX_SHORT_SIDE;
}

/**
 * Phones: fill width, or height when that is the limit (fractional scale is OK).
 * Desktop / large screens: snap to a whole-number scale.
 */
export function gameStageScale(viewW: number, viewH: number, _dpr = 1): number {
  const maxScale = Math.min(viewW / GAME_STAGE_W, viewH / GAME_STAGE_H);
  if (!Number.isFinite(maxScale) || maxScale <= 0) return 1;
  if (isCompactViewport(viewW, viewH)) return maxScale;
  const whole = Math.floor(maxScale);
  return whole >= 1 ? whole : maxScale;
}

export function fitGameStage(): { scale: number; left: number; top: number; width: number; height: number } | null {
  const stage = document.getElementById('game-stage');
  const host = document.getElementById('game-letterbox') ?? document.body;
  if (!stage) return null;

  const padTop = parseFloat(getComputedStyle(host).paddingTop) || 0;
  const viewW = host.clientWidth;
  const viewH = Math.max(1, host.clientHeight - padTop);
  const scale = gameStageScale(viewW, viewH, window.devicePixelRatio || 1);
  const width = GAME_STAGE_W * scale;
  const height = GAME_STAGE_H * scale;
  const left = Math.round((viewW - width) / 2);
  const top = Math.round(padTop + (viewH - height) / 2);

  stage.style.width = `${GAME_STAGE_W}px`;
  stage.style.height = `${GAME_STAGE_H}px`;
  stage.style.transformOrigin = 'top left';
  stage.style.transform = `scale(${scale})`;
  stage.style.imageRendering = 'pixelated';
  stage.style.left = `${left}px`;
  stage.style.top = `${top}px`;
  return { scale, left, top, width, height };
}

/** Tile the letterbox from the shared asset cache so CSS never fetches a second copy. */
export async function applyLetterboxStone(): Promise<void> {
  const host = document.getElementById('game-letterbox');
  if (!host || host.dataset.stone) return;
  try {
    const src = await loadSpriteImage('art/ui/layout585/stone_strip_tile.png');
    const obj = await cropSpriteBlobUrl(src);
    host.style.backgroundImage = `url("${obj}")`;
    host.style.backgroundRepeat = 'repeat';
    host.dataset.stone = '1';
  } catch {
    // Keep the solid fallback fill.
  }
}
