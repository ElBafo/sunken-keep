export type GoalStatus = 'hidden' | 'active' | 'done' | 'failed';

export interface GoalDef {
  id: string;
  floor?: number | string;
  set_on?: string;
  done_on?: string;
  fail_on?: string;
  replaces?: string;
}

export interface TriggerDef {
  id: string;
  type: 'bark' | 'log' | 'note';
  once?: boolean;
}

/**
 * Every bark, log, and note with repeat:"once" in story/triggers_act1.json.
 * That file is a design leftover and must not be shipped in public/ (check:public).
 */
export const ONCE_TRIGGERS: TriggerDef[] = [
  { id: 'enter_floor1', type: 'log', once: true },
  { id: 'enter_floor2', type: 'log', once: true },
  { id: 'enter_floor3', type: 'log', once: true },
  { id: 'enter_floor4', type: 'log', once: true },
  { id: 'water_shallow', type: 'log', once: true },
  { id: 'water_deep', type: 'log', once: true },
  { id: 'pantry', type: 'bark', once: true },
  { id: 'enter_pantry', type: 'log', once: true },
  { id: 'guard_hall_enter', type: 'bark', once: true },
  { id: 'enter_guard_hall', type: 'log', once: true },
  { id: 'lampkeeper_hooks_heard', type: 'bark', once: true },
  { id: 'lampkeeper_enter', type: 'bark', once: true },
  { id: 'enter_lampkeeper', type: 'log', once: true },
  { id: 'first_true_dark', type: 'bark', once: true },
  { id: 'stairs_dead_lamp', type: 'bark', once: true },
  { id: 'first_singing', type: 'bark', once: true },
  { id: 'first_vent', type: 'bark', once: true },
  { id: 'vent_room', type: 'log', once: true },
  { id: 'singing_louder', type: 'bark', once: true },
  { id: 'lever_found', type: 'log', once: true },
  { id: 'glass_door', type: 'log', once: true },
  { id: 'barracks_enter', type: 'bark', once: true },
  { id: 'grate_voice', type: 'log', once: true },
  { id: 'mess_hall', type: 'log', once: true },
  { id: 'armoury', type: 'log', once: true },
  { id: 'tam_below', type: 'bark', once: true },
  { id: 'deep_enter', type: 'bark', once: true },
  { id: 'tam_tally', type: 'bark', once: true },
  { id: 'cell_found', type: 'log', once: true },
  { id: 'secret_found', type: 'log', once: true },
  { id: 'door_unlocked', type: 'log', once: true },
  { id: 'lampkeeper_note_read', type: 'bark', once: true },
  { id: 'lampkeeper_capped_lamp', type: 'bark', once: true },
  { id: 'read_journal', type: 'log', once: true },
  { id: 'journal_f2', type: 'log', once: true },
  { id: 'journal_page_1', type: 'note', once: true },
  { id: 'journal_page_2', type: 'note', once: true },
  { id: 'first_oil', type: 'bark', once: true },
  { id: 'first_torch_lit', type: 'bark', once: true },
  { id: 'first_torch_snuffed', type: 'bark', once: true },
  { id: 'oil_empty', type: 'bark', once: true },
  { id: 'lantern_gutter', type: 'log', once: true },
  { id: 'lantern_gutter#bark', type: 'bark', once: true },
  { id: 'torch_draws_monster', type: 'bark', once: true },
  { id: 'first_punch', type: 'bark', once: true },
  { id: 'first_sight_keep_rat', type: 'bark', once: true },
  { id: 'first_sight_rust_crab', type: 'bark', once: true },
  { id: 'first_sight_bog_leeches', type: 'bark', once: true },
  { id: 'first_sight_drowned_dwarf', type: 'bark', once: true },
  { id: 'tut_hand', type: 'bark', once: true },
  { id: 'tut_front', type: 'bark', once: true },
  { id: 'tut_sheet', type: 'bark', once: true },
  { id: 'swap_front', type: 'bark', once: true },
  { id: 'pickup_key', type: 'log', once: true },
  { id: 'desc_potion_red', type: 'log', once: true },
  { id: 'desc_potion_blue', type: 'log', once: true },
  { id: 'desc_potion_green', type: 'log', once: true },
  { id: 'tut_inventory', type: 'bark', once: true },
  { id: 'tut_potion', type: 'bark', once: true },
  { id: 'tam_left', type: 'bark', once: true },
  { id: 'frogcatcher_drowned', type: 'bark', once: true },
  { id: 'water_rising', type: 'log', once: true },
  { id: 'act1_end', type: 'log', once: true }
];

export const ONCE_TRIGGER_IDS = ONCE_TRIGGERS.map((t) => t.id);

/** Goal ids and event hooks from story/goals_act1.json (no player-facing text). */
const FALLBACK_GOALS: GoalDef[] = [
  { id: 'g_why', floor: 0, set_on: 'new game', done_on: 'f4_tide_wakes ends (start_escape)' },
  { id: 'g_tam', floor: 1, set_on: 'bark f1_start (F1 arrival)', done_on: 'replaced by g_tam_below' },
  { id: 'g_f1_down', floor: 1, set_on: 'log enter_floor1', done_on: 'log enter_floor2' },
  { id: 'g_f1_door', floor: 1, set_on: 'log door_locked (first bump)', done_on: 'log door_unlocked' },
  { id: 'g_f2_hobb', floor: 2, set_on: 'bark hobb_shout', done_on: 'flag frogcatcher_freed', fail_on: 'flag frogcatcher_drowned' },
  { id: 'g_f2_flood', floor: 2, set_on: 'log blocked_cistern (first bump)', done_on: 'log enter_cistern' },
  { id: 'g_tam_below', floor: 3, set_on: 'dialogue f3_grate_tam', done_on: 'log enter_floor4 (replaced by g_tam_cell)', replaces: 'g_tam' },
  { id: 'g_f3_armoury', floor: 3, set_on: 'log blocked_waterdoor (first bump)', done_on: 'puzzle floor3_offering.bowl_lit' },
  { id: 'g_tam_cell', floor: 4, set_on: 'log enter_floor4', done_on: 'dialogue f4_tam_cell ends (saved or left)', replaces: 'g_tam_below' },
  { id: 'g_f4_riddle', floor: 4, set_on: 'bark riddle_first_sight', done_on: 'puzzle floor4_riddle_door.solved' },
  { id: 'g_f4_cellgate', floor: 4, set_on: 'log blocked_cellgate or dialogue f4_captain starts', done_on: 'log gate_unlocked' },
  { id: 'g_escape', floor: 4, set_on: 'f4_tide_wakes ends (start_escape)', done_on: 'log act1_end' }
];

function mentions(field: string | undefined, eventId: string): boolean {
  if (!field) return false;
  const norm = field.toLowerCase();
  const id = eventId.toLowerCase();
  if (norm === id || (norm === 'new game' && id === 'new_game')) return true;
  return norm.split(/[^a-z0-9_]+/).includes(id);
}

export class StoryProgress {
  fired = new Set<string>();
  goals = new Map<string, GoalStatus>();
  private onceIds = new Set<string>(ONCE_TRIGGER_IDS);
  private goalDefs: GoalDef[] = FALLBACK_GOALS;

  async load(base: string) {
    this.onceIds = new Set(ONCE_TRIGGER_IDS);
    const goalsRaw = await fetchJson(`${base}story/goals_act1.json`);
    const goals = (goalsRaw as { goals?: GoalDef[] } | null)?.goals;
    this.goalDefs = Array.isArray(goals) && goals.length ? goals : FALLBACK_GOALS;
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
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
