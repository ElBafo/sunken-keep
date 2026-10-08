# The Sunken Keep

A mobile-first web-based dungeon crawler in the spirit of Eye of the Beholder and Lands of Lore.

## Development

```bash
npm install
npm run dev    # Local development server
npm run build  # Production build
```

## Deployment

The game automatically deploys to GitHub Pages on every push to `main`.

**Required GitHub repository settings:**
1. Go to Settings → Pages
2. Under "Build and deployment"
3. Set **Source** to **GitHub Actions**

The live game will be available at: `https://elbafo.github.io/sunken-keep/`

## Game Controls

### Touch (Mobile)
- **Swipe up/down**: Move forward/backward
- **Swipe left/right**: Strafe
- **Short horizontal swipe in top area**: Turn
- **Tap**: Interact with objects, attack in combat

### Keyboard (Desktop)
- **Arrow keys / WASD**: Move/strafe
- **Q/E**: Turn left/right
- **Space**: Interact

## Tech Stack

- **Vite** + **TypeScript**
- Plain **Canvas 2D** rendering
- Portrait layout: 270×480 base resolution, integer-scaled

## Assets Still Needed

### Portraits
The game uses health-state portrait system. Each character needs:
- `{name}_healthy.png` (64×64)
- `{name}_wounded.png` (64×64)  
- `{name}_near_death.png` (64×64)

**Characters**: brannoc, wren, ilsevar, mags

**Current status**: ✅ All health-state portraits provided

### Wall Art
Pre-rendered wall pieces for 3 distances (placeholder generated in code):
- Front walls: 160×140 (near), 120×100 (mid), 80×70 (far)
- Side walls: 40×140 (near), 30×100 (mid), 20×70 (far)

**Style**: Cold green swamp tones (#1a3830, #152e28, #102420) with warm orange brazier accents (#ff8844)

### Decals
Tappable wall carvings (rune plates):
- ✅ `carving_start_near.png`, `carving_start_mid.png`, `carving_start_far.png`
- ✅ `carving_door_near.png`, `carving_door_mid.png`, `carving_door_far.png`
- ✅ `carving_secret_near.png`, `carving_secret_mid.png`, `carving_secret_far.png`

**Current status**: ✅ All carvings provided

### Intro Cutscene
Pixel-art intro sequence (Eye of the Beholder style):
- ✅ Six 854×480 shots at 2× pixel size
- ✅ Animated eyes sprite (3 frames: closed, half, open)
- ✅ Boat sprite with path
- ✅ Title card
- ✅ 37s intro score with cue points
- ✅ Sound effects (step, door, key, hit, hurt, secret, bark, tide sigh)
- ✅ 24s ambient swamp loop

**Current status**: ✅ All intro assets and audio provided

### Audio
All audio files provided in OGG + MP3:
- ✅ SFX: step, bump, door, key, hit, hurt, secret_wall, bark, tide_sigh
- ✅ Music: 37s intro score, 24s seamless swamp ambience

## File Structure

```
art/
  intro/           # Intro cutscene shots and sprites
  portraits/       # Character portraits (health states)
  decals/          # Tappable wall carvings
  overlays/        # Hit flash effects
  ui/              # Speech bubble 9-slice
  font/            # 5×7 bitmap font

audio/             # All sound effects and music (OGG + MP3)

public/            # Static assets served by Vite
src/               # TypeScript game code
```

## Credits

- **Story & Writing**: Storie
- **Art**: Pixelartie (portraits, intro, decals)
- **Audio**: [TBD]
- **Code**: Built with Cursor Cloud Agent
