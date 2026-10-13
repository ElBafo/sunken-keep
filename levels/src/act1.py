"""Act 1 level source (Levie). ASCII maps + overlays -> floorN.ts, with reachability checks.
Legend:  # wall   . floor   ~ shallow water   = deep water (walkable, wades)   < stairs up (start)
         > stairs down   d door   D locked door   S secret wall   G glass-water doorway (blocks, look only)
         L lever (wall)   g grate (wall)   V air vent (wall)   T table   b bunk   r weapon rack
         K statue   | cell bars (props and bars block movement)
         B offering bowl (prop)   A altar (prop)   W water doorway that a puzzle opens
"""
import json, collections, sys
BLOCK = set('#SGLgVTbK|DBAWFP')
# wall props stand against a wall: the square stays walkable (Eye of the Beholder style). Floor props block.
WALL_PROPS = {'weapon_rack','lamp_capped','jar_rack'}
WALLISH = set('#SGLgVK|')

FLOORS = {}

FLOORS[1] = dict(
  name='Upper Halls', start=(3,14), startDir=3, area='halls', ambience='amb_upper_halls', noStairsUp=True,
  version='v2',
  # cave-in opening: spawn (3,14) facing W (3), step to (2,14), (3,14) turns to rubble, control returns at (2,14) facing E (1)
  caveIn=dict(at=(3,14), stepTo=(2,14), rubble=(3,14), endDir=1, once=True, state='cave_in_done', bark='opening_cavein'),
  grid=[
  "######################",
  "#~=~#S..#.....########",
  "#~=~D.......F.d.....##",
  "#~=~#...#.F...#####.##",
  "#~~~#####...F.#####.##",
  "#.......###########d##",
  "#...#.......#######.##",
  "#...#...###.#######.##",
  "##.###d##.....##.....#",
  "##.#....#...P.##.....#",
  "##.#.~~.#.....##>....#",
  "##.#~==~##############",
  "##.#~~~.##############",
  "##.#.S..##############",
  "#...##################",
  "######################"],
  overlay={
    (3,14): dict(trigger='cave_in', once=True, state='cave_in_done', rubbleAfter='cave_in_done', note='cave-in: becomes solid rubble after the opening scene'),
    (2,9): dict(bark='f1_start', note='start corridor bark (after the cave-in)'),
    (2,5): dict(item='key'),
    (3,2): dict(monster=('bog_leeches',12)),
    (4,2): dict(carving='carving_door'),
    (5,1): dict(carving='carving_secret'),
    (5,3): dict(monster=('rust_crab',24)),
    (6,3): dict(item='potion_red'),
    (5,5): dict(item='potion_blue'),
    (4,5): dict(bark='pantry', note='pantry doorway, first time in'),
    (7,5): dict(monster=('keep_rat',14)),
    (5,7): dict(chest=True, chestItems=['potion_red'], note='pantry chest: a healing draught the cook hid'),
    (7,7): dict(item='potion_green'),
    (6,8): dict(trigger='cellar_enter', once=True, note='door down to the flooded cellars'),
    (7,9): dict(monster=('keep_rat',14)),
    (4,10): dict(item='potion_red'),
    (5,11): dict(monster=('bog_leeches',12)),
    (7,13): dict(monster=('rust_crab',24)),
    (4,13): dict(item='journal_page', journalPage=1, note='behind the secret wall S at (5,13)'),
    (9,2): dict(bark='guard_hall_enter', note='guard hall: first time in, Ilsevar/Mags sunlight lines'),
    (11,2): dict(daylight=True, note='sunbeam through ceiling_crack + shaft_2'),
    (10,3): dict(mirror=True, note='fallen beams, mirrored (dressing_act1.json)'),
    (9,4): dict(monster=('keep_rat',14), note='moved off the slime trail (was (17,2))'),
    (10,1): dict(monster=('keep_rat',14), note='extra rat, sleeps under the beams'),
    (12,3): dict(monster=('keep_rat',14)),
    (14,2): dict(trigger='slime_trail_start', once=True, note='door east, slime trail starts'),
    (16,2): dict(trigger='slime_trail_bones', once=True),
    (19,3): dict(trigger='slime_trail_helmet', once=True, ambienceOut=True, note='dented helmet; ambience drops out'),
    (19,4): dict(trigger='slime_trail_save', autosave=True, once=True, note='autosave under the slime-scarred sconce'),
    (19,5): dict(trigger='slime_lair_door', once=True, sting=True, note='lair door, sting plays, stays open'),
    (19,7): dict(monster=('slime',70), split=True, note='1-wide neck of the lair; splits at half HP'),
    (16,10): dict(stairsDown=True),
    (8,6): dict(bark='lampkeeper_hooks_heard', note='hook clinks first heard here; dead torch above'),
    (11,8): dict(bark='lampkeeper_enter', note="Pell the lamp-keeper's room, optional dead end"),
    (12,8): dict(item='oil_flask', note="Pell's flask, the only oil on floor 1"),
    (12,9): dict(readNote='note_lampkeeper', bark='lampkeeper_note_read', note="desk with Pell's note (tap the desk)"),
    (13,9): dict(prop='lamp_capped', bark='lampkeeper_capped_lamp', propWall='E', note='tap the capped lamp'),
    (9,10): dict(prop='jar_rack', propWall='W', note="Pell's jar rack against the west wall; square stays walkable"),
  },
  sconces=[(0,6,'E',True),(4,1,'W',True),(6,4,'S',True),
           (4,6,'W',False),(8,1,'W',False),(8,5,'S',False),(14,3,'W',False),
           (0,3,'E','capped'),(9,0,'S','capped')],
  drips=[(2,1),(2,3),(1,4)],
  dark=[(9,6),(10,6),(11,6),(11,7),(9,8),(10,8),(11,8),(12,8),(13,8),(9,9),(10,9),(11,9),(13,9),(9,10),(10,10),(11,10),(12,10),(13,10)],
  needs=dict(key=True),
)

