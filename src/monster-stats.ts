// Monster stats manager
import monsterDataRaw from './monsters.json';

export interface MonsterStats {
  floor: number;
  hp: number;
  damage: [number, number];
  armor?: number;
  latch?: {
    chance: number;
    drainPerTurn: number;
    turns: number;
    sound: string;
  };
}

// Filter out the _note field
const monsterData = monsterDataRaw as any;
const monsters: Record<string, MonsterStats> = {};
for (const [key, value] of Object.entries(monsterData)) {
  if (!key.startsWith('_')) {
    monsters[key] = value as MonsterStats;
  }
}

export function getMonsterStats(monsterType: string): MonsterStats | null {
  return monsters[monsterType] || null;
}

export function getMonsterDamage(monsterType: string): number {
  const stats = getMonsterStats(monsterType);
  if (!stats) return 5;
  const [min, max] = stats.damage;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getMonsterArmor(monsterType: string): number {
  const stats = getMonsterStats(monsterType);
  return stats?.armor || 0;
}

export function canLatch(monsterType: string): boolean {
  const stats = getMonsterStats(monsterType);
  if (!stats?.latch) return false;
  return Math.random() < stats.latch.chance;
}

export function getLatchInfo(monsterType: string) {
  const stats = getMonsterStats(monsterType);
  return stats?.latch || null;
}
