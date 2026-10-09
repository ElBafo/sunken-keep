# WebKit Rendering - Status Report

## CORE ISSUE FIXED ✓

The prototype now renders **visible geometry** in WebKit screenshots.

### What Was Wrong

**Problem 1: Post-Process Shader**  
The fullscreen quad vertex shader incorrectly transformed positions through projection matrices, causing the render target texture to not display on the final canvas.

**Fix**: Direct position output
```glsl
// Before: gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
// After:  gl_Position = vec4(position, 1.0);
```

**Problem 2: Camera Facing**  
Camera rotation formula was backwards, causing north (dir=0) to face south.

**Fix**: Corrected rotation
```typescript
// Before: rotation.y = Math.PI + dir * Math.PI/2
// After:  rotation.y = -dir * Math.PI / 2
```

### Verification

**Test with solid colors**:
- Yellow cube: RGB(255, 255, 0) ✓
- Gray floor: RGB(154, 154, 154) ✓
- Scene renders correctly

## Current State

**Working**:
- ✅ Scene geometry renders
- ✅ Camera position/rotation correct
- ✅ 126 meshes in scene
- ✅ Shader pipeline functional
- ✅ WebKit screenshot capture
- ✅ Canvas at 270px wide
- ✅ preserveDrawingBuffer enabled

**In Progress (using solid colors for debugging)**:
- Floor: 0x888888 (gray)
- Walls: 0xcccccc (light gray)
- Water: 0x0055ff (blue)
- MeshBasicMaterial (no lighting needed)
- No fog
- No textures

## Next: Restore Full Visual Quality

1. **Restore Textures**
```typescript
// Change back from:
const mat = new THREE.MeshBasicMaterial({ color: 0x888888 });

// To:
const mat = new THREE.MeshBasicMaterial({ 
  map: texture,
  side: THREE.DoubleSide  
});
```

2. **Re-enable Fog** (at appropriate density)

3. **Proper Lighting** (currently using bright white for debug)

4. **Generate Final Screenshots**
- Start position (1,7) facing north
- Water hall
- Locked door
- Slime location

5. **Add Assertion**: >1,000 non-black pixels

6. **Use `devices['iPhone 15']`** (not Pro)

## Commits

- `de8f557` - Fix critical WebKit rendering bugs - scene now visible

## Files Modified

- `src/proto3d/renderer.ts` - Shader vertex fix
- `src/proto3d/player.ts` - Camera rotation fix
- `src/proto3d/scene-builder.ts` - Material debug changes
- `src/proto3d/lighting.ts` - Bright test lighting
- `src/proto3d/main.ts` - Debug logging + palette disable

## PR Status

PR #7 on branch `cursor/3d-renderer-prototype-6b08`  
**Core rendering now works** - textures/polish remain
