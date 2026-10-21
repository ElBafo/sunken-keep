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

Doors, arches, and secret-wall nooks use the same stone as the surrounding room. Arches and openings have real depth (reveal / soffit). Secret walls look normal except one slightly odd brick.

Doorways are big flat slabs, not curves — a curved soffit reads as a strip of thin stones at phone resolution.

- **Main doors** (between halls): faceted opening. Straight vertical jambs, two 45° chamfer slabs, and one flat keystone/lintel on top. 3–5 large stones per side, visible joints, each face UV’d at wall density.
- **Side doors** (small rooms, corridors, pantry / cellar / lair): flat lintel. Straight jambs plus one heavy stone beam across the top, slightly taller than a brick course, with chipped worn ends.

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
