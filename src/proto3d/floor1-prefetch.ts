import { audioGroupFiles, audioGroupRelPaths } from './audio-groups';
import { prefetchUrl } from './asset-cache';
import { floor1 } from './floor-data';
import { mapPool, SPRITE_LOAD_CONCURRENCY } from './load-pool';
import { listedTex3dFiles, VARIANT_SURFACES, variantFilenames } from './texture-variants';

const LODS = ['close', 'near', 'mid', 'far'] as const;
const ANIMS: ReadonlyArray<readonly [string, number]> = [
  ['idle', 4],
  ['attack', 3],
  ['hurt', 1],
  ['death', 4]
];

const WATER_BEDS = [
  'floor_submerged.png',
  'floor_submerged_2.png',
  'floor_submerged_3.png',
  'floor_submerged_4.png',
  'floor_submerged_deep.png',
  'floor_submerged_deep_2.png',
  'floor_submerged_deep_3.png',
  'floor_submerged_deep_4.png'
];

const CUTOUT_TEX = ['door_open.png', 'door_panel.png', 'secret_closed.png', 'secret_open.png'];

/** Title+floor1 audio that must decode before play. Later beds wait until the dungeon is up. */
export const FLOOR1_PLAY_AUDIO = audioGroupFiles('floor1');

export function floor1MonsterKinds(): string[] {
  const kinds = new Set<string>();
  for (const row of floor1.tiles) {
    for (const tile of row) {
      if (tile.monster) kinds.add(tile.monster);
    }
  }
  return [...kinds];
}

export function floor1TexturePaths(): string[] {
  const files = listedTex3dFiles();
  const paths: string[] = [];
  for (const surface of VARIANT_SURFACES) {
    for (const name of variantFilenames(surface, files)) paths.push(`proto3d/tex3d/${name}`);
  }
  for (const name of CUTOUT_TEX) paths.push(`proto3d/tex3d/${name}`);
  for (const name of WATER_BEDS) paths.push(`proto3d/tex3d/water/${name}`);
  return [...new Set(paths)];
}

export function floor1MonsterArtPaths(): string[] {
  const paths: string[] = [];
  for (const kind of floor1MonsterKinds()) {
    for (const lod of LODS) {
      for (const [anim, count] of ANIMS) {
        for (let i = 1; i <= count; i++) {
          paths.push(`art/dungeon/monsters_v2/${kind}_${anim}_${i}_${lod}.png`);
        }
      }
    }
  }
  return paths;
}

/** Walls, floor 1 monster frames, ambience, steps, torch, floor 1 combat. */
export function floor1PlayableRelPaths(): string[] {
  return [...floor1TexturePaths(), ...floor1MonsterArtPaths(), ...audioGroupRelPaths('floor1')];
}

/** Fetch into the HTTP cache. Never throws; limited in-flight requests. */
export async function prefetchRelPaths(
  paths: readonly string[],
  limit = SPRITE_LOAD_CONCURRENCY
): Promise<void> {
  const base = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL : '/';
  await mapPool(paths, limit, async (rel) => {
    try {
      await prefetchUrl(`${base}${rel}`);
    } catch {
      // Background warm-up; world boot will retry.
    }
  });
}

export function prefetchFloor1Playable(limit = SPRITE_LOAD_CONCURRENCY): Promise<void> {
  return prefetchRelPaths(floor1PlayableRelPaths(), limit);
}
