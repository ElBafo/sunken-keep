G=['######################',
'#~=~#S..#.....########',
'#~=~D.......F.d.....##',
'#~=~#...#.F...#####.##',
'#~~~#####...F.#####.##',
'#.......###########d##',
'#...#.......#######.##',
'#...#...###.#######.##',
'##.###d##.....##.....#',
'##.#....#...P.##.....#',
'##.#.~~.#.....##>....#',
'##.#~==~##############',
'##.#~~~.##############',
'##.#.S..##############',
'#...##################',
'######################']
START=(3,14)          # party spawns here, before the cave-in
START_DIR='W'         # facing west at spawn
AFTER_CAVE=(2,14)     # party position after the cave-in scene
AFTER_CAVE_DIR='E'    # facing east (toward the rubble) when control returns
RUBBLE={(3,14):'R'}   # overlay: after the cave-in this square is solid rubble (tile char R)
MON={(3,2):'bog_leeches',(5,3):'rust_crab',(7,5):'keep_rat',(10,1):'keep_rat',(12,3):'keep_rat',
     (7,9):'keep_rat',(5,11):'bog_leeches',(7,13):'rust_crab',(9,4):'keep_rat',(19,7):'slime'}
ITEM={(2,5):'key',(6,3):'potion_red',(5,5):'potion_blue',(5,7):'chest: potion_red',(7,7):'potion_green',
      (12,8):'oil_flask',(4,10):'potion_red',(4,13):'journal_page (behind secret S at (5,13))'}
TRIG={(3,14):'cave-in opening: party steps W to (2,14), ceiling collapses, (3,14) becomes rubble R, party turns E; play once, saved state cave_in_done',(16,2):'bones on the floor',(19,3):'dented helmet; ambience drops out',(19,4):'autosave; slime-scarred sconce on wall',
      (19,5):'lair door, slime sting plays, stays open',(6,8):'door down to flooded cellars',(14,2):'door east, slime trail starts',
      (2,9):'start corridor bark',(13,9):'Pell lamp (wall prop)',(16,10):'stairs down'}
CAVE_IN=dict(at=(3,14),step_to=(2,14),rubble=(3,14),once=True,state='cave_in_done',start_dir='W',end_dir='E')
