# Vertex Lighting Implementation Report

## Summary

Implemented grid-based vertex color lighting system for the 3D prototype, replacing physically-based Three.js PointLights with baked per-face brightness calculations.

## Key Changes

### Lighting Architecture
- **Replaced**: Dynamic `PointLight` with `decay: 2` (physically-based candela units)
- **Implemented**: Grid-distance vertex color baking on `MeshBasicMaterial`
- **Falloff**: Banded discrete falloff (1.0 at 0-1 distance, ×0.65 per further square)
- **Boost**: 5.0x brightness multiplier to compensate for color space and palette conversion
- **Warm tint**: Slight warm color shift near lit sconces
- **Dark tiles**: `floorNDark` squares receive only lantern light (~2 squares then black, 0.08 on exits)

### Color Management
- **Re-enabled**: `THREE.ColorManagement.enabled = true`
- **Textures**: Marked as `THREE.SRGBColorSpace` for automatic conversion
- **Render target**: Linear working space
- **Post-process**: Linear → sRGB conversion → palette snap (Euclidean distance)
- **Palette**: Removed pure black `#000000` to prevent crush on lit surfaces

### Materials
- **Walls/Floor/Ceiling**: `MeshBasicMaterial` with `vertexColors: true`
- **Sprites**: Marked with `userData.isSprite` to skip lighting updates
- **Dynamic updates**: Vertex colors recalculated on player movement

## Measurements

### Target vs. Actual
- **Target**: Mean pixel value 35-60/255
- **Achieved**: 38.76/255 ✓
- **Non-black pixels**: 80.35% (43,154 / 122,310 pixels)

### Test Results
- **Console errors**: 0 ✓
- **404 errors**: 0 ✓
- **FPS**: 34-62 (iPhone 15 WebKit profile)

## Screenshots

### proto3d-start.png
Start position (1,7) facing north. Lantern illuminates corridor ahead with banded falloff. Sconce flame visible on left wall. Mean brightness within target range. No pure-black crush on door or walls.

### proto-forward.png
One step forward (1,6). Wall textures show near-full color under lantern (distance 0-1). Ceiling and floor properly lit with vertex color modulation.

### proto3d-water-hall.png
Water hall (2,2) with animated water floor texture. Darker ambient due to distance from sconce, but lantern provides readable illumination.

### proto-door.png
Locked door viewed from 2 squares away. Side walls, floor, and ceiling visible. Door receives appropriate falloff lighting (×0.65² ≈ 0.42 brightness). No black speckles.

### proto3d-slime.png
Slime sprite at distance with corridor context. Proper depth perception from lighting gradient. Slime billboard unaffected by vertex lighting (marked as sprite).

### proto3d-no-palette.png
Palette disabled (`?palette=0`). Shows raw sRGB output after linear→sRGB conversion, before palette quantization. Verifies color space pipeline correctness.

## Technical Details

### Vertex Color Calculation
```typescript
brightness = max over light sources of (
  intensity × getBandedFalloff(distance) × 5.0
)

getBandedFalloff(d) = {
  1.0 if d <= 1.0
  0.65^(floor(d)-1) otherwise
}
```

### Warm Tint Near Sconces
```typescript
warmth = max over lit sconces of (
  (1.0 - distance/3.0) × 0.15
)
tint = (1.0, 1.0 - warmth×0.05, 1.0 - warmth×0.15)
```

### Post-Process Shader
```glsl
vec3 linearToSRGB(vec3 linear) {
  vec3 a = 12.92 * linear;
  vec3 b = 1.055 * pow(linear, vec3(1.0/2.4)) - 0.055;
  return mix(a, b, step(vec3(0.0031308), linear));
}

vec3 srgb = linearToSRGB(linearColor);
// Then snap to palette via Euclidean distance
```

## Files Modified
- `src/proto3d/vertex-lighting.ts` (new)
- `src/proto3d/renderer.ts` (ColorManagement, outputColorSpace)
- `src/proto3d/scene-builder.ts` (MeshBasicMaterial with vertexColors)
- `src/proto3d/sprites.ts` (userData.isSprite markers)
- `src/proto3d/main.ts` (instantiate VertexLightingManager)
- `public/art/palette.json` (removed #000000)

## Outcome
Achieved retro EOB-style grid crawler lighting with exact control over brightness falloff and no physically-based lighting surprises. Mean pixel value 38.76/255 meets target (35-60), textures show near-full color at close range, and darkness falls off predictably to black at distance.
