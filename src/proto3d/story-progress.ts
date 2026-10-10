export type GoalStatus = 'hidden' | 'active' | 'done' | 'failed';

export interface GoalDef {
  id: string;
  floor?: number;
  set_on?: string;
  done_on?: string;
  fail_on?: string;
  replaces?: string;
}

export interface TriggerDef {
  id: string;
  type?: string;
  once?: boolean;
}

/** Floor-1 once keys used when story/triggers_act1.json is not shipped. */
const FALLBACK_ONCE: TriggerDef[] = [
  { id: 'enter_floor1', type: 'log', once: true },
  { id: 'water_shallow', type: 'log', once: true },
  { id: 'water_deep', type: 'log', once: true },
  { id: 'door_locked', type: 'log', once: true },
  { id: 'door_unlocked', type: 'log', once: true },
  { id: 'enter_pantry', type: 'log', once: true },
  { id: 'carving_start', type: 'log', once: true },
  { id: 'carving_door', type: 'log', once: true },
  { id: 'carving_secret', type: 'log', once: true },
  { id: 'guard_hall_enter', type: 'bark', once: true },
  { id: 'lampkeeper_hooks_heard', type: 'bark', once: true },
  { id: 'lampkeeper_enter', type: 'bark', once: true },
  { id: 'lampkeeper_note_read', type: 'bark', once: true },
  { id: 'lampkeeper_capped_lamp', type: 'bark', once: true },
  { id: 'f1_start', type: 'bark', once: true },
  { id: 'note_lampkeeper', type: 'note', once: true },
  { id: 'lampkeeper_note', type: 'note', once: true }
];

function mentions(field: string | undefined, eventId: string): boolean {
  if (!field) return false;
  const norm = field.toLowerCase();
  const id = eventId.toLowerCase();
  if (norm === id || norm === 'new game' && id === 'new_game') return true;
  return norm.split(/[^a-z0-9_]+/).includes(id);
}

function parseTriggers(raw: unknown): TriggerDef[] {
  if (!raw || typeof raw !== 'object') return [];
  const rec = raw as Record<string, unknown>;
  const list = Array.isArray(raw) ? raw : Array.isArray(rec.triggers) ? rec.triggers : null;
  if (!list) return [];
  const out: TriggerDef[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : typeof row.key === 'string' ? row.key : '';
    if (!id) continue;
    out.push({
      id,
      type: typeof row.type === 'string' ? row.type : typeof row.kind === 'string' ? row.kind : undefined,
      once: row.once === true
    });
  }
  return out;
}

export class StoryProgress {
  fired = new Set<string>();
  goals = new Map<string, GoalStatus>();
  private onceIds = new Set<string>();
  private goalDefs: GoalDef[] = [];

  async load(base: string) {
    const [triggersRaw, goalsRaw] = await Promise.all([
      fetchJson(`${base}story/triggers_act1.json`),
      fetchJson(`${base}story/goals_act1.json`)
    ]);
    const parsed = parseTriggers(triggersRaw);
    const defs = parsed.length ? parsed : FALLBACK_ONCE;
    this.onceIds = new Set(defs.filter((t) => t.once).map((t) => t.id));
    const goals = (goalsRaw as { goals?: GoalDef[] } | null)?.goals;
    this.goalDefs = Array.isArray(goals) ? goals : [];
    if (!this.goals.size) this.resetGoals();
  }

  isOnce(id: string): boolean {
    return this.onceIds.has(id);
  }

  hasFired(id: string): boolean {
    return this.fired.has(id);
  }

  /** Play the event unless it is a spent `once` trigger. Always records goal progress. */
  fire(id: string): boolean {
    if (this.onceIds.has(id) && this.fired.has(id)) return false;
    if (this.onceIds.has(id)) this.fired.add(id);
    this.applyGoals(id);
    return true;
  }

  markFired(id: string) {
    this.fired.add(id);
    this.applyGoals(id);
  }

  applyGoals(eventId: string) {
    for (const g of this.goalDefs) {
      const cur = this.goals.get(g.id) ?? 'hidden';
      if (mentions(g.set_on, eventId) && cur === 'hidden') {
        this.goals.set(g.id, 'active');
        if (g.replaces) this.goals.set(g.replaces, 'hidden');
      }
      if (mentions(g.done_on, eventId) && (cur === 'active' || cur === 'hidden')) {
        this.goals.set(g.id, 'done');
      }
      if (mentions(g.fail_on, eventId)) this.goals.set(g.id, 'failed');
    }
  }

  startNewGame() {
    this.fired.clear();
    this.resetGoals();
    this.fire('new_game');
  }

  resetGoals() {
    this.goals.clear();
    for (const g of this.goalDefs) this.goals.set(g.id, 'hidden');
  }

  serialize(): { fired: string[]; goals: Record<string, GoalStatus> } {
    return { fired: [...this.fired], goals: Object.fromEntries(this.goals) };
  }

  restore(data?: { fired?: string[]; goals?: Record<string, GoalStatus> } | null) {
    this.fired = new Set(data?.fired ?? []);
    this.resetGoals();
    if (data?.goals) {
      for (const [id, status] of Object.entries(data.goals)) {
        if (status === 'hidden' || status === 'active' || status === 'done' || status === 'failed') {
          this.goals.set(id, status);
        }
      }
    }
  }

  snapshotGoals(): Record<string, GoalStatus> {
    return Object.fromEntries(this.goals);
  }
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
