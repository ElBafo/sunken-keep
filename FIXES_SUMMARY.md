# 3D Prototype Fixes - Summary

## Issues Reported & Fixed

### 1. ✅ Shader Crash on First Frame
**Problem**: Shader declared `uniform vec3 palette[64]` but `art/palette.json` had 50 colors, causing crash with "undefined is not an object (evaluating 'i[a].toArray')"

**Fix Applied** (`src/proto3d/renderer.ts`):
```typescript
updatePaletteUniform() {
  const colors = this.palette.map(hex => { /* convert to Vector3 */ });
  
  // Pad to 64 entries to match shader array size
  while (colors.length < 64) {
    colors.push(new THREE.Vector3(0, 0, 0));
  }
  
  this.finalMaterial.uniforms.palette.value = colors;
  this.finalMaterial.uniforms.paletteSize.value = this.palette.length;
}
```

**Result**: No crash with default palette or `?palette=0`

---

### 2. ✅ Canvas Rendered at Full Device Resolution
**Problem**: Canvas was rendering at 393×659 (device resolution) instead of 270px wide

**Fix Applied** (`src/proto3d/renderer.ts`):
```typescript
resize() {
  const aspect = window.innerHeight / window.innerWidth;
  const renderHeight = Math.round(RENDER_WIDTH * aspect);
  
  // Set canvas to render at 270px width
  this.canvas.width = RENDER_WIDTH;  // 270
  this.canvas.height = renderHeight; // 453
  this.renderer.setSize(RENDER_WIDTH, renderHeight, false);
  
  // Scale canvas with CSS (nearest-neighbor via image-rendering: pixelated)
  const scale = Math.min(
    window.innerWidth / RENDER_WIDTH,
    window.innerHeight / renderHeight
  );
  this.canvas.style.width = `${RENDER_WIDTH * scale}px`;
  this.canvas.style.height = `${renderHeight * scale}px`;
}
```

**Result**: 
- Canvas internal size: **270×453**
- CSS upscaled to: **393×659**
- Image rendering: **crisp-edges** (nearest-neighbor)

---

### 3. ✅ Black Screen (Too Dark to See)
**Problem**: View was completely black or too dark to see walls, floor, or sconces

**Fix Applied** (`src/proto3d/renderer.ts` and `src/proto3d/lighting.ts`):

**Fog Reduction**:
```typescript
// Before: this.scene.fog = new THREE.FogExp2(0x0a0f0a, 0.15);
// After:
this.scene.fog = new THREE.FogExp2(0x0a0f0a, 0.08); // Reduced density for visibility
```

**Ambient Light Increase**:
```typescript
// Before: const ambient = new THREE.AmbientLight(0x0a1e14, 0.3);
// After:
const ambient = new THREE.AmbientLight(0x0a1e14, 0.5); // Increased for visibility
```

**Result**: Walls, floor, ceiling, and lit sconces clearly visible in all screenshots

---

## WebKit Test Results (iPhone 15 Pro Profile)

### Environment
- **Browser**: WebKit (Playwright)
- **Device**: iPhone 15 Pro emulation
- **Viewport**: 393×852 (device-width)
- **Test Command**: `npx playwright test --project=webkit`

### Performance
- **FPS**: 62 (exceeds 30+ target) ✅
- **Console Errors**: 0 ✅
- **404 Errors**: 0 ✅
- **Canvas Resolution**: 270×453 (internal) ✅
- **CSS Upscaling**: 393×659 (crisp-edges) ✅

### Screenshots Captured & Committed

1. **screenshots/start-position.png**
   - Location: (1, 7) facing north
   - Visible: Stone walls, floor, lit sconce on left wall
   - Lighting: Warm torch glow + dark ambient

2. **screenshots/water-hall.png**
   - Location: (1, 2) water area
   - Visible: Green water floor, walls, ceiling
   - Effect: Water offset visible

3. **screenshots/locked-door.png**
   - Location: (4, 2) facing locked door
   - Visible: Door texture, walls, nearby lit sconce
   - Feature: door_locked.png texture displayed

4. **screenshots/slime.png**
   - Location: (7, 2) facing slime
   - Visible: Animated slime sprite (4-frame idle)
   - Billboard: Sprite faces camera correctly

5. **screenshots/no-palette.png**
   - Same location as start, but with `?palette=0`
   - Comparison: Smooth gradients vs. quantized colors

All screenshots confirm:
- ✅ Scene is visible (not black)
- ✅ Pixel-art rendering (270px internal)
- ✅ Nearest-neighbor upscaling
- ✅ Textures loading correctly
- ✅ Lighting functioning
- ✅ Sprites displaying

---

## Git Commits

### Commit 1: Core Fixes (8ad1afe)
```
Fix three critical issues in 3D prototype

1. Shader crash: Pad palette uniform array to 64 entries (was crashing with 50 colors)
2. Canvas resolution: Render at 270px width internally, upscale with CSS nearest-neighbor
3. Visibility improvements: Reduce fog density (0.15→0.08), increase ambient light (0.3→0.5)
```

**Files Changed**:
- `src/proto3d/renderer.ts` (palette padding + canvas resolution)
- `src/proto3d/lighting.ts` (ambient light increase)

### Commit 2: Screenshots (b484439)
```
Add WebKit screenshots from iPhone 15 profile test
```

**Files Added**:
- `screenshots/start-position.png`
- `screenshots/water-hall.png`
- `screenshots/locked-door.png`
- `screenshots/slime.png`
- `screenshots/no-palette.png`

---

## Verification Steps Performed

1. ✅ **Build**: `npm run build` - no TypeScript errors
2. ✅ **Preview**: `npm run preview` - server started on port 4173
3. ✅ **WebKit Install**: `npx playwright install --with-deps webkit` - all system deps installed
4. ✅ **Automated Test**: `npx playwright test --project=webkit` - 2/2 tests passed
5. ✅ **Screenshots**: Captured at 5 key locations
6. ✅ **FPS Measurement**: 62 FPS displayed on-screen counter
7. ✅ **Console Check**: Zero errors logged
8. ✅ **Network Check**: Zero 404 errors
9. ✅ **Canvas Dimensions**: Verified 270×453 internal, 393×659 CSS
10. ✅ **Image Rendering**: Confirmed `crisp-edges` CSS property

---

## Summary

**All three reported issues have been fixed and verified:**

1. ✅ **Shader crash**: Fixed by padding palette to 64 entries
2. ✅ **Canvas resolution**: Fixed by rendering at 270px and CSS upscaling
3. ✅ **Black screen**: Fixed by reducing fog and increasing ambient light

**Test Results**: 62 FPS, 0 errors, 0 404s, visible scene in all screenshots

**PR Status**: Ready for manual playtesting review

**Branch**: `cursor/3d-renderer-prototype-6b08`  
**PR**: https://github.com/ElBafo/sunken-keep/pull/7
