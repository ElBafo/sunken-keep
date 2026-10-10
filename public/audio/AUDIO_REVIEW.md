# Audio review against the competitor analysis (Oct 10, 2026)

No new mechanics proposed here. The wind-up sounds wait for Loukas to approve Levie's monster habits.

## 1. Sounds made but not proven wired — Critical
- Now: 175 MP3s and 153 sfx triggers in audio.json. Earlier, 49 files were missing from public/audio on main, and the loudness pass changed files already copied. Nothing checks that a trigger actually plays.
- Finding: principle 10 ("not complete until integrated, tested"), point 8.
- Fix: one Act 1 checklist mapping each game event to its sound; an automated test that every trigger the game fires resolves to a file that loads.
- Benefit: no silent or stale events reach the family.
- Dependencies: Gamie, Testie. Complexity: low.
- Acceptance: the test fails on any missing or failed-to-load file; a floor 1 playthrough hears every listed event once.

## 2. Combat audio repetition — High
- Now: hit, miss, hurt and crit were one file each. Tonight I added 3 variants each (asset change only).
- Finding: point 1, repetitive and exhausting combat.
- Fix: random variant, never the same twice in a row, plus 0.95–1.05 pitch. Wind-ups for crab, drowned dwarf and Dural only if the habits are approved.
- Benefit: long fights stay readable instead of droning.
- Dependencies: Gamie step 2. Complexity: low.
- Acceptance: in 20 consecutive hits no file plays twice in a row; Testie's "boring or frustrating" report on a long fight.

## 3. No mixer, no volume controls — High
- Now: every sound plays at full volume with no voice limit or priorities. Mixer spec exists in AUDIO_PLAN.md but isn't built.
- Finding: point 7 (QoL), principle 7.
- Fix: music, effects and ambience sliders in Options, saved with settings; 6-voice limit; combat > puzzles > nearest loop > one-shot ambience > music.
- Benefit: no "audio mush" on a phone speaker; players control their own mix.
- Dependencies: Gamie, after step 2. Complexity: medium.
- Acceptance: never more than 6 voices; combat hits stay audible over loops; sliders survive a reload.

## 4. iPhone audio reliability — High
- Now: rules written (MP3 on iOS, unlock on first tap, pause in background, resume on tap) but untested on real hardware.
- Finding: point 8, interrupted sessions.
- Fix: a short real-device checklist for the family.
- Dependencies: Testie can't cover it in WebKit. Complexity: low.
- Acceptance: sound works after a Home Screen launch, after switching apps, after a call or alarm, and after locking the phone.

## 5. Unused assets — Medium
- Now: many sounds for floors 2–4, dressing and far atmosphere aren't used by the Act 1 3D build yet.
- Finding: principle 2 ("every mechanic must justify its existence").
- Fix: keep the sound freeze; ship only what the build triggers; archive the rest until its floor exists.
- Benefit: smaller download, less to maintain. Complexity: low.
- Acceptance: public/audio contains only files referenced by the build's trigger list.
