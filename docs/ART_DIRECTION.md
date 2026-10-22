# Art direction — Sunken Keep

Read this before any visual work (materials, textures, lighting, meshes, or screenshots).

## Goal

The dungeon and later the monsters must feel like one game. Dark, old, worn, matte. Warm torch light; unlit areas stay dark. Mood is Grimrock / Dungeon Master / Eye of the Beholder.

Phone-first: iPhone Air portrait is the target. iPhone 15 (393 pt wide) is the minimum.

## Nothing new

Nothing looks new, clean, polished, or perfectly regular. No specular sheen on stone or wood. No clearcoat or sheen on those surfaces (`specularIntensity` 0 on wood; stone stays rough and matte).

## Ceiling

Dark rough rubble stone, darker than the walls, with a heavy worn stone cornice where the walls meet the ceiling.

Planks only in the pantry and guard hall. Beams also in the muster hall. Wood is old antique dark wood, grey-brown not reddish: knots, nail holes, cracks, raised grain, grime toward edges, black gaps between boards, fully matte (`specularIntensity` 0, no clearcoat/sheen).

Beams are slim ribs ~8–10 cm, on the grid, one direction per room, flush with walls, clear of doors and secret nooks.

## Openings

Doors and secret-wall nooks use the same stone as the surrounding room. A door is one wall between two directly adjacent room cells — not its own passage cell. That shared doorway wall is about 30 cm thick in total (15 cm of each room's own stone) on the cell edge. The opening is a rectangle cut through that thickness; soffit and reveal faces are sealed with each room's stone. Secret walls look normal except one slightly odd brick.

Doorways are a rectangular opening with a heavy stone lintel. No arches. Big flat slabs, not curves — a curved soffit reads as a strip of thin stones at phone resolution.

- **Opening:** a tall rectangle, about 1.1–1.2 m wide and about 1.54 m from the floor to the lintel — as tall as the 28 cm lintel allows under the 1.82 m cornice. Never a squat garage cut. Centred on the cell edge. Side walls left by the narrower cut are normal room stone; joints run straight, no holes or seams. Any carved knot / banded course on the wall stops cleanly at the jambs and lintel instead of running over the opening. The wall plate is punched through the lintel band so those courses do not continue across the head. Above and beside the lintel the wall is normal room coursing.
- **Lintel:** one heavy single stone block in the room's own stone, about 25–30 cm tall, bearing 15–20 cm into the wall on each side. Field stone, not the carved band. All four doors use this lintel only — no relieving arch, no infill above the lintel. Jambs are cut into the wall (flush, or 2–3 cm proud). Same room stone, same tint or slightly darker, chipped worn ends.
- **Leaves:** Artie's hand-aged `door_panel_aged.png` — the original `door_panel.png` plank layout and studded bands, no painted lock, arched cap cropped to the rectangle. Load-time fill copies plank-column pixels into the arched-cap corner texels so the leaf reads as a full rectangle of boards; a thin black gap under the lintel is fine. Classic `door_panel.png` stays unchanged. Key-locked doors get a small 3D iron lock plate (escutcheon) on the leaf at handle height beside the centre seam — about 8×12 cm, dark rusty grey iron (#3a342e), fully matte (`specularIntensity` 0), two or four tiny rivets, and a black keyhole cut (round top plus a tapered slot, about 1.5×4 cm) that reads at phone size. Unlocked and ordinary doors have no plate and keep the ring handle. The plate is parented to the leaf so it slides up with it; it stays after the key is used. No 3D padlock or hasp. Wood is darker desaturated grey-brown (not warm orange), with grime toward the edges, cracks, and black board gaps. Iron is darker, rustier, and fully matte instead of bright silver. Stud and rivet heads are dull rusty or dark-grey iron highlights — never near white, no specular sparkle on the leaf. The brightest leaf pixel stays no brighter than the lit stone around it. `roughness` 1, `specularIntensity` 0, no clearcoat/sheen. Leaves are exempt from the antique-oak plank rule. Sit back in the reveal (about a quarter of the wall depth) so the frame reads. The leaf is rectangular under the lintel and slides up like a portcullis.

## Tiles and density

Tiles share edges so joints run straight across (walls, slabs, floor). Texel density matches between walls, floor, and ceiling. Floor and ceiling are 256 px per 2 m cell.

## Variety

Ceiling variety follows what is below: broken stone over sunbeam cracks, collapsed patches over fallen rubble, soot above torches.

## Decorations

Decorations never add light. No decorations near secret walls.

## Performance

No runtime shader recompiles. Do not change `castShadow`. Keep the near-ring cache working.

## Process

Small PRs. Screenshots before any visual merge. Floor 1 work stays on `voxel-floor1` — Classic / proto3d stays untouched unless the task says otherwise.
