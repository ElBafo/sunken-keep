# Expected Assets for Artist Delivery

## Wall Rendering System

The game uses pre-rendered wall pieces at three distances for first-person perspective. All pieces should be drawn in cold green swamp tones with warm orange brazier accents.

### Front Wall Pieces
- **Near distance** (player is 1 square away):
  - Size: 160×140 pixels
  - Placement: Centered in viewport at y=30
  
- **Mid distance** (2 squares away):
  - Size: 120×100 pixels
  - Placement: Centered in viewport at y=50
  
- **Far distance** (3 squares away):
  - Size: 80×70 pixels
  - Placement: Centered in viewport at y=65

### Side Wall Pieces  
- **Near distance**: 40×140 pixels
- **Mid distance**: 30×100 pixels
- **Far distance**: 20×70 pixels

**File naming:**
- `wall_front_near.png`, `wall_front_mid.png`, `wall_front_far.png`
- `wall_left_near.png`, `wall_left_mid.png`, `wall_left_far.png`
- `wall_right_near.png`, `wall_right_mid.png`, `wall_right_far.png`

**Style guide:**
- Cold green swamp: #1a3830 (near), #152e28 (mid), #102420 (far)
- Stone texture with moss/water damage
- Occasional orange brazier glow (#ff8844) for accent
- Dwarven architectural details (columns, carved borders)

### Door Pieces
Same sizes as front walls, but showing:
- Locked door (red lock indicator area in center)
- Open door (showing corridor beyond)

**Files:**
- `door_locked_near.png`, `door_locked_mid.png`, `door_locked_far.png`
- `door_open_near.png`, `door_open_mid.png`, `door_open_far.png`

### Secret Wall Pieces
Same sizes as front walls, should look like normal walls but with subtle hints:
- Slightly different stone pattern
- Faint seam lines
- After discovered, slides aside to show opening

**Files:**
- `secret_closed_near.png`, `secret_closed_mid.png`, `secret_closed_far.png`
- `secret_open_near.png`, `secret_open_mid.png`, `secret_open_far.png`

## Monster Sprites and Animation

Each monster has **animated** sprites with multiple states and frames:

### Monster Types
- **Slime**: Amorphous blob with glowing eyes
- **Drowned dwarf**: Waterlogged, shambling, bearing a Stonevow crest
- **Tide spawn**: Aquatic aberration that sings

### Animation States and Frame Counts
Each monster needs these animation states at 3 distances (near/mid/far):

- **idle**: 4 frames (looping bob/breathing)
- **attack**: 3 frames (lunge/strike toward camera)
- **hurt**: 1 frame (recoil/flash)
- **death**: 4 frames (collapse/sink into water with ripples)

**Total frames per monster**: 12 frames × 3 distances = 36 frames per monster

### File Naming Convention
```
<monster>_<state>_<frame>_<distance>.png
```

Examples:
- `slime_idle_1_near.png` (first idle frame at near distance)
- `drowned_dwarf_attack_2_mid.png` (second attack frame at mid distance)
- `tide_spawn_death_4_far.png` (fourth/final death frame at far distance)

### Sprite Positioning
All monster sprites are **bottom-aligned** at y=100 (the floor line in the viewport):
- The bottom of the sprite should be the base/feet touching the dungeon floor
- Sprites are centered horizontally in the viewport
- Transparent backgrounds (PNG with alpha)

### Animation Playback
- **idle**: 4 FPS (slow, looping bob)
- **attack**: 12 FPS (fast lunge)
- **hurt**: Shown for 0.2s with flash effect
- **death**: 8 FPS (sink into water)

### Fallback
If animation frames are missing, the game will fall back to:
1. Static sprite `<monster>_<distance>.png` (which should be idle frame 1)
2. Code-based effects (bob, lunge, flash, fade) as a last resort

### Suggested Frame Content

**Idle frames** (4): Gentle breathing/bob cycle
- Frame 1: Neutral stance
- Frame 2: Slight up
- Frame 3: Peak
- Frame 4: Slight down (back to 1)

**Attack frames** (3): Quick lunge toward camera
- Frame 1: Wind-up/rear back
- Frame 2: Mid-lunge (peak)
- Frame 3: Follow-through/recovery

**Hurt frame** (1): Recoil pose with clear silhouette change

**Death frames** (4): Sink into the water
- Frame 1: Start collapse
- Frame 2: Halfway down with ripples starting
- Frame 3: Mostly submerged, more ripples
- Frame 4: Gone (small ripples remain)

## Additional Portrait Expressions

Current system uses health-state variants (healthy/wounded/near_death) for all four characters. 

### Optional Enhancement: Expression Overlays
If adding expression variants, each character would need:
- `{name}_{expression}_{healthstate}.png` (64×64)
- Expressions: neutral, smirk, wince, shocked

Current approach uses a single portrait per health state with animated mouth for talking. Expression overlays would be additive only.

## Deep Water Tiles

Floor tiles showing flooded corridors:
- `water_shallow.png` - ankle-deep water (64×64 floor tile view)
- `water_deep.png` - chest-deep water with ripples

## Item Sprites  

Small pickup items rendered at near/mid/far:
- Rusty key (current: simple placeholder)
- Treasure chest
- Potion bottles
- Ancient scrolls

**Sizes:** Same as monsters (near: 80×60, mid: 50×40, far: 30×25)

## Background/Environment Variants

Additional floor textures and ceiling details:
- Flooded stone floor (with reflections)
- Dry upper floor (less water damage)
- Ceiling variations (stalactites, collapsed sections)

## Status

### ✅ Complete
- All character health-state portraits (brannoc, wren, ilsevar, mags)
- All wall carving decals (start, door, secret)
- Hit flash overlays
- Intro cutscene art (6 shots, sprites, title)
- All audio (music, ambience, SFX)

### 🔲 Needed
- Wall rendering pieces (front/left/right at 3 distances)
- Door pieces (locked/open)
- Secret wall pieces (closed/open)
- Monster sprites (3 types × 3 distances)
- Deep water floor tiles
- Item pickup sprites

## Reference

See `public/art/preview/mock_screen_4x.png` for the intended layout and perspective.

Current placeholder walls are generated in code (green rectangles with simple detail) and can be seen in the built game.
