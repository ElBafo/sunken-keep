# Honest Screenshot Verification - Issues Remaining

## MD5 Hashes
```
501c42b88b93b45e82a2fb3ef01b7e35  proto-door.png
7eebfe33df8412d88ccfc0c005f3f9cb  proto-forward.png
43aa638b4c31046ddb96ded0410f5e01  proto-no-palette.png
09ebabdb0a019c49974b355e4803fb7a  proto-slime.png (UNCHANGED - NO SLIME)
9d5c89a9ac9d293084180e80d0fde9dd  proto-start.png
a9575b1cc0f827a091eb75d4bcdc8d81  proto-water.png
```

## What I Actually See in Screenshots

### 1. proto-slime.png ❌ - ISSUE NOT FIXED
**MD5**: 09ebabdb0a019c49974b355e4803fb7a

**What I see**: Empty green moss corridor with end wall. **NO SLIME VISIBLE**.

**Investigation**:
- Slime exists in floor data at tiles[2][7] = (x=7, y=2)
- World position should be (14, 0.75, 4)
- Navigation path: start (1,7) → (2,2) → (6,2) facing east
- Slime sprite code exists and loads textures from `art/dungeon/slime_idle_*_near.png`
- All 4 idle animation frames exist on disk
- Sprite has `userData.isSprite = true` to skip lighting
- Added console.log but no output in test (sprite may not be loading or rendering)

**Possible causes**:
1. Sprite not being added to scene (texture load failure?)
2. Wrong navigation - not actually at (6,2) or not facing right direction
3. Sprite behind wall or culled
4. Sprite material color is black (though we skip it in lighting)
5. Camera frustum not including sprite

### 2. Controls Overlap ✓ - FIXED
**All screenshots**: Controls NOW properly separated from 3D view with black space between them. 

Layout verified:
- Canvas: 270×380px fixed size at top
- Controls: 20px margin-top, positioned below canvas
- No overlap ✓

### 3. Green Floor ⚠️ - NOT A BUG
**All screenshots**: Floor is moss-green with tan/brown speckles.

**Investigation**: I verified the source texture `public/art/tex3d/floor_stone.png` IS green moss-covered stone. This is NOT a palette snapping issue - it's the actual dungeon art texture.

**Palette distance**: Implemented OKLab perceptual color space (better than weighted RGB) for palette snapping. The green floor is correctly reproduced because the SOURCE is green.

**If grey stone floor is required**, need different source texture file.

## Summary

- ✓ **Fixed**: Controls layout - now properly below view
- ✓ **Fixed**: Improved palette distance (OKLab)
- ❌ **NOT FIXED**: Slime sprite not rendering
- ⚠️ **NOT A BUG**: Green floor matches green source texture

## Next Steps Needed

To fix slime rendering, need to:
1. Verify sprite is actually added to scene (check console logs from real browser)
2. Verify navigation puts camera at correct position/rotation
3. Check if sprite is visible from (6,2) facing east
4. Possibly try viewing from (5,2) (2 squares away) as fallback
5. Check sprite depth/alpha/culling settings

Mean brightness: 37.30/255 ✓ (target 35-60)
