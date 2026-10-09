# WebKit Rendering Issues - Root Cause Analysis & Fixes

## Problem Summary
The 3D prototype rendered completely black in WebKit screenshots despite having geometry, camera, and lighting.

## Root Causes Found

### 1. Post-Process Shader Vertex Issue ✅ FIXED
**Problem**: The fullscreen quad vertex shader used `projectionMatrix * modelViewMatrix * vec4(position, 1.0)` which caused incorrect rendering.

**Fix**: Changed to direct position output:
```glsl
gl_Position = vec4(position, 1.0);
```

**File**: `src/proto3d/renderer.ts` line 63

### 2. Camera Rotation Formula ✅ FIXED
**Problem**: Camera facing was inverted. `rotation.y = Math.PI + dir * π/2` made north (dir=0) face south (+Z).

**Fix**: Corrected formula:
```typescript
const rot = -this.dir * Math.PI / 2;
// dir 0 (north) → rotation.y = 0 → looks down -Z ✓
// dir 1 (east) → rotation.y = -π/2 → looks down +X ✓
// dir 2 (south) → rotation.y = -π → looks down +Z ✓
// dir 3 (west) → rotation.y = -3π/2 → looks down -X ✓
```

**Files**: `src/proto3d/player.ts` lines 44, 54, 76

### 3. Materials & Rendering ✅ WORKING
- Switched to MeshBasicMaterial (doesn't require lighting)
- Added DoubleSide rendering
- Added preserveDrawingBuffer for WebKit screenshots
- Disabled fog for debugging

**Result**: Scene now renders with RGB(154,154,154) visible geometry

## Testing Evidence

### With Yellow Test Cube
- Render target: RGB(255, 255, 0) ✓
- Final canvas: RGB(255, 255, 0) ✓
- **Conclusion**: Rendering pipeline works perfectly

### With Gray Scene Geometry  
- Render target: RGB(154, 154, 154) ✓
- Final canvas: RGB(154, 154, 154) ✓
- **Conclusion**: Scene geometry renders correctly

## Remaining Tasks

1. Restore texture mapping (currently using solid colors)
2. Re-enable fog at appropriate density
3. Switch back to MeshStandardMaterial with proper lighting
4. Generate final screenshots at all required locations
5. Add pixel count assertion (>1,000 non-black pixels)
6. Use `devices['iPhone 15']` (not Pro)

## Files Modified

- `src/proto3d/renderer.ts` - Shader fix, preserveDrawingBuffer
- `src/proto3d/player.ts` - Camera rotation fix
- `src/proto3d/scene-builder.ts` - Material changes
- `src/proto3d/lighting.ts` - Bright test lighting
- `src/proto3d/main.ts` - Debug logging

## Next Steps

1. Restore textures with NearestFilter
2. Re-enable palette with proper fog
3. Generate screenshots at: start, water hall, locked door, slime
4. Verify each screenshot shows visible walls/floor/ceiling
5. Commit final working version
