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

/** Ambience, steps, torch, and floor 1 combat — enough to leave Loading. */
export const FLOOR1_PLAY_AUDIO: ReadonlyArray<readonly [string, string]> = [
  ['ambience', 'audio/amb_flooded_halls_loop.mp3'],
  ['step', 'audio/sfx_step.mp3'],
  ['step_1', 'audio/sfx_step_1.mp3'],
  ['step_2', 'audio/sfx_step_2.mp3'],
  ['step_3', 'audio/sfx_step_3.mp3'],
  ['step_4', 'audio/sfx_step_4.mp3'],
  ['step_water_shallow', 'audio/sfx_step_water_shallow.mp3'],
  ['step_water_shallow_1', 'audio/sfx_step_water_shallow_1.mp3'],
  ['step_water_shallow_2', 'audio/sfx_step_water_shallow_2.mp3'],
  ['step_water_shallow_3', 'audio/sfx_step_water_shallow_3.mp3'],
  ['step_water_shallow_4', 'audio/sfx_step_water_shallow_4.mp3'],
  ['step_water_deep', 'audio/sfx_step_water_deep.mp3'],
  ['step_water_deep_1', 'audio/sfx_step_water_deep_1.mp3'],
  ['step_water_deep_2', 'audio/sfx_step_water_deep_2.mp3'],
  ['step_water_deep_3', 'audio/sfx_step_water_deep_3.mp3'],
  ['step_water_deep_4', 'audio/sfx_step_water_deep_4.mp3'],
  ['torch', 'audio/sfx_torch_loop.mp3'],
  ['torch_ignite', 'audio/sfx_torch_ignite.mp3'],
  ['torch_extinguish', 'audio/sfx_torch_extinguish.mp3'],
  ['hit', 'audio/sfx_hit.mp3'],
  ['hit_2', 'audio/sfx_hit_2.mp3'],
  ['hit_3', 'audio/sfx_hit_3.mp3'],
  ['act_miss', 'audio/sfx_act_miss.mp3'],
  ['act_miss_2', 'audio/sfx_act_miss_2.mp3'],
  ['act_miss_3', 'audio/sfx_act_miss_3.mp3'],
  ['hurt', 'audio/sfx_hurt.mp3'],
  ['hurt_2', 'audio/sfx_hurt_2.mp3'],
  ['hurt_3', 'audio/sfx_hurt_3.mp3'],
  ['hit_crit', 'audio/sfx_hit_crit.mp3'],
  ['hit_crit_2', 'audio/sfx_hit_crit_2.mp3'],
  ['hit_crit_3', 'audio/sfx_hit_crit_3.mp3'],
  ['keep_rat_alert', 'audio/sfx_keep_rat_alert.mp3'],
  ['keep_rat_attack', 'audio/sfx_keep_rat_attack.mp3'],
  ['keep_rat_hurt', 'audio/sfx_keep_rat_hurt.mp3'],
  ['keep_rat_death', 'audio/sfx_keep_rat_death.mp3'],
  ['rust_crab_alert', 'audio/sfx_rust_crab_alert.mp3'],
  ['rust_crab_attack', 'audio/sfx_rust_crab_attack.mp3'],
  ['rust_crab_hurt', 'audio/sfx_rust_crab_hurt.mp3'],
  ['rust_crab_death', 'audio/sfx_rust_crab_death.mp3'],
  ['rust_crab_windup', 'audio/sfx_rust_crab_windup.mp3'],
  ['slime_alert', 'audio/sfx_slime_alert.mp3'],
  ['slime_attack', 'audio/sfx_slime_attack.mp3'],
  ['slime_hurt', 'audio/sfx_slime_hurt.mp3'],
  ['slime_death', 'audio/sfx_slime_death.mp3'],
  ['bog_leeches_alert', 'audio/sfx_bog_leeches_alert.mp3'],
  ['bog_leeches_attack', 'audio/sfx_bog_leeches_attack.mp3'],
  ['bog_leeches_hurt', 'audio/sfx_bog_leeches_hurt.mp3'],
  ['bog_leeches_death', 'audio/sfx_bog_leeches_death.mp3']
];

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
  return [...floor1TexturePaths(), ...floor1MonsterArtPaths(), ...FLOOR1_PLAY_AUDIO.map(([, path]) => path)];
}

/** Fetch into the HTTP cache. Never throws; limited in-flight requests. */
export async function prefetchRelPaths(
  paths: readonly string[],
  limit = SPRITE_LOAD_CONCURRENCY
): Promise<void> {
  const base = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL : '/';
  await mapPool(paths, limit, async (rel) => {
    try {
      await fetch(`${base}${rel}`);
    } catch {
      // Background warm-up; world boot will retry.
    }
  });
}

export function prefetchFloor1Playable(limit = SPRITE_LOAD_CONCURRENCY): Promise<void> {
  return prefetchRelPaths(floor1PlayableRelPaths(), limit);
}