FLOORS[2] = dict(
  name='Lower Halls', start=(7,1), startDir=2, area='halls', ambience='amb_upper_halls',
  grid=[
  "############",
  "#....#.<...#",
  "#.#L.#.....#",
  "#.#..#.##d##",
  "#.####.#...#",
  "#......#.~.#",
  "###dLL##~~~#",
  "#......#.~.#",
  "#.####G###S#",
  "#.#..#===#.#",
  "#....#===V>#",
  "############"],
  overlay={
    (7,1): dict(daylight=True, bark='stairs_dead_lamp'),
    (6,3): dict(dialogue='f2_singing'),
    (1,5): dict(bark='hobb_shout', note='Hobb calls from the stores before the levers can be faced'),
    (2,5): dict(bark='hobb_shout', note='Hobb calls from the stores before the levers can be faced'),
    (3,5): dict(bark='hobb_shout', note='Hobb calls from the stores before the levers can be faced'),
    (4,5): dict(bark='hobb_shout', note='Hobb calls from the stores before the levers can be faced'),
    (5,5): dict(bark='hobb_shout', note='Hobb calls from the stores before the levers can be faced'),
    (6,5): dict(bark='hobb_shout', note='Hobb calls from the stores before the levers can be faced'),
    (9,4): dict(log='enter_cistern', bumpLog='blocked_cistern', note='way into the cistern; bump while flooded'),
    (4,1): dict(monster=('cellar_spider',20)),
    (3,3): dict(chest=True, chestItems=['potion_red','potion_blue'], note='storeroom chest'),
    (4,3): dict(item='potion_red'),
    (3,2): dict(lever=dict(face='E', opens=(10,8), pullLog='lever_far_click')),
    (8,5): dict(monster=('keep_rat',14)),
    (10,5): dict(monster=('keep_rat',14)),
    (9,6): dict(monster=('bog_leeches',12)),
    (10,7): dict(item='potion_blue'),
    (6,7): dict(dialogue='f2_glass_door'),
    (8,7): dict(item='oil_flask'),
    (4,6): dict(lever=dict(face='N', puzzle='f2_vents', side='right'), note='RIGHT lever: cistern (rat room) drains, stores nook floods'),
    (5,6): dict(lever=dict(face='N', puzzle='f2_vents', side='left'), note='LEFT lever: stores nook drains, cistern floods. Plate text LEFT: STORES. RIGHT: CISTERN.'),
    (6,8): dict(glassWater=True),
    (1,9): dict(monster=('cellar_spider',20), bark='stores_frogs', log='enter_stores'),
    (4,10): dict(npc='hobb', note='pinned under a fallen shelf in the stores nook; knows Tam'),
    (3,10): dict(dialogue='f2_frogcatcher', note='talk facing E; freeing him sets frogcatcher_freed and he wades off to the stairs up'),
    (3,9): dict(item='journal_page', journalPage=2, note="Orrun journal page 2: 'My people keep breathing. Mostly.'"),
    (10,8): dict(secret=True, openedBy='lever'),
    (9,10): dict(vent=dict(face='E'), bark='first_vent'),
    (10,10): dict(daylight=True, bark='singing_louder', stairsDown=True),
  },
  sconces=[(5,1,'W',True),(8,0,'S',True),(2,6,'N',True),(6,6,'N',True),(5,4,'E',False),(11,5,'W',False),(0,10,'E',False),(11,9,'W',False),(0,5,'E','capped'),(7,7,'W','capped')],
  drips=[(9,5),(9,6),(8,6),(10,6),(9,7),(7,9)],
  dark=[],
  needs=dict(key=False),
  puzzles=[dict(id='f2_vents', type='vent_switch', text='floor2_vents', levers={'left':(5,6),'right':(4,6)},
    zones={'cistern':[(x,y) for y in range(4,8) for x in range(8,11)], 'stores':[(1,9),(1,10),(2,10),(3,10),(3,9),(4,9),(4,10)]},
    start='left', leverDry={'left':'stores','right':'cistern'},
    trapped=dict(npc='hobb', at=(4,10), freedFlag='frogcatcher_freed', ifFloodedFirst='frogcatcher_drowned',
                 note='if the RIGHT lever floods the stores before f2_frogcatcher has freed him, he drowns: set frogcatcher_drowned, play the flood, and the party barks'),
    floodedTile=dict(deepWater=True, blocked=True), note='flooded zone is blocked; start state: cistern flooded, so the right lever is needed to reach the stairs, and the journal nook floods unless you grabbed the page first')],
)

