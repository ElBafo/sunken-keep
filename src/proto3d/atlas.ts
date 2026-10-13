import * as THREE from 'three';
import {
  fetchJsonCached,
  loadHtmlImage,
  loadSharedTexture,
  loadTextureCached,
  onAssetCacheReset,
  recordedFetchUrls
} from './asset-cache';

export const ATLAS_SHEETS = ['monsters', 'portraits', 'ui', 'props', 'fx'] as const;
export type AtlasSheetName = (typeof ATLAS_SHEETS)[number];

export interface AtlasFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasHit {
  sheet: AtlasSheetName;
  image: string;
  size: { w: number; h: number };
  frame: AtlasFrameRect;
}

export interface SpriteImage {
  image: HTMLImageElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  path: string;
  fromAtlas: boolean;
}

interface AtlasMapFile {
  image: string;
  size: { w: number; h: number };
  frames: Record<string, AtlasFrameRect>;
}

const maps = new Map<AtlasSheetName, AtlasMapFile>();
const frameIndex = new Map<string, AtlasHit>();
const fallbacks = new Set<string>();
const spriteImageCache = new Map<string, Promise<SpriteImage>>();
const spriteTextureCache = new Map<string, Promise<THREE.Texture>>();
let mapsPromise: Promise<void> | null = null;

function baseUrl(): string {
  return typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL : '/';
}

function isDev(): boolean {
  return typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;
}

export function atlasRelPaths(sheets: readonly AtlasSheetName[] = ATLAS_SHEETS): string[] {
  const out: string[] = [];
  for (const name of sheets) {
    out.push(`art/atlas/${name}.json`, `art/atlas/${name}.png`);
  }
  return out;
}

export function urlToRelPath(url: string): string {
  let path = url;
  try {
    if (/^[a-z]+:/i.test(url)) path = new URL(url).pathname;
  } catch {
    path = url;
  }
  path = path.split('?')[0].split('#')[0];
  path = path.replace(/^\/+/, '');
  const base = baseUrl().replace(/^\/+/, '').replace(/\/+$/, '');
  if (base && path.startsWith(`${base}/`)) path = path.slice(base.length + 1);
  else if (path.startsWith('sunken-keep/')) path = path.slice('sunken-keep/'.length);
  return path;
}

export function lookupFrame(relPath: string): AtlasHit | null {
  return frameIndex.get(relPath) ?? null;
}

export function atlasFramePaths(): string[] {
  return [...frameIndex.keys()].sort();
}

export function atlasFallbackPaths(): string[] {
  return [...fallbacks].sort();
}

export function recordedPngRelPaths(urls: readonly string[] = recordedFetchUrls()): string[] {
  const seen = new Set<string>();
  for (const url of urls) {
    const rel = urlToRelPath(url);
    if (rel.endsWith('.png') || rel.endsWith('.jpg') || rel.endsWith('.webp')) seen.add(rel);
  }
  return [...seen].sort();
}

/** Image/png fetches whose path is a packed frame (should have used the sheet). */
export function coveredSingleFileLoads(urls: readonly string[] = recordedFetchUrls()): string[] {
  const sheetFiles = new Set(ATLAS_SHEETS.map((name) => `art/atlas/${name}.png`));
  const hits = new Set<string>();
  for (const url of urls) {
    const rel = urlToRelPath(url);
    if (!rel.endsWith('.png')) continue;
    if (sheetFiles.has(rel)) continue;
    if (frameIndex.has(rel)) hits.add(rel);
  }
  return [...hits].sort();
}

function indexMap(name: AtlasSheetName, data: AtlasMapFile): void {
  maps.set(name, data);
  for (const [path, frame] of Object.entries(data.frames)) {
    frameIndex.set(path, { sheet: name, image: data.image, size: data.size, frame });
  }
}

/** Tests install packed maps without hitting the network. */
export function installAtlasMaps(entries: Array<[AtlasSheetName, AtlasMapFile]>): void {
  resetAtlases();
  for (const [name, data] of entries) indexMap(name, data);
}

async function loadMaps(): Promise<void> {
  if (maps.size === ATLAS_SHEETS.length) return;
  const base = baseUrl();
  await Promise.all(
    ATLAS_SHEETS.map(async (name) => {
      if (maps.has(name)) return;
      const data = await fetchJsonCached<AtlasMapFile>(`${base}art/atlas/${name}.json`);
      indexMap(name, data);
    })
  );
}

export function ensureAtlasMaps(): Promise<void> {
  if (!mapsPromise) {
    mapsPromise = loadMaps().catch((err) => {
      mapsPromise = null;
      throw err;
    });
  }
  return mapsPromise;
}

export async function ensureSheet(name: AtlasSheetName): Promise<HTMLImageElement> {
  await ensureAtlasMaps();
  const data = maps.get(name);
  if (!data) throw new Error(`Missing atlas map ${name}`);
  return loadHtmlImage(`${baseUrl()}${data.image}`);
}

