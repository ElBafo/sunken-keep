import * as THREE from 'three';

/**
 * One in-flight promise per URL so title prefetch, intro, HUD, and floor boot
 * never hit the network twice for the same file.
 */
const buffers = new Map<string, Promise<ArrayBuffer>>();
const jsonCache = new Map<string, Promise<unknown>>();
const imageCache = new Map<string, Promise<HTMLImageElement>>();
const textureCache = new Map<string, Promise<THREE.Texture>>();
const audioCache = new Map<string, Promise<AudioBuffer>>();
const fetchLog: string[] = [];
let resetHook: (() => void) | null = null;

/** Tests and atlas leak checks subscribe so sheet maps clear with the URL cache. */
export function onAssetCacheReset(fn: () => void): void {
  resetHook = fn;
}

export function recordedFetchUrls(): readonly string[] {
  return fetchLog;
}

function remember<T>(map: Map<string, Promise<T>>, key: string, factory: () => Promise<T>): Promise<T> {
  const existing = map.get(key);
  if (existing) return existing;
  const pending = factory().catch((err) => {
    map.delete(key);
    throw err;
  });
  map.set(key, pending);
  return pending;
}

export function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  fetchLog.push(url);
  return remember(buffers, url, async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
    return res.arrayBuffer();
  });
}

export async function prefetchUrl(url: string): Promise<void> {
  try {
    await fetchArrayBuffer(url);
  } catch {
    // Warm-up; the real loader retries.
  }
}

export function fetchJsonCached<T>(url: string): Promise<T> {
  return remember(jsonCache, url, async () => {
    const buf = await fetchArrayBuffer(url);
    return JSON.parse(new TextDecoder().decode(buf)) as T;
  }) as Promise<T>;
}

export function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return remember(imageCache, url, async () => {
    const buf = await fetchArrayBuffer(url);
    const blob = new Blob([buf]);
    const obj = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Failed to decode image ${url}`));
        img.src = obj;
      });
    } finally {
      URL.revokeObjectURL(obj);
    }
    return img;
  });
}

/** Shared GPU image; callers should `clone()` before changing wrap/filter. */
export function loadSharedTexture(url: string): Promise<THREE.Texture> {
  return remember(textureCache, url, async () => {
    const img = await loadHtmlImage(url);
    const tex = new THREE.Texture(img);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

export async function loadTextureCached(url: string): Promise<THREE.Texture> {
  const shared = await loadSharedTexture(url);
  return shared.clone();
}

export function loadAudioCached(url: string, ctx: AudioContext): Promise<AudioBuffer> {
  return remember(audioCache, url, async () => {
    const buf = await fetchArrayBuffer(url);
    return ctx.decodeAudioData(buf.slice(0));
  });
}

export function cachedUrlCount(): number {
  return buffers.size;
}

export function resetAssetCache(): void {
  buffers.clear();
  jsonCache.clear();
  imageCache.clear();
  textureCache.clear();
  audioCache.clear();
  fetchLog.length = 0;
  resetHook?.();
}