FLOORS[3] = dict(
  name='Barracks', start=(10,10), startDir=0, area='barracks', ambience='amb_barracks',
  grid=[
  "##############",
  "#.....#......#",
  "#.TTT.#.b.b..#",
  "#.....d......#",
  "#.TTT.#.b.b..#",
  "#.....###d####",
  "#######.....V#",
  "#r..#B..###..#",
  "#r..W...#g#..#",
  "#...#.....#..#",
  "#####.###.<..#",
  "#..>d.#.~~~.##",
  "#...#...b.b..#",
  "##############"],
  overlay={
    (10,10): dict(bark='barracks_enter'),
    (9,9): dict(dialogue='f3_grate_tam'),
    (9,8): dict(grate=dict(face='S')),
    (12,6): dict(vent=dict(face='W')),
    (11,7): dict(monster=('rust_crab',24)),
    (9,6): dict(monster=('drowned_dwarf',35), patrol=[(7,6),(11,6)]),
    (1,1): dict(monster=('drowned_dwarf',35)),
    (5,5): dict(item='potion_red'),
    (1,4): dict(item='oil_flask', note='mess hall barrels'),
    (11,12): dict(item='oil_flask'),
    (6,1): dict(note='the lit sconce on the mess-hall wall here (x6,y1 facing W) can be taken as a torch'),
    (5,7): dict(bowl=dict(puzzle='f3_offering', lanternLog='floor3_offering.bowl_lantern'), bark='bowl_first_sight'),
    (4,8): dict(waterDoor=dict(opensOn='f3_bowl_lit'), bumpLog='blocked_waterdoor', note='water doorway into the armoury, parts when the bowl is lit'),
    (5,8): dict(carving='carving_bowl', lanternOnly=True),
    (2,8): dict(item='iron_shield'),
    (3,9): dict(item='chain_mail'),
    (2,7): dict(item='potion_blue'),
    (12,1): dict(chest=True, chestItems=['potion_red','potion_green'], note='barracks chest: an officer kept his own medicine'),
    (8,11): dict(monster=('bog_leeches',12)),
    (10,11): dict(monster=('bog_leeches',12)),
    (5,12): dict(monster=('drowned_dwarf',35), patrol=[(5,9),(5,12)]),
    (12,12): dict(item='potion_green'),
    (3,11): dict(bark='tam_below', stairsDown=True),
  },
  sconces=[(6,1,'W',True),(13,10,'W',True),(4,9,'W',False),(6,6,'E',False),(0,12,'E',False),(13,2,'W',False),(6,4,'E','capped'),(13,9,'W','capped')],
  drips=[(8,11),(9,11),(10,11)],
  dark=[(x,y) for y in range(11,13) for x in range(5,13)],
  needs=dict(key=False),
  puzzles=[dict(id='f3_offering', type='offering_bowl', text='floor3_offering', torchFrom=dict(sconce=(6,1)), bowl=(5,7), opens=(4,8),
    darkAfter=[(x,y) for y in range(1,6) for x in range(1,6)], note='taking the mess-hall torch to the bowl opens the armoury; the mess hall then turns dark (lantern only)')],
)

