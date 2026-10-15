import { cropSpriteBlobUrl, loadSpriteImage } from './atlas';
import {
  applyLayoutMode,
  getLayoutMode,
  hudScaleFor,
  PANEL_DESIGN_H,
  PANEL_DESIGN_W,
  type LayoutMode
} from './phone-layout';

export const GAME_STAGE_W = 270;
export const GAME_STAGE_H = 585;
/** Viewports this compact (iPhone, browser Safari) use a fractional contain scale. */
export const COMPACT_MAX_SHORT_SIDE = 500;

const OVERLAY_IDS = ['title-stage', 'intro-stage', 'inventory-screen'] as const;
const PLAY_CHROME_IDS = ['canvas-container', 'render-canvas', 'party-hud', 'party-canvas'] as const;

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

export interface StageFit {
  scale: number;
  left: number;
  top: number;
  width: number;
  height: number;
  mode: LayoutMode;
}

export function fitGameStage(): StageFit | null {
  const mode = getLayoutMode();
  if (mode === 'edge') return fitEdgeStage();
  return fitFramedStage();
}

function fitFramedStage(): StageFit | null {
  const stage = document.getElementById('game-stage');
  const host = document.getElementById('game-letterbox') ?? document.body;
  if (!stage) return null;

  clearEdgeInlineStyles();

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
  return { scale, left, top, width, height, mode: 'framed' };
}

function fitEdgeStage(): StageFit | null {
  const stage = document.getElementById('game-stage');
  const host = document.getElementById('game-letterbox') ?? document.body;
  if (!stage) return null;

  const availW = Math.max(1, host.clientWidth);
  const availH = Math.max(1, host.clientHeight);
  const { scale: hudScale, overlay } = hudScaleFor(availW, availH);
  const hudW = Math.round(PANEL_DESIGN_W * hudScale);
  const hudH = Math.round(PANEL_DESIGN_H * hudScale);
  const viewH = overlay ? availH : Math.max(1, availH - hudH);

  stage.style.width = `${availW}px`;
  stage.style.height = `${availH}px`;
  stage.style.left = '0px';
  stage.style.top = '0px';
  stage.style.transform = 'none';
  stage.style.transformOrigin = 'top left';
  stage.style.imageRendering = 'pixelated';

  const view = document.getElementById('canvas-container');
  const canvas = document.getElementById('render-canvas');
  const hud = document.getElementById('party-hud');
  const hudCanvas = document.getElementById('party-canvas');

  if (view) {
    view.style.width = `${availW}px`;
    view.style.height = `${viewH}px`;
    view.style.position = overlay ? 'absolute' : 'relative';
    view.style.left = overlay ? '0px' : '';
    view.style.top = overlay ? '0px' : '';
  }
  if (canvas) {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }
  if (hud) {
    hud.style.width = `${hudW}px`;
    hud.style.height = `${hudH}px`;
    hud.style.marginLeft = 'auto';
    hud.style.marginRight = 'auto';
    if (overlay) {
      hud.style.position = 'absolute';
      hud.style.left = `${Math.round((availW - hudW) / 2)}px`;
      hud.style.bottom = '0px';
      hud.style.top = 'auto';
      hud.style.zIndex = '30';
    } else {
      hud.style.position = 'relative';
      hud.style.left = '';
      hud.style.bottom = '';
      hud.style.top = '';
      hud.style.zIndex = '';
    }
  }
  if (hudCanvas) {
    hudCanvas.style.width = `${hudW}px`;
    hudCanvas.style.height = `${hudH}px`;
  }

  for (const id of OVERLAY_IDS) {
    containDesignBox(document.getElementById(id), GAME_STAGE_W, GAME_STAGE_H, availW, availH);
  }

  return { scale: hudScale, left: 0, top: 0, width: availW, height: availH, mode: 'edge' };
}

function containDesignBox(
  el: HTMLElement | null,
  designW: number,
  designH: number,
  availW: number,
  availH: number
) {
  if (!el) return;
  const scale = Math.min(availW / designW, availH / designH);
  const width = designW * scale;
  const height = designH * scale;
  el.style.position = 'absolute';
  el.style.width = `${designW}px`;
  el.style.height = `${designH}px`;
  el.style.transformOrigin = 'top left';
  el.style.transform = `scale(${scale})`;
  el.style.left = `${Math.round((availW - width) / 2)}px`;
  el.style.top = `${Math.round((availH - height) / 2)}px`;
}

function clearEdgeInlineStyles() {
  for (const id of [...PLAY_CHROME_IDS, ...OVERLAY_IDS]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.style.width = '';
    el.style.height = '';
    el.style.transform = '';
    el.style.left = '';
    el.style.top = '';
    el.style.bottom = '';
    el.style.marginLeft = '';
    el.style.marginRight = '';
    el.style.position = '';
    el.style.zIndex = '';
  }
}

export function setDocumentLayout(mode: LayoutMode) {
  applyLayoutMode(mode);
  return fitGameStage();
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
