Looks-round dungeon pieces (v2). Same file names, sizes and positions as art/dungeon/, so they drop in by swapping the folder.
- wall_front/left/right, door_locked/open, secret_closed/open x near/mid/far (built from painted textures, build_v2.py)
- sconce_{dead,lit_1,lit_2,lit_3}_{near 26x40, mid 17x26, far 11x17}: wall decals, transparent. Cycle lit_1..3 ~6-8 fps for flicker.
  Suggested spots on a front wall: near x+30,y+40 / mid x+22,y+28 / far x+15,y+20 (relative to the wall piece's top-left); on side walls place by eye near the outer edge.
- Warm light: tint nearby wall/floor pixels toward #ff8844 in code; the art is lit neutral-cold on purpose so dead sconces stay cold.