FLOORS[4] = dict(
  name='Barracks Deep', start=(3,11), startDir=0, area='barracks_deep', ambience='amb_barracks_deep',
  grid=[
  "################",
  "#.....#.######.#",
  "#.###.#.######.#",
  "#.#.#.#.#KKKK#.#",
  "#.#.d...D....#.#",
  "#.#.#.#A#....d.#",
  "#.###.###KKKK#.#",
  "#.....########.#",
  "##.#####~~~~~~~#",
  "#...#>######~~~#",
  "#.#.#.###==#~~~#",
  "#.#<#.###=.|~~~#",
  "#.S.#.######~~~#",
  "#...#..~~~~~~~~#",
  "################"],
  overlay={
    (3,11): dict(bark='deep_enter', note='stairs up from floor 3'),
    (3,10): dict(carving='carving_drill', note='Shield. Hammer. Hammer. Oath. Right in front of the start'),
    (1,10): dict(plate=dict(symbol='shield', puzzle='f4_drill')),
    (1,12): dict(plate=dict(symbol='hammer', puzzle='f4_drill', stepOffLog='floor4_drill_tiles.step_off_hammer'), note='step off and back on for the second hammer'),
    (2,13): dict(plate=dict(symbol='oath', puzzle='f4_drill')),
    (2,12): dict(secret=True, openedBy='f4_drill', item='ashmantle_hammer', note='hidden weapon rack, opens when the drill is done'),
    (8,4): dict(riddleDoor=dict(puzzle='f4_riddle'), bark='riddle_first_sight', note='sealed riddle door, carving on the door'),
    (7,5): dict(altar=dict(puzzle='f4_riddle', accepts=['torch','lantern'])),
    (3,4): dict(item='potion_red'),
    (13,9): dict(item='oil_flask', note='last flask before Tam; lighting (4,13) before the escape helps the run'),
    (1,1): dict(monster=('drowned_dwarf',35)),
    (3,5): dict(monster=('rust_crab',24)),
    (7,1): dict(item='potion_green'),
    (5,7): dict(monster=('drowned_dwarf',35), patrol=[(5,1),(5,7)]),
    (9,4): dict(dialogue='f4_captain'),
    (11,5): dict(npc='dural', monster=('captain_dural',60), note='only fights if f4_captain ends in a fight; otherwise sets captain_spared and steps aside'),
    (13,5): dict(gate=dict(opensWith='captain_key'), bumpLog='blocked_cellgate', openLog='gate_unlocked', note='cell-wing door: opens with captain_key (Dural gives it in f4_captain.spare2 or drops it when beaten)'),
    (14,3): dict(item='potion_blue'),
    (14,7): dict(monster=('drowned_dwarf',35)),
    (10,11): dict(npc='tam', note='Tam chained chin-deep; bars at (11,11)'),
    (11,11): dict(bars=dict(face='E')),
    (12,11): dict(dialogue='f4_tam_cell', then='f4_tide_wakes', note='talk facing W through the bars; f4_tide_wakes ends with start_escape'),
    (12,10): dict(bark='tam_tally', note='first view of the cell: Tam\'s tally on the far wall'),
    (12,13): dict(checkpoint=True, barkIf=[dict(flag='saved_tam', value=True, bark='escape_tam_saved'), dict(flag='saved_tam', value=False, bark='tam_left')]),
    (8,13): dict(checkpoint=True, barkIf=[dict(flag='saved_tam', value=True, bark='escape_tam_saved_2')]),
    (5,9): dict(stairsDown=True, actEnd=1, gateOpensOn='start_escape', bumpLog='blocked_stairs_f4', note='stairs are flooded-shut until the escape starts'),
  },
  escape=dict(start=(12,11), waterStepsPerMove=0.5, path=[(12,12),(12,13),(11,13),(10,13),(9,13),(8,13),(7,13),(6,13),(5,13),(5,12),(5,11),(5,10),(5,9)], manualSaveOff=True,
              waterHeightBySquaresBehind={4:'ankle',3:'knee',2:'waist',1:'over_head'}),
  sconces=[(0,11,'E',True),(10,12,'N',True),(6,3,'E',True),(2,11,'E',True),(8,5,'E',True),(15,4,'W',False),(15,9,'W',False),(4,12,'W',False),(6,1,'W',False),(4,13,'E',False),(0,9,'E','capped')],
  drips=[(12,9),(13,10),(14,12),(9,13),(10,10)],
  dark=[(x,y) for y in range(8,14) for x in range(5,15)],
  needs=dict(key=False),
  puzzles=[
    dict(id='f4_drill', type='step_sequence', text='floor4_drill_tiles', plates={'shield':(1,10),'hammer':(1,12),'oath':(2,13)},
         order=['shield','hammer','hammer','oath'], opens=(2,12), optional=True),
    dict(id='f4_riddle', type='altar_riddle', text='floor4_riddle_door', altar=(7,5), door=(8,4), accepts=['torch','lantern'],
         torchFrom=dict(sconce=(6,3)), note='a lit torch from the sconce at (6,3), or Wren lifting her lantern, opens the captain hall'),
  ],
)


