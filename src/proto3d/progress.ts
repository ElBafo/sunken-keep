import { OIL_MAX, OIL_START } from './constants';
import { Sconce } from './types';

const STORAGE_KEY = 'proto3d.floor1.lights';

interface SavedLights {
  oil?: number;
  lit?: Record<string, boolean>;
}

function sconceKey(s: Sconce): string {
  return `${s.x},${s.y},${s.face}`;
}

export function persistEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('test') !== '1';
}

export function loadProgress(sconces: Sconce[], persist: boolean): number {
  if (!persist) return OIL_START;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return OIL_START;
    const data = JSON.parse(raw) as SavedLights;
    if (data.lit) {
      for (const s of sconces) {
        if (s.capped) continue;
        const flag = data.lit[sconceKey(s)];
        if (typeof flag === 'boolean') s.lit = flag;
      }
    }
    if (typeof data.oil === 'number' && Number.isFinite(data.oil)) {
      return Math.min(OIL_MAX, Math.max(0, Math.floor(data.oil)));
    }
  } catch {
    // ignore broken saves
  }
  return OIL_START;
}

export function saveProgress(sconces: Sconce[], oil: number, persist: boolean) {
  if (!persist) return;
  const lit: Record<string, boolean> = {};
  for (const s of sconces) {
    if (!s.capped) lit[sconceKey(s)] = !!s.lit;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ oil, lit }));
  } catch {
    // quota / private mode
  }
}

export function clearProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
