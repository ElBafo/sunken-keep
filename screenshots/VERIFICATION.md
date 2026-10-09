# Screenshot Verification Report

## MD5 Hashes
```
501c42b88b93b45e82a2fb3ef01b7e35  proto-door.png
7eebfe33df8412d88ccfc0c005f3f9cb  proto-forward.png
43aa638b4c31046ddb96ded0410f5e01  proto-no-palette.png
276c7f21e69fa01b536661d6621684ef  proto-slime.png
9d5c89a9ac9d293084180e80d0fde9dd  proto-start.png
a9575b1cc0f827a091eb75d4bcdc8d81  proto-water.png
```

## Actual Screenshot Descriptions

### proto-start.png (MD5: 9d5c89a9ac9d293084180e80d0fde9dd)
**What I Actually See**: Start corridor (1,7) facing north. Moss-green stone walls with tan/brown speckles. Sconce flame on left wall. Floor is moss-green stone with tan highlights. Arrow pad buttons overlapping bottom of 3D view at approximately y=600-700 of the view. Black area below y=800.

**Issues**: Green floor (source texture IS green moss), controls still overlap view.

### proto-forward.png (MD5: 7eebfe33df8412d88ccfc0c005f3f9cb) 
**What I Actually See**: One step forward, similar green moss corridor. Good depth falloff visible. Controls overlap view bottom.

### proto-water.png (MD5: a9575b1cc0f827a091eb75d4bcdc8d81)
**What I Actually See**: Water hall with animated green water floor texture. Proper perspective down corridor. Controls overlap.

### proto-door.png (MD5: 501c42b88b93b45e82a2fb3ef01b7e35)
**What I Actually See**: Locked door from 2 squares away with visible side walls, floor, ceiling. Good framing. Controls overlap.

### proto-slime.png (MD5: 276c7f21e69fa01b536661d6621684ef)
**What I Actually See**: Empty corridor with end wall. NO SLIME VISIBLE. Navigation is still incorrect - slime not rendering or not at expected position.

### proto-no-palette.png (MD5: 43aa638b4c31046ddb96ded0410f5e01)
**What I Actually See**: Raw sRGB output, brighter than palette version. Green moss floor clearly visible. Controls overlap.

## Issues Remaining

1. **Slime NOT rendering** - sprite at (7,2) not visible from test navigation position
2. **Controls overlap view** - arrow pad sits on top of 3D view around y=600-800
3. **Floor IS green** - source texture `floor_stone.png` IS green moss/stone (verified), NOT grey

## Floor Texture Investigation

The source file `/workspace/public/art/tex3d/floor_stone.png` IS a green moss-covered stone texture. This is NOT a palette snapping issue - it's the actual dungeon art. The OKLab perceptual distance is working correctly; the floor reads green because it IS green in the source.

If grey stone floor is required, need different source texture.