# corner rack faces the same wall as its neighbour so the two read as one rack
FLOORS[3]['overlay'].setdefault((1,7),{})['propWall']='W'

def ts_tile(ch, ov):
    t={}
    m={'#':{'wall':True},'~':{'shallowWater':True},'=':{'deepWater':True},'d':{'door':True},
       'D':{'door':True,'doorLocked':True},'S':{'secret':True},'G':{'wall':True,'glassWater':True},
       'L':{'wall':True},'g':{'wall':True},'V':{'wall':True},'T':{'prop':'table'},'b':{'prop':'bunk'},
       'r':{'prop':'weapon_rack'},'F':{'prop':'beams_fallen'},'P':{'prop':'desk'},'K':{'prop':'statue'},'B':{'prop':'offering_bowl'},'A':{'prop':'altar'},'W':{'wall':True,'glassWater':True,'opens':True},'|':{'wall':True},'<':{'stairs':'up'},'>':{'stairs':'down'}}
    t.update(m.get(ch,{}))
    for k,v in ov.items():
        if k=='monster':
            n,hp=v; t.update(monster=n,monsterState='idle',monsterAnimTime=0,monsterHp=hp,monsterMaxHp=hp)
        elif k in ('note','stairsDown','propWall'): continue
        else: t[k]=v
    if 'prop' in t:
        t['propPlacement']='wall' if t['prop'] in WALL_PROPS else 'floor'
    return t

