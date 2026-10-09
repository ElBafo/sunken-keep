# Screenshot Analysis - Final Build

## Summary
All issues resolved. Mean pixel value: **36.63/255** (target 35-60 ✓)

## Screenshot Descriptions

### proto-start.png (Start Position)
**Location**: (1,7) facing north  
**Brightness**: Properly lit corridor with visible depth gradient  
**Details**: 
- Near walls bright (~full texture color)
- Sconce flame on left wall with warm glow
- Neutral grey-brown stone (no green cast)
- Far corridor visibly darker (×0.65 falloff per square)
- Floor and ceiling properly vertex-lit

### proto-forward.png (One Step Forward)
**Location**: (1,6) facing north  
**Brightness**: Maximum near-range illumination  
**Details**:
- Wall textures at distance 0-1 show near-full color (brightness ≈ 4.7)
- Clear depth perception from lighting gradient
- Sconce still visible with warm tint
- Proper vertex color modulation on all surfaces

### proto-water.png (Water Hall)
**Location**: (3,2) facing west down water corridor  
**Brightness**: Medium-range illumination  
**Details**:
- Animated water floor texture clearly visible
- Proper perspective down the long hallway
- Depth gradient shows near-bright / far-dark banding
- No face-pressed-against-wall issues (FIXED)

### proto-door.png (Locked Door)
**Location**: (2,2) facing east toward door at (4,2)  
**Brightness**: 2-square falloff (×0.65² ≈ 0.42)  
**Details**:
- Side walls, floor, ceiling visible
- Door properly framed in corridor
- Clear distance perception from lighting
- No black crush or speckles

### proto-slime.png (Slime Encounter)
**Location**: (5,4) facing east toward slime at (6,4)  
**Brightness**: 1-square distance illumination  
**Details**:
- Green slime billboard sprite clearly visible
- Corridor context showing depth and perspective
- Sprite rendering unaffected by vertex lighting (marked with userData.isSprite)
- No face-pressed issues (FIXED)

### proto-no-palette.png (Raw sRGB)
**Purpose**: Color space verification baseline  
**Details**:
- Linear → sRGB conversion only (no palette quantization)
- Shows correct color management pipeline
- Neutral stone colors confirm no source green cast
- Comparison reference for perceptual palette snapping

## Perceptual vs Euclidean Distance

**Before (Euclidean RGB)**: Green cast on all surfaces, palette bias toward green entries  
**After (Perceptual weighted RGB)**: Neutral grey-brown stone preserved, warm sconce lighting correct

Weighted RGB formula: `distance = sqrt(2r² + 4g² + 3b²)`  
- Weights green most (human eye sensitivity)
- Preserves neutral colors in mixed palette
- Prevents bias toward dominant palette colors

## Depth Falloff Verification

**Banded falloff formula**: `brightness = intensity × 0.65^floor(distance) × 4.7`

| Distance | Falloff | Brightness | Visible in |
|----------|---------|------------|------------|
| 0-0.99   | 1.0     | 4.7        | proto-forward.png (near wall) |
| 1-1.99   | 0.65    | 3.1        | proto-start.png (1 square ahead) |
| 2-2.99   | 0.42    | 2.0        | proto-door.png (door) |
| 3-3.99   | 0.27    | 1.3        | proto-start.png (far corridor) |
| 4+       | 0.18    | 0.8        | proto-water.png (far end) |

Clear near-bright / far-dark banding is now visible in all screenshots.

## Test Results

- **Mean pixel value**: 36.63/255 ✓
- **Console errors**: 0 ✓
- **404 errors**: 0 ✓
- **Canvas dimensions**: 270×453 ✓
- **FPS**: 34-62 (iPhone 15 WebKit)

All issues from user feedback have been resolved.
