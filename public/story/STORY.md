# The Sunken Keep - Story Guide

## Premise
Stonevow Keep, a dwarven fortress, sank into the Mirefen swamp sixty years ago. It should be flooded to the
last stair. It isn't. Something holds the water back.

Thane Orrun Stonevow made a pact with the Hollow Tide, the hungry spirit of the swamp: the Tide holds the
water out of the keep, and in return it is fed FIRE. Floor by floor the dwarves gave up their forges, their
lamps, their hearths. The Heartforge at the bottom still burns, barely, and it drives the Great Engine: the
bellows and vents that keep the air moving. While the Heartforge lives, the keep breathes.

The Tide is nearly full. The Heartforge is nearly out. Something is about to give.


## Timeline (why it sank)
1. Sixty years ago the Mirefen swamp began swallowing the keep: the ground softened, floors sank into the mud.
2. Orrun made the pact to stop the flooding: the Tide holds the water off, the dwarves pay in fire.
3. The keep is fully buried but dry inside. Each payment cost a forge, hearth or lamp (dark upper floors). The last was Elda's hearth; she died of cold.
4. Now almost nothing is left to give. Only the Heartforge burns; when it dies, the pact ends and the water comes in.
- TWIST (approved by Loukas, revealed in F11 flashback): the Tide sank the keep on purpose to force the bargain. It wanted their fire all along.

## How the keep has air (and why lower floors are dry)
- The Tide holds the water back. You SEE this: "glass water" standing upright in doorways, the garden dome.
- The Great Engine's bellows push air through brass vents on every floor. Vents glow when the engine runs.
- The Heartforge powers the engine. The pact feeds the Tide fire to keep the water away from that one flame.
- Hint ladder: journal page 1 (F1) "The Tide asks only for fire." -> journal page 2 (F2) "My people keep breathing. Mostly." -> vent bark (F2) -> Hessa explains (F8)
  -> Great Engine seen (F9).
- If the Heartforge dies: the engine stops, the Tide is released, the keep floods. (Ending B escape.)
- We are going DOWN the whole game. The top is real daylight; the bottom is our own fire.

## The party
- **Brannoc Stonevow** - dwarf fighter. Front line. Distant heir of Orrun (he doesn't brag about it - yet).
  Gruff, proud, secretly sentimental. Arc: does he claim the throne/forge his ancestor failed?
- **Wren** - human cleric of the Ember. Carries the lantern. Warm, dry wit, the party's conscience.
  Arc: her flame is the last fire in the keep at the end. The Tide wants it most.
- **Ilsevar** - lizardfolk mage, swamp-born. Hears the Tide clearer than the others. Calm, unsettling.
  Arc: the Tide courts him as "one of its own". Listen, or refuse.
- **Mags Reedly** - halfling rogue, swamp-town local, came for loot and her lost brother Tam. Mouthy.
  Arc: find Tam. Save him or keep moving.

## Light as story
- Act 1: real daylight from above, mostly dead sconces. Light is fading.
- Act 2: borrowed light - the Tide's cold glow, garden phosphor, glass water. Beautiful and wrong.
- Act 3: the party's own fire. Wren relights forges (F8). The Tide dims her lantern in drip zones.
- Finale: Wren's lantern is the last flame below the swamp.

## Act structure (12 floors)
### Act 1 - The Drowned Halls (FREE)
1. Upper Halls - carvings tell the pact, Orrun's journal page 1. Daylight. Slime.
2. Lower Halls - last daylight, singing starts, first vent, Orrun's journal page 2.
3. Barracks - drowned dwarves on patrol. Stonevow crest. Tam heard through a grate.
4. Barracks Deep - Tam in a flooded cell, Captain Dural Ashmantle. CHOICE `saved_tam`.
   Cliffhanger: the Tide speaks. Water rises. Escape run. [PAYWALL]

### Act 2 - Borrowed Light
5. Homes - dwarf houses, Orrun's home, Elda's things. We learn the pact was made for love and fear.
6. Sunken Garden - Orrun's gift to Elda under a glass dome of held water. Calm, beautiful, few monsters,
   a place to breathe. Elda's grave. Where the pact was sealed.
7. Pact Grotto - the Tide's throat. It courts Ilsevar. CHOICE `ilsevar_listened`.
8. Cold Forges - Hessa, the lucid drowned smith. Wren relights the forges floor by floor.
   Cliffhanger: Hessa reveals Orrun is ALIVE, kept by the Tide, and the Heartforge is almost out.

### Act 3 - The Heartforge
9. Great Engine - bellows, vents, pistons. Seeing how the keep breathes. Hardest puzzles.
10. Thane's Vault - Orrun's crown and seal. CHOICE `brannoc_claimed`.
11. Drowned Throne - Orrun on his throne, half-man half-water. Playable flashback: the night the keep sank.
12. Heartforge - the last flame, the Tide, Orrun. FINAL CHOICE -> ending.

## Flags
| flag | set on | true means |
|---|---|---|
| `saved_tam` | F4 | Party paid the cost to free Tam. He returns in F8 and F12. |
| `ilsevar_listened` | F7 | Ilsevar let the Tide in. He gains a power; the Tide gains a voice in the party. |
| `brannoc_claimed` | F10 | Brannoc takes the Thane's seal. Drowned dwarves obey him in Act 3. |
| `hessa_trusted` | F8 (minor) | Party gave Hessa Wren's flame to light her anvil. She arms them for F12. |
| `elda_ring` | F6 (minor) | Party took Elda's ring from the grave. Orrun reacts in F11/F12. |
| `captain_spared` | F4 (minor) | Talked the captain down instead of killing him. He returns in F11. |
| `frogcatcher_freed` | F2 (minor) | Brannoc lifted the shelf off Hobb Rushwick. Hobb gives a red potion and wades back up. |
| `frogcatcher_drowned` | F2 (minor) | The RIGHT vent lever flooded the stores nook before Hobb was freed. He drowns; the party barks. |
| `met_hobb` | F2 (helper) | The party talked to Hobb. Picks which `frogcatcher_drowned` line plays. |

Flags carry over from the free act after purchase (they live in the save slot, not the build). Where each flag is set and read: story/triggers_act1.json.

## Endings (see endings.md)
- A. **Rekindled** - relight the Heartforge with Wren's flame, renegotiate. Keep breathes; Orrun rests.
- B. **Let It Drown** - let the forge die. Break the pact; escape up the air shafts as the keep floods.
- C. **The Offering** - give a party member to the Tide. Keep saved, at a price.
- Best (A+): `saved_tam` AND `brannoc_claimed` - Brannoc commands the drowned to tend the forge, Tam's
  swamp-sense guides them, nobody is given up. "The Keeper's Peace".
- Darkest (C-): `ilsevar_listened` - Ilsevar offers HIMSELF and becomes the new Tide. "The Hollow King".
