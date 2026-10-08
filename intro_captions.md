# Intro storyboard (Storie) + caption timing
Shots (~35s, six shots; art is wide 854x480 at 2x pixel size, show a 270x480 window and pan sideways per intro.json):
1. Keep at its height, dusk, forge glow, sparks from chimneys (~6s). No caption.
2. Night it sank: storm, ground splits, black water, tower tilts, screen shake, lightning (~6s).
3. Drowned forge underwater: sinking hammer, forge goes out with steam, bubbles, light rays (~6s).
4. Those who stayed: flooded hall, pairs of fish eyes open one by one (sprites + order in intro.json) (~6s).
5. Swamp today: towers in mist and reeds, boat with four silhouettes glides in (path in intro.json), layered fog (~5s).
6. Party at the gate: pan across the four, then title.png fades in at 33s on the anvil hit (~6s).
Effects in code: rain, lightning, screen shake, bubbles, sparks, fog.
Captions:
- 7.0-11.5s "Karak Durn sank in a single night."
- 13.0-17.5s "Its forges went cold."
- 19.5-23.5s "Its people did not leave."
- 29.0-32.5s "Four fools have come to find out why."
Audio (audio.json): intro score 37s with cues thunder 6.2s, sigh 10.3s, title anvil 33s. Swamp loop 24s seamless for floor 1. Hollow Tide sigh on tapping the glowing secret carving, volume scales with depth starting ~0.25 on floor 1. sfx_hurt when a party member takes damage.