/** JSON maps plus every sheet PNG. Floor 1 early group loads this with the walls. */
export async function ensureAtlases(): Promise<void> {
  await ensureAtlasMaps();
  await Promise.all(ATLAS_SHEETS.map((name) => ensureSheet(name)));
}

function recordFallback(relPath: string): void {
  if (fallbacks.has(relPath)) return;
  fallbacks.add(relPath);
  if (isDev()) console.info('[atlas] fallback', relPath);
}

function configureSpriteTex(tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  (tex as { encoding?: number }).encoding = 3001;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
}

/** Three.js UV origin is bottom-left; atlas JSON y is from the top of the sheet. */
export function frameOffsetRepeat(
  frame: AtlasFrameRect,
  sheet: { w: number; h: number }
): { offset: { x: number; y: number }; repeat: { x: number; y: number } } {
  const sw = Math.max(1, sheet.w);
  const sh = Math.max(1, sheet.h);
  return {
    offset: { x: frame.x / sw, y: 1 - (frame.y + frame.h) / sh },
    repeat: { x: frame.w / sw, y: frame.h / sh }
  };
}

export function applyFrameToTexture(tex: THREE.Texture, hit: AtlasHit): void {
  const uv = frameOffsetRepeat(hit.frame, hit.size);
  tex.offset.set(uv.offset.x, uv.offset.y);
  tex.repeat.set(uv.repeat.x, uv.repeat.y);
  tex.userData.atlasFrame = { ...hit.frame };
  tex.userData.atlasSheet = { ...hit.size };
  tex.userData.atlasPath = hit.image;
  configureSpriteTex(tex);
}

export function textureFrameSize(tex: THREE.Texture | undefined): { w: number; h: number } {
  const frame = tex?.userData?.atlasFrame as AtlasFrameRect | undefined;
  if (frame && frame.w > 0 && frame.h > 0) return { w: frame.w, h: frame.h };
  const img = tex?.image as { width?: number; height?: number } | undefined;
  return { w: img?.width ?? 80, h: img?.height ?? 60 };
}

function asSpriteImage(image: HTMLImageElement, path: string, frame?: AtlasFrameRect): SpriteImage {
  if (frame) {
    return { image, sx: frame.x, sy: frame.y, sw: frame.w, sh: frame.h, path, fromAtlas: true };
  }
  return { image, sx: 0, sy: 0, sw: image.width, sh: image.height, path, fromAtlas: false };
}

export function loadSpriteImage(relPath: string): Promise<SpriteImage> {
  const cached = spriteImageCache.get(relPath);
  if (cached) return cached;
  const pending = (async () => {
    await ensureAtlasMaps();
    const hit = lookupFrame(relPath);
    if (hit) {
      const image = await ensureSheet(hit.sheet);
      return asSpriteImage(image, relPath, hit.frame);
    }
    recordFallback(relPath);
    const image = await loadHtmlImage(`${baseUrl()}${relPath}`);
    return asSpriteImage(image, relPath);
  })();
  spriteImageCache.set(relPath, pending);
  return pending;
}

export function loadSpriteTexture(relPath: string): Promise<THREE.Texture> {
  const cached = spriteTextureCache.get(relPath);
  if (cached) return cached;
  const pending = (async () => {
    await ensureAtlasMaps();
    const hit = lookupFrame(relPath);
    if (hit) {
      const shared = await loadSharedTexture(`${baseUrl()}${hit.image}`);
      const tex = shared.clone();
      applyFrameToTexture(tex, hit);
      return tex;
    }
    recordFallback(relPath);
    const tex = await loadTextureCached(`${baseUrl()}${relPath}`);
    configureSpriteTex(tex);
    return tex;
  })();
  spriteTextureCache.set(relPath, pending);
  return pending;
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  src: SpriteImage | undefined | null,
  dx: number,
  dy: number,
  dw?: number,
  dh?: number
): void {
  if (!src) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src.image, src.sx, src.sy, src.sw, src.sh, dx, dy, dw ?? src.sw, dh ?? src.sh);
}

/** Source rect is relative to the packed frame, not the sheet. */
export function drawSpriteSrc(
  ctx: CanvasRenderingContext2D,
  src: SpriteImage,
  srcX: number,
  srcY: number,
  srcW: number,
  srcH: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): void {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src.image, src.sx + srcX, src.sy + srcY, srcW, srcH, dx, dy, dw, dh);
}

export function cropSpriteBlobUrl(src: SpriteImage): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, src.sw);
  canvas.height = Math.max(1, src.sh);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('no 2d context'));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src.image, src.sx, src.sy, src.sw, src.sh, 0, 0, src.sw, src.sh);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('sprite blob failed'));
      else resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });
}

export function resetAtlases(): void {
  maps.clear();
  frameIndex.clear();
  fallbacks.clear();
  spriteImageCache.clear();
  spriteTextureCache.clear();
  mapsPromise = null;
}

onAssetCacheReset(resetAtlases);
