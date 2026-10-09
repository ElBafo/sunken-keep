# 3D Renderer Prototype - Testing Summary

## Build Verification

### Assets Committed ✓
All referenced assets are committed to the repository:
- **Textures**: 8 files in `public/art/tex3d/` (64x64 PNG)
  - wall_plain.png, wall_pilaster.png, wall_knot.png, door_locked.png
  - floor_stone.png, floor_water.png, ceiling.png
- **Sprites**: Sconce (3 frames), Slime idle (4 frames), Key item
- **Audio**: 10 MP3 files (torch loop, drips, ambient)
- **Palette**: palette.json (32-48 editable colors)

### HTTP Response Verification ✓
All critical assets return HTTP 200:
```
art/palette.json: 200
art/tex3d/wall_plain.png: 200
art/tex3d/ceiling.png: 200
art/dungeon/slime_idle_1_near.png: 200
audio/amb_flooded_halls_loop.mp3: 200
audio/sfx_torch_loop.mp3: 200
```

### Zero 404 Errors ✓
Manual verification with vite preview confirmed no missing assets.

## Implementation Details

### Rendering Pipeline
1. **Low-res target**: 270px width (aspect ratio matches device)
2. **First pass**: Render 3D scene with Three.js to low-res WebGLRenderTarget
3. **Second pass**: Upscale with nearest-neighbor + color quantization shader
4. **Result**: Pixelated, palette-quantized output

### Color Quantization
- Fragment shader finds nearest palette color using distance calculation
- Palette loaded from `art/palette.json` (32-48 colors)
- Toggle with `?palette=0` for comparison
- Creates visible banding in lighting gradients

### Performance Characteristics
- Target: 30+ FPS on mobile (iPhone 15 descriptor)
- Low-res rendering reduces pixel shader cost
- Billboard sprites (not full 3D models)
- Baked lighting with simple point lights
- No shadows or advanced effects

### Controls
- **Swipe**: Up/down = forward/back, Left/right = turn
- **On-screen arrows**: Four-button grid layout
- **Keyboard**: WASD or arrow keys

## Preview URLs

When deployed to GitHub Pages:
- **With palette** (default): `https://elbafo.github.io/sunken-keep/proto3d.html`
- **Without palette**: `https://elbafo.github.io/sunken-keep/proto3d.html?palette=0`

## Key Locations to Test

1. **Start position** (1, 7): First carving, lit sconce nearby
2. **West corridor** (2, 5): Key pickup location
3. **Water hall** (2, 2): Deep water with shimmer, drip sounds
4. **Locked door** (4, 2): Feature texture, lit sconce
5. **Slime room** (7, 2): Animated monster billboard

## Technical Notes

### Grid Movement
- Player position in discrete grid cells
- 150-200ms tweened transitions
- Rotation interpolation handles wrap-around
- Collision detection against walls and locked doors

### Lighting
- Ambient: dark green-black (0x0a1e14)
- Fog: exponential falloff (density 0.15)
- Torch lights: warm orange (0xff8844), flickering
- Quantized intensity (8 steps) for banded look

### Audio
- THREE.AudioListener on camera
- Positional audio for sconces and drips
- Ambient non-positional background
- AudioContext unlocked on tap-to-start

### Mobile Optimization
- 270px rendering width (not device resolution)
- Nearest texture filtering
- No mipmaps
- Billboard sprites instead of 3D models
- Minimal geometry (walls are planes)

## Comparison Points

### 3D Renderer
- **Pros**: Dynamic camera, true 3D movement, scalable to multiple floors
- **Cons**: Requires WebGL, more complex, larger bundle (549KB + three.js)

### 2D Pre-drawn
- **Pros**: Simpler, smaller bundle, pixel-perfect art control
- **Cons**: Every view angle must be pre-rendered

## Files Modified
- `vite.config.ts`: Added proto3d entry point
- `package.json`: Added three.js dependencies

## Files Added
- `proto3d.html`: Entry point
- `src/proto3d/*.ts`: 10 TypeScript modules
- `public/art/tex3d/*.png`: 8 textures
- `public/art/dungeon/sconce_lit_*.png`: 3 sprite frames
- `public/audio/*.mp3`: 10 audio files
- `public/art/palette.json`: Color palette

Total: 36 files added/modified, 1338 insertions