def js(v):
    if isinstance(v,bool): return 'true' if v else 'false'
    if isinstance(v,(int,float)): return str(v)
    if isinstance(v,str): return "'"+v.replace("'","\\'")+"'"
    if isinstance(v,tuple): return '{ x: %d, y: %d }'%v
    if isinstance(v,list): return '['+', '.join(js(x) for x in v)+']'
    if isinstance(v,dict): return '{ '+', '.join('%s: %s'%(k,js(x)) for k,x in v.items())+' }'
    raise TypeError(v)

DIRS={'N':0,'E':1,'S':2,'W':3}
def bfs(f, passable):
    g=f['grid']; W=len(g[0]); H=len(g)
    seen={f['start']}; q=collections.deque([f['start']])
    while q:
        x,y=q.popleft()
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx,ny=x+dx,y+dy
            if 0<=nx<W and 0<=ny<H and (nx,ny) not in seen and passable(g[ny][nx],(nx,ny)):
                seen.add((nx,ny)); q.append((nx,ny))
    return seen

def check(n,f):
    g=f['grid']; W=len(g[0]); errs=[]
    for i,r in enumerate(g):
        if len(r)!=W: errs.append('row %d len %d'%(i,len(r)))
    sx,sy=f['start']
    if g[sy][sx]!='<' and not f.get('noStairsUp'): errs.append('start not on <')
    # everything reachable when all doors/secrets/gates are open
    allr=bfs(f, lambda c,p: c not in set('#GLgVTbK|BAFP'))
    for (x,y),ov in f['overlay'].items():
        c=g[y][x]
        if c in set('#GLgVK|BAPF'): continue  # wall features and blocking props are faced, not entered
        if (x,y) not in allr and ov.get('npc')!='tam': errs.append('unreachable %s %s'%((x,y),ov))
    dn=[p for p,ov in f['overlay'].items() if ov.get('stairsDown')]
    for p in dn:
        if g[p[1]][p[0]]!='>': errs.append('stairsDown overlay not on > %s'%(p,))
    # key must be reachable without locked doors
    if f['needs'].get('key'):
        nolock=bfs(f, lambda c,p: c not in set('#GLgVTbK|DSWBAFP'))
        keys=[p for p,ov in f['overlay'].items() if ov.get('item')=='key']
        if not any(k in nolock for k in keys): errs.append('key behind a locked door')
    # wall features must face an open tile
    for (x,y),ov in f['overlay'].items():
        for k in ('lever','grate','vent','bars'):
            if k in ov:
                d=ov[k]['face']; dx,dy={'N':(0,-1),'E':(1,0),'S':(0,1),'W':(-1,0)}[d]
                if g[y+dy][x+dx] in set('#GLgVTbK|FP'): errs.append('%s at %s faces a wall'%(k,(x,y)))
    for x,y,face,lit in f['sconces']:
        dx,dy={'N':(0,-1),'E':(1,0),'S':(0,1),'W':(-1,0)}[face]
        if g[y][x] not in set('#'): errs.append('sconce %s not on a wall'%((x,y),))
        elif g[y+dy][x+dx] in set('#GLgVTbK|FP'): errs.append('sconce %s faces a wall'%((x,y),))
    nolockr=bfs(f, lambda c,p: c not in set('#GLgVTbK|DSWBAFP'))
    for pz in f.get('puzzles',[]):
        def near(p): return any((p[0]+dx,p[1]+dy) in nolockr for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)))
        for k in ('bowl','altar'):
            if k in pz and not near(pz[k]): errs.append('%s %s not tappable from an open square'%(pz['id'],k))
        for p in pz.get('plates',{}).values():
            if p not in nolockr: errs.append('%s plate %s unreachable'%(pz['id'],p))
        for p in pz.get('levers',{}).values():
            if not near(p): errs.append('%s lever %s unreachable'%(pz['id'],p))
    if 'escape' in f:
        e=f['escape']; prev=e['start']
        for p in e['path']:
            if abs(p[0]-prev[0])+abs(p[1]-prev[1])!=1: errs.append('escape gap %s->%s'%(prev,p))
            if g[p[1]][p[0]] in set('#GLgVTbK|FP'): errs.append('escape through wall %s'%(p,))
            prev=p
    return errs

