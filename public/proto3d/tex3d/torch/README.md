# Torch pieces for the 3D view (`art/tex3d_v2/torch/`)
Built by `build_torch.py` from the v2 sconce art. These replace the flat `sconce_*` decal and `sconce_glow`; light comes from a point light per torch.

## Files
| file | size | use |
|---|---|---|
| bracket_{lit,dead,capped}_side.png | 32×64 | profile quad, **perpendicular** to the wall. Image left edge (x 0) touches the wall. |
| bracket_{lit,dead,capped}_front.png | 32×64 | front quad, **parallel** to the wall, symmetric. |
| flame_1..3.png | 32×40 | billboard flame loop, 8 fps. Only used on lit torches. |
| flare_1..6.png | 32×40 | lighting animation at 12 fps (spark, catch, grow, overshoot, settle), then switch to the flame loop. |
| item_oil_{near,mid,far}.png | 80×60, 50×40, 30×25 | oil flask on the floor, same canvas and floor line as `item_potion_blue_*`. |
| icon_oil.png | 24×24 | inventory icon. |

States: **lit** has a glowing basket, **dead** is a charred stub (can be relit), **capped** is a riveted iron cap with green stain (can't be lit until floor 8).

## Placement (one wall square = 1 world unit)
- Bracket: 0.25 wide × 0.5 tall, centred at mid-height, as before. Use `transparent: true, alphaTest: 0.5`, `side: DoubleSide`.
- **Side quad**: perpendicular to the wall, its x 0 edge on the wall, sticking out 0.25.
- **Front quad**: parallel to the wall, **0.14** out from it (under the basket's centre, column 18 of 32).
- Together they form a cross, so the torch reads in profile on side walls and head-on on the far wall.
- **Flame / flare**: 0.25 wide × 0.3125 tall, top edge level with the bracket's top edge, centred 0.14 out from the wall. It's a Y-axis billboard (rotates around the vertical only, always facing the camera). Additive blending is not needed; draw it unlit (MeshBasicMaterial) at full brightness.
- Point light at the flame centre (about 0.1 above the bracket centre, 0.14 out).
