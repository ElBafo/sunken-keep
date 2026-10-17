import {
  DEPTH_LAYERS,
  MAT_MOSS,
  MAT_WET,
  ROUGH_MATTE,
  ROUGH_STONE,
  ROUGH_WET
} from '../../voxel-lab/constants';
import { luma, volumeFromImageData, type VolumeFromPixels } from '../../voxel-lab/classify';

export const RELIEF_MAX_AXIS = 32;

export type ImageDataLike = {
  width: number;
  height: number;
  data: ArrayLike<number>;
};

/** `wall_plain.png` → `wall_plain_height.png` (artist drop-in, optional). */
export function heightMapFilename(albedoFile: string): string {
  return albedoFile.replace(/(\.png)$/i, '_height$1');
}

/** `wall_plain_height.png` → `wall_plain.png`. */
export function albedoFilenameFromHeight(heightFile: string): string {
  return heightFile.replace(/_height(\.png)$/i, '$1');
}

export function downsampleImageData(
  image: ImageDataLike,
  maxAxis = RELIEF_MAX_AXIS
): { width: number; height: number; data: Uint8ClampedArray } {
  const scale = Math.max(1, Math.ceil(Math.max(image.width, image.height) / maxAxis));
  const w = Math.max(1, Math.ceil(image.width / scale));
  const h = Math.max(1, Math.ceil(image.height / scale));
  const data = new Uint8ClampedArray(w * h * 4);
  const ox = scale > 1 ? (scale - 1) >> 1 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(image.width - 1, x * scale + ox);
      const sy = Math.min(image.height - 1, y * scale + ox);
      const si = (sy * image.width + sx) * 4;
      const di = (y * w + x) * 4;
      data[di] = image.data[si];
      data[di + 1] = image.data[si + 1];
      data[di + 2] = image.data[si + 2];
      data[di + 3] = image.data[si + 3];
    }
  }
  return { width: w, height: h, data };
}

function heightLuma(height: ImageDataLike, u: number, v: number, W: number, H: number): number {
  const hx = Math.min(height.width - 1, Math.floor((u / W) * height.width));
  const hy = Math.min(height.height - 1, Math.floor(((H - 1 - v) / H) * height.height));
  const hi = (hy * height.width + hx) * 4;
  const a = height.data[hi + 3] ?? 255;
  // Artist spec: transparent counts as 0 (deepest mortar / plank gap).
  if (a < 16) return 0;
  return luma(height.data[hi], height.data[hi + 1], height.data[hi + 2]);
}

/**
 * Relief from an authored height map: 0 = deepest (mortar, plank gaps),
 * 255 = the face. Albedo still drives moss / wet roughness and cutout holes.
 * Missing maps do not invent luma extrusion — those textures stay flat.
 */
export function volumeFromAlbedoAndHeight(
  albedo: ImageDataLike,
  height?: ImageDataLike | null
): VolumeFromPixels {
  const base = volumeFromImageData(albedo);
  if (!height || height.width < 1 || height.height < 1) return base;
  const [W, H] = base.dims;
  const volume = new Uint8Array(W * H * DEPTH_LAYERS);
  let voxelCount = 0;
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const idx = u + v * W;
      const a = albedoAlpha(albedo, u, v, W, H);
      if (a < 16) continue;
      voxelCount += 1;
      const L = heightLuma(height, u, v, W, H);
      const steps = Math.max(1, Math.min(DEPTH_LAYERS, 1 + Math.round(L * (DEPTH_LAYERS - 1))));
      for (let k = 0; k < steps; k++) volume[idx + k * W * H] = 1;
    }
  }
  return { volume, dims: [W, H, DEPTH_LAYERS], voxelCount, roughness: base.roughness };
}

function albedoAlpha(image: ImageDataLike, u: number, v: number, W: number, H: number): number {
  const py = H - 1 - v;
  const iu = Math.min(image.width - 1, Math.floor((u / W) * image.width));
  const iv = Math.min(image.height - 1, Math.floor((py / H) * image.height));
  return image.data[(iv * image.width + iu) * 4 + 3];
}

export type ReliefKind = 'none' | 'height-map';

export interface ReliefSource {
  kind: ReliefKind;
  /** Height-map filename when one is in use; null means stay flat. */
  heightFile: string | null;
  volume(albedo: ImageDataLike): VolumeFromPixels;
}

export type ReliefSourceFactory = (albedoFile: string, albedo: ImageDataLike) => ReliefSource;

/** Default factory: height map when registered, otherwise no extrusion. */
export function makeReliefFactory(heightByAlbedo: Map<string, ImageDataLike>): ReliefSourceFactory {
  return (albedoFile, _albedo) => {
    const height = heightByAlbedo.get(albedoFile) ?? heightByAlbedo.get(basename(albedoFile));
    if (height) {
      return {
        kind: 'height-map',
        heightFile: heightMapFilename(basename(albedoFile)),
        volume: (img) => volumeFromAlbedoAndHeight(img, height)
      };
    }
    return {
      kind: 'none',
      heightFile: null,
      volume: (img) => volumeFromImageData(img)
    };
  };
}

export function roughnessForMaterial(material: number, mortar: boolean): number {
  if (material === MAT_MOSS || mortar) return ROUGH_MATTE;
  if (material === MAT_WET) return ROUGH_WET;
  return ROUGH_STONE;
}

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(slash + 1) : path;
}