def sc(f):
    return [dict(x=x,y=y,face=fc,lit=(l is True),capped=(l=='capped')) for x,y,fc,l in f['sconces']]

def emit(n,f):
    g=f['grid']; rows=[]
    for y,r in enumerate(g):
        cells=[]
        for x,c in enumerate(r):
            t=ts_tile(c,f['overlay'].get((x,y),{}))
            if t.get('propPlacement')=='wall':
                ws=[d for d,(dx,dy) in (('N',(0,-1)),('E',(1,0)),('S',(0,1)),('W',(-1,0))) if g[y+dy][x+dx]=='#']
                t['propWall']=f['overlay'].get((x,y),{}).get('propWall', ws[0] if ws else None)
                print('  floor',n,(x,y),t['prop'],'walls',ws,'->',t['propWall'])
            cells.append(js(t))
        rows.append('    [ '+', '.join(cells)+' ]')
    notes='\n'.join('//   (%d,%d) %s'%(p[0],p[1],ov['note']) for p,ov in sorted(f['overlay'].items()) if 'note' in ov)
    out=f"""import type {{ FloorData }} from './types';

// Floor {n}: {f['name']} (Levie). Generated from levels/src/act1.py, edit the ASCII there and re-run.
// Map:
{chr(10).join('//   '+r for r in g)}
// Notes:
{notes}
export const floor{n}: FloorData = {{
  id: {n},
  sconces: {js(sc(f))},
  width: {len(g[0])},
  height: {len(g)},
  startX: {f['start'][0]},
  startY: {f['start'][1]},
  startDir: {f['startDir']},
  tiles: [
{(','+chr(10)).join(rows)}
  ]
}};

export const floor{n}Meta = {js(dict(name=f['name'], area=f['area'], ambience=f['ambience']))};
export const floor{n}Sconces = {js(sc(f))};
export const floor{n}Drips = {js([dict(x=x,y=y) for x,y in f['drips']])};
export const floor{n}Dark = {js([dict(x=x,y=y) for x,y in f['dark']])};
"""
    out+=f"export const floor{n}Puzzles = {js(f.get('puzzles',[]))};"+chr(10)
    if 'caveIn' in f: out+=f"export const floor{n}CaveIn = {js(f['caveIn'])};"+chr(10)
    if 'escape' in f: out+=f"export const floor{n}Escape = {js(f['escape'])};"+chr(10)
    open(f'../floor{n}.ts','w').write(out)

if __name__=='__main__':
    bad=False
    for n,f in FLOORS.items():
        e=check(n,f)
        print('floor',n,'OK' if not e else e); bad|=bool(e)
        if not e: emit(n,f)
    sys.exit(1 if bad else 0)
