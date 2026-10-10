export const GAME_STAGE_W = 270;
export const GAME_STAGE_H = 585;

/** Snap CSS scale so each art pixel covers the same number of device pixels. */
export function gameStageScale(viewW: number, viewH: number, dpr = 1): number {
  const maxScale = Math.min(viewW / GAME_STAGE_W, viewH / GAME_STAGE_H);
  if (!Number.isFinite(maxScale) || maxScale <= 0) return 1;
  const pixelRatio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const snapped = Math.floor(maxScale * pixelRatio) / pixelRatio;
  return snapped > 0 ? snapped : maxScale;
}

export function fitGameStage(): { scale: number; left: number; top: number } | null {
  const stage = document.getElementById('game-stage');
  const host = document.getElementById('game-letterbox') ?? document.body;
  if (!stage) return null;

  const padTop = parseFloat(getComputedStyle(host).paddingTop) || 0;
  const viewW = host.clientWidth;
  const viewH = Math.max(1, host.clientHeight - padTop);
  const dpr = window.devicePixelRatio || 1;
  const scale = gameStageScale(viewW, viewH, dpr);
  const left = Math.round((viewW - GAME_STAGE_W * scale) / 2);
  const top = Math.round(padTop + (viewH - GAME_STAGE_H * scale) / 2);

  stage.style.width = `${GAME_STAGE_W}px`;
  stage.style.height = `${GAME_STAGE_H}px`;
  stage.style.transformOrigin = 'top left';
  stage.style.transform = `scale(${scale})`;
  stage.style.left = `${left}px`;
  stage.style.top = `${top}px`;
  return { scale, left, top };
}
