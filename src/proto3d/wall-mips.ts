import * as THREE from 'three';
import { loadHtmlImage } from './asset-cache';
import wallMips from '../../public/proto3d/tex3d/wall_mips.json';

type WallMipsFile = {
  filter: string;
  levels: number[];
  textures: Record<string, Record<string, string>>;
};

const MIPS = wallMips as WallMipsFile;

export function wallMipSpec(filename: string): Record<string, string> | null {
  return MIPS.textures[filename] ?? null;
}

export function hasWallMips(filename: string): boolean {
  return !!wallMipSpec(filename);
}

/** Nearest-filtered custom mipmaps from the artist's _64 / _32 files. */
export async function loadNearestMipTexture(baseUrl: string, filename: string): Promise<THREE.Texture> {
  const spec = wallMipSpec(filename);
  if (!spec) throw new Error(`No wall mips for ${filename}`);
  const imgs = await Promise.all(
    MIPS.levels.map((lvl) => loadHtmlImage(`${baseUrl}proto3d/tex3d/${spec[String(lvl)]}`))
  );
  const tex = new THREE.Texture(imgs[0]);
  tex.mipmaps = imgs;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  (tex as { encoding?: number }).encoding = 3001;
  tex.needsUpdate = true;
  return tex;
}
