# Dark glints (`art/fx/dark/`), built by `build_dark.py`
Draw all of these **unlit** (MeshBasicMaterial), `AdditiveBlending`, `depthWrite: false`, nearest filtering. They ignore the light so they show in the true dark. Hide them once the square is lit (by a torch or the lantern) and the real sprite becomes visible.

- `eyes_{green,amber,pale}_1..10.png` (16×8): a blinking pair of eyes, 8 fps loop, with a random 0–3 s pause on frame 1. Place at the monster's eye height, about 0.55 above its floor (or 0.15 for leeches and rats). Scale like the monster sprite. green = rats, leeches, swamp things; amber = crabs, big beasts; pale = drowned dead, Tide spawn.
- `glint_1..6.png` (7×7): a twinkle for keys, levers and other things you need. Play it at 12 fps, then hold the empty frame 1 for 1.5–3 s. Put it on the item's brightest point.
- `stairs_glow.png` (32×16): a faint cold-green glow along the bottom of the stairs-down opening, so you can't get lost.
