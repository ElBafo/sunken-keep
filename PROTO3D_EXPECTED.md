# Expected Behavior - 3D Renderer Prototype

## Loading Sequence

1. **Initial load**: Black screen with "TAP TO START" text
2. **Tap**: Starts game, unlocks AudioContext
3. **First frame**: Player at grid position (1, 7) facing north
4. **Visible elements**:
   - Stone floor and ceiling
   - Carved walls ahead
   - Lit sconce on left wall (animated, 3 frames)
   - FPS counter top-left (green text)
   - Four arrow buttons bottom-center

## Visual Characteristics

### Pixel Art Style
- **Resolution**: 270 pixels wide, upscaled to viewport
- **Hard pixels**: No blur, crisp edges
- **Color quantization**: Visible color banding in light gradients
- **Palette**: 32-48 step palette, extracted from art
- **Comparison**: `?palette=0` disables quantization

### Lighting
- **Ambient**: Very dark green-black
- **Fog**: Dense, exponential falloff
- **Torches**: Warm orange, flicker in 8 intensity steps (banded)
- **Shadows**: None (performance)

## Audio

### Positional
- **Torch sconces**: Crackling loop at lit sconces
  - Louder when close, quieter when far
  - Stereo panning based on position
- **Water drips**: At deep water location (2, 2)
  - Periodic drip sounds

### Ambient
- **Flooded halls**: Non-positional background ambience
- **Volume**: Low, atmospheric

## Movement

### Controls
- **Swipe up**: Move forward one square (200ms tween)
- **Swipe down**: Move backward one square
- **Swipe left**: Turn left 90° (200ms tween)
- **Swipe right**: Turn right 90°
- **Buttons**: Same as swipes
- **Keyboard**: WASD or arrows

### Collision
- Cannot move through walls
- Cannot move through locked door (4, 2)
- Water is walkable (just visual)

## Test Path

Starting at (1, 7) facing north:

1. **Forward** → (1, 6): See first carving on north wall
2. **Left** → facing west
3. **Forward** × 3 → (1, 3): Near lit sconce, hear torch crackle
4. **Forward** → (1, 2): In water, see shimmer
5. **Right** → facing north
6. **Forward** → (1, 1): Shallow water
7. **Right** → facing east
8. **Forward** × 6 → (7, 1): East side
9. **Left** → facing north
10. **Forward** → (7, 0): Wall (blocked)
11. **Turn around, go south**
12. **Navigate to (7, 2)**: See slime (4-frame idle animation)
13. **Navigate to (2, 5)**: See key item (static sprite)
14. **Navigate to (4, 2)**: Locked door, cannot pass, lit sconce nearby

## Sprites

### Sconce (lit)
- **Frames**: 3 (cycling ~150ms)
- **Position**: On wall faces, floating 1.2m high
- **Behavior**: Always faces camera (billboard)

### Slime
- **Frames**: 4 idle animation (~200ms per frame)
- **Position**: Grid (7, 2), floor-anchored at 0.75m
- **Behavior**: Always faces camera

### Key
- **Frames**: 1 (static)
- **Position**: Grid (2, 5), floor at 0.4m
- **Behavior**: Always faces camera

## Performance

### Target
- **30+ FPS** on iPhone 15 Pro (WebKit)
- Actual: Not measured (WebKit dependencies unavailable)

### Optimizations
- Low-res rendering (270px)
- Nearest filtering (no interpolation)
- No mipmaps
- Simple geometry (planes)
- Billboard sprites (not 3D models)
- No shadows

## Browser Compatibility

### iOS Safari
- Full-screen portrait mode
- Safe area insets respected
- AudioContext requires user gesture (tap-to-start)
- MP3 audio format

### Desktop
- Also works, but designed for mobile
- Keyboard controls available

## Known Limitations

- No touch sconces (just visual)
- No interaction with items/monsters
- No doors opening
- No UI beyond FPS counter and controls
- Single floor only
- Simple lighting (no shadows, no advanced effects)

## Comparison Toggle

### With Palette (default)
- Visible color banding
- ~32-48 distinct colors
- Retro aesthetic
- Light falloff in steps

### Without Palette (?palette=0)
- Smooth gradients
- Full color range
- Modern look
- Smooth light falloff

## Expected Console Output

```
(Load textures and palette)
✓ No errors
✓ No 404s
```

FPS counter updates every second.
