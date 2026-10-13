// New optional tile fields used by floors 2-4 (Levie). Merge into Tile in src/party.ts.
// Old fields (wall, door, secret, carving, item, chest, monster...) are unchanged.
export interface Act1TileExtras {
  stairs?: 'up' | 'down';       // matches src/types.ts on the overnight-build branch
  dialogue?: string;           // id in story/dialogue.json, fires once when you step on the tile
  then?: string;               // dialogue that fires right after the first one (f4_tam_cell -> f4_tide_wakes)
  bark?: string;               // id in barks.json (puzzle barks: puzzles_act1.json), once per save
  barkIf?: { flag: string; value: boolean; bark: string }[]; // first match plays (escape lines)
  log?: string;                // log.json key, fires once on first step
  bumpLog?: string;            // log.json key when you bump the blocked tile
  openLog?: string;            // log.json key when it opens
  gate?: { opensWith: string }; // door that opens with an item (captain_key)
  chestItems?: string[];       // item ids inside a chest, given in order when opened
  readNote?: string;           // story note id (e.g. note_lampkeeper), tap the prop to read
  npc?: string;                // 'captain' | 'tam' (sprite on the tile)
  prop?: 'table' | 'bunk' | 'weapon_rack' | 'statue'; // blocks movement, drawn as furniture
  glassWater?: boolean;        // wall you can see through: standing water in a doorway
  lever?: { face: 'N'|'E'|'S'|'W'; opens: { x: number; y: number } }; // wall lever, tap to open a secret
  openedBy?: 'lever';          // secret that only the lever opens
  grate?: { face: 'N'|'E'|'S'|'W' };
  vent?: { face: 'N'|'E'|'S'|'W' };    // glowing brass vent, bark 'first_vent' on floor 2
  bars?: { face: 'N'|'E'|'S'|'W' };    // cell bars
  gateOpensOn?: string;        // stays closed until this event/flag ('f4_captain_done', 'start_escape')
  patrol?: { x: number; y: number }[]; // monster walks between these ends
  checkpoint?: boolean;        // escape-run checkpoint (autosave)
  daylight?: boolean;          // light shaft from above
  journalPage?: number;
  actEnd?: number;             // stairs that end the act (paywall after act 1)
}
