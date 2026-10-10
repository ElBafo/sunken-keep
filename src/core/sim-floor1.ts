import { CombatEngine } from './combat';
import { parseRules } from './data';
import { Rng } from './rng';
import type { CombatEvent, HeroId, RulesData } from './types';
import { HERO_IDS } from './types';

export interface Floor1SimResult {
  seed: number;
  hpLost: number;
  remaining: Record<HeroId, number>;
  startHp: number;
  kills: string[];
  downed: HeroId[];
  wipe: boolean;
  levelUps: Array<{ hero: HeroId; level: number }>;
}

const FLOOR1_FIGHTS = ['bog_leeches', 'keep_rat', 'rust_crab', 'slime', 'keep_rat'] as const;

/** Front-row melee only, no shield/sand/potions. First tap at 1.5s. */
export function simulateFloor1(actions: unknown, monsters: unknown, seed: number): Floor1SimResult {
  const data: RulesData = parseRules(actions, monsters);
  const rng = new Rng(seed);
  const engine = new CombatEngine(data, rng);
  engine.setChaseEnabled(false);
  const startHp = HERO_IDS.reduce((s, id) => s + engine.heroes[id].hp, 0);
  const kills: string[] = [];
  const levelUps: Array<{ hero: HeroId; level: number }> = [];
  let wipe = false;
  let now = 0;

  for (const kind of FLOOR1_FIGHTS) {
    engine.clearMonsters();
    const m = engine.spawnMonster(kind, 2, 0);
    engine.setPartyPos(1, 0, 1);
    const fightStart = now;
    engine.beginFight(m, now);
    for (let step = 0; step < 800 && m.alive && !engine.gameOver; step++) {
      now = fightStart + step * 0.1;
      apply(engine.tick(now), kills, levelUps);
      if (now >= fightStart + 1.5) {
        if (!engine.heroes.brannoc.downed && now >= engine.heroes.brannoc.recovery.main) {
          apply(engine.useHand('brannoc', 'main', now), kills, levelUps);
        }
        if (!engine.heroes.mags.downed && now >= engine.heroes.mags.recovery.main) {
          apply(engine.useHand('mags', 'main', now), kills, levelUps);
        }
        if (!engine.heroes.ilsevar.downed && now >= engine.heroes.ilsevar.recovery.main) {
          apply(engine.useHand('ilsevar', 'main', now), kills, levelUps);
        }
      }
    }
    if (engine.gameOver) {
      wipe = true;
      break;
    }
    if (engine.fight) engine.endFight(now);
  }

  const remaining = {} as Record<HeroId, number>;
  let left = 0;
  const downed: HeroId[] = [];
  for (const id of HERO_IDS) {
    remaining[id] = engine.heroes[id].hp;
    left += engine.heroes[id].hp;
    if (engine.heroes[id].downed || engine.heroes[id].hp <= 0) downed.push(id);
  }
  return { seed, hpLost: startHp - left, remaining, startHp, kills, downed, wipe, levelUps };
}

function apply(
  events: CombatEvent[],
  kills: string[],
  levelUps: Array<{ hero: HeroId; level: number }>
) {
  for (const e of events) {
    if (e.type === 'monster_dead') kills.push(e.kind);
    if (e.type === 'level_up') levelUps.push({ hero: e.hero, level: e.level });
  }
}
