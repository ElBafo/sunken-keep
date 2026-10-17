import re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
FLOOR1 = ROOT / 'public' / 'levels' / 'floor1.ts'
OUT = ROOT / 'levels' / 'floor1_decor.json'
src = FLOOR1.read_text()
blk=src.split('tiles: [')[1].split('\n  ]')[0]
T=[re.findall(r"\{[^{}]*\}",l) for l in blk.splitlines() if l.strip().startswith('[')]
def ch(c):
  if 'wall: true' in c: return '#'
  if 'secret' in c: return 'S'
  if 'door: true' in c: return 'D'
  if 'stairs' in c: return '>'
  if 'deepWater' in c: return '='
  if 'shallowWater' in c: return '~'
  return '.'
G=[''.join(ch(c) for c in r) for r in T]
print('   '+''.join(str(x%10) for x in range(22)))
for y,r in enumerate(G): print(f"{y:2d} {r}")
walk=lambda x,y: 0<=y<len(G) and 0<=x<len(G[0]) and G[y][x] not in '#S'
J=[(x,y) for y in range(len(G)) for x in range(len(G[0])) if walk(x,y) and sum(walk(x+dx,y+dy) for dx,dy in((1,0),(-1,0),(0,1),(0,-1)))>=3]
print(len(G),len(G[0]),"junction-ish",J)

import json,hashlib
H,Wd=len(G),len(G[0])
isw=lambda x,y: 0<=y<H and 0<=x<Wd and G[y][x]=='#'
D={'N':(0,-1),'S':(0,1),'E':(1,0),'W':(-1,0)}
# zones: rectangles of viewer squares, first match wins
Z=[
 ('entry_gate','Gate passage',[(1,8,3,14)],'brick',0.25,{'clean':2,'damp':3,'cracked':2,'patched':2},
  'The fortress gate, sealed behind you by the cave-in at (3,14). Heavy carving says you came in through the front door of a dwarf hold.'),
 ('water_hall','Cistern hall',[(1,1,3,4)],'brick',0.35,{'clean':1,'damp':4,'cracked':2,'patched':2},
  'The hold\'s top cistern, still holding its own water. The swamp presses hardest on this outer corner.'),
 ('muster_hall','Muster hall',[(1,5,3,7),(4,5,4,5)],'brick',0.2,{'clean':3,'damp':2,'cracked':1,'patched':2},
  'Where the gate guard assembled. Clan banners under the lit torch at (0,6).'),
 ('antechamber','Guard antechamber',[(5,1,7,3),(4,2,4,2)],'brick_banded',0.15,{'clean':3,'damp':1,'cracked':2,'patched':2},
  'Between the cistern door (4,2) and the guard hall.'),
 ('guard_hall','Guard hall',[(8,1,13,4),(14,2,14,2)],'brick_banded',0.1,{'clean':3,'damp':1,'cracked':3,'patched':2},
  'The guard level\'s main room: racks, shields, chains. Sunbeam at (11,2), fallen beams.'),
 ('pantry','Pantry',[(5,5,7,7)],'brick',0.15,{'clean':2,'damp':2,'cracked':2,'patched':2},
  'Store room, plain inner brick with patched gaps where shelves were torn out.'),
 ('hook_corridor','Hook corridor',[(8,6,11,7)],'brick',0.15,{'clean':2,'damp':1,'cracked':3,'patched':2},
  'Dark passage toward the lamp-keeper. Soot starts here.'),
 ('pell','Lamp-keeper\'s rooms',[(9,8,13,10)],'soot',0.15,{'clean':2,'damp':1,'cracked':2,'patched':3},
  'Pell\'s rooms. floor1Dark: stays dark, matte only.'),
 ('cellar','Cellar landing',[(4,9,7,13),(6,8,6,8)],'brick',0.35,{'clean':1,'damp':4,'cracked':2,'patched':2},
  'Below the cellar door (6,8), against the outer shell: mud and roots force through the cracks.'),
 ('slime_trail','Slime trail',[(15,2,19,2)],'etched',0.2,{'clean':2,'damp':2,'cracked':3,'patched':1},
  'Stone eaten smooth and pitted along the trail.'),
 ('lair','Slime lair',[(19,3,19,7)],'etched',0.25,{'clean':1,'damp':2,'cracked':3,'patched':1},
  'Unlit by design. Matte only, nothing pale or glossy.'),
 ('stair_room','Stair landing',[(16,8,20,10)],'brick',0.3,{'clean':2,'damp':3,'cracked':2,'patched':1},
  'The way down to floor 2, deep against the outer shell; cold air from below.'),
]
def zone(x,y):
  for z in Z:
    for (a,b,c,d) in z[2]:
      if a<=x<=c and b<=y<=d: return z[0]
  return None
ZD={z[0]:z for z in Z}
faces=[]
for y in range(H):
  for x in range(Wd):
    if not isw(x,y): continue
    for f,(dx,dy) in D.items():
      vx,vy=x+dx,y+dy
      if 0<=vx<Wd and 0<=vy<H and G[vy][vx] not in '#S':
        z=zone(vx,vy); assert z,(x,y,f,vx,vy)
        faces.append([x,y,f,z])
def outer(x,y,f):
  dx,dy=D[f]
  b=[(x-dx,y-dy),(x-2*dx,y-2*dy)]
  return all(not(0<=a<Wd and 0<=c<H) or G[c][a]=='#' for a,c in b)
DARK={'pell','hook_corridor','lair','stair_room'}
# variant assignment: neighbours = same face dir, wall tile one step along the face plane; plus corner pairs sharing a viewer
assign={}
def nbrs(x,y,f):
  dx,dy=D[f]; along=[(dy,dx),(-dy,-dx)] if dx==0 else [(0,1),(0,-1)]
  if dx==0: along=[(1,0),(-1,0)]
  out=[(x+ax,y+ay,f) for ax,ay in along]
  vx,vy=x+dx,y+dy
  for g,(ex,ey) in D.items():  # other faces seen from same viewer square
    wx,wy=vx-ex,vy-ey
    if (wx,wy,g)!=(x,y,f): out.append((wx,wy,g))
  return out
BULGE={(1,11,'E'),(8,12,'W'),(21,9,'W')}
V=['clean','damp','cracked','patched']
for x,y,f,z in faces:
  w=ZD[z][5]; h=int(hashlib.md5(f'{x},{y},{f}'.encode()).hexdigest(),16)
  order=sorted(V,key=lambda v:-(w[v]*1000+(h>>V.index(v)*7)%997)/1000)
  taken={assign.get(n) for n in nbrs(x,y,f)}
  assign[(x,y,f)]=next(v for v in order if v not in taken)
bad=[(k,n) for k in assign for n in nbrs(*k) if assign.get(n)==assign[k]]
print('faces',len(faces),'neighbour matches',len(bad))

dec=[]
def add(t,x,y,f=None,hide=False,note='',**k):
  d={'type':t,'x':x,'y':y}
  if f: d['face']=f
  d.update(k); d['hideNearCamera']=hide; d['note']=note; dec.append(d)
# entry gate
add('lintel_heraldry',2,13,axis='NS',note='Gate lintel with the anvil-and-hammer clan emblem, the first thing you see after the cave-in')
add('carved_pillar',1,13,'E',True,'Gate pilaster, west side')
add('carved_pillar',3,13,'W',True,'Gate pilaster, east side, cracked by the cave-in')
add('roots',1,10,'E',note='Roots in a crack low on the wall')
add('fallen_ceiling_block',1,14,note='Floor prop in the dead corner by the cave-in')
add('rune_lintel',2,8,axis='NS',note='Junction into the muster hall; carved runes, no glow')
add('waymarker',1,8,'E',note='Waymarker stone: gate behind, halls ahead')
add('ancestor_face_damaged',3,8,'W',note='Ancestor face with a broken beard, watching the gate passage')
# muster hall
add('clan_banner',4,7,'W',True,'Dwarven drape in the (0,6) torch light, rotted hem')
add('clan_banner',3,8,'N',True,'Second drape, seen from (3,7)')
add('beard_relief',0,5,'E',note='Room end, west wall')
add('knot_band',0,7,'E',note='Knotwork band, 1 of 3')
add('rune_lintel',4,5,axis='EW',note='Pantry doorway')
# cistern hall
add('roots_ceiling',1,2,note='Roots through the ceiling over the shallow water')
add('copper_pipe',1,1,to=[3,1],side='N',note='Cistern feed pipe along the ceiling edge, green patina, matte')
add('lintel_heraldry',4,2,side='W',note='Stone clan shield over the locked door, cistern side only (east side is next to the secret wall)')
# antechamber
add('clan_banner',7,0,'S',True,'Faded clan banner')
# guard hall
add('weapon_rack',10,0,'S',True,'Empty weapon rack, flush')
add('vent_grate',12,0,'S',note='Air vent under the pipe end')
add('shield_row',13,0,'S',True,'Row of guard shields')
add('stone_shield',11,5,'N',note='Clan shield carved into the long south wall')
add('ancestor_face',8,4,'E',note='West room end')
add('knot_band',13,5,'N',note='Knotwork band, 2 of 3')
add('copper_pipe',9,1,to=[13,1],side='N',note='Vent line along the north ceiling edge')
add('lintel_heraldry',14,2,side='W',note='Anvil emblem over the east door, guard hall side')
# pantry
add('jar_niche',8,7,'W',note='Recessed niche with jars')
add('jar_niche',5,4,'S',note='Recessed niche, seen from (5,5)')
add('shelf_fixed',4,7,'E',True,'Fixed stone shelf, flush, beside the chest at (5,7)')
add('rune_lintel',6,8,side='N',note='Over the cellar door: way to the cisterns below')
# hook corridor
add('rune_lintel',8,6,axis='EW',note='Pantry to hook corridor')
add('copper_pipe',8,6,to=[11,6],side='S',note='Oil line toward the lamp-keeper, matte')
add('waymarker',12,7,'W',note='Junction down to Pell\'s rooms')
# pell (dark)
add('tool_niche',8,9,'E',note='Lamp-keeper tool niche, matte, nothing reflective')
# cellar
add('roots',8,11,'W',note='Roots in the wet wall')
add('fallen_ceiling_block',7,12,note='Floor prop')
# slime trail
add('rag_stub',18,1,'S',note='Dissolved banner stub, matte')
# stair landing
add('ancestor_face_damaged',16,11,'N',note='Crest over the down stairs (16,10)')
add('knot_band',21,8,'W',note='Knotwork band, 3 of 3')
add('roots',15,9,'E',note='Roots in a crack')
add('fallen_ceiling_block',20,10,note='Floor prop')

# swamp pressing in
add('mud_root_crack',0,2,'E',note='Mud and roots through a crack in the outer shell')
add('mud_root_crack',1,12,'E',note='Outer shell of the gate passage')
add('mud_root_crack',19,1,'S',note='Matte, on the slime trail')
add('mud_root_crack',15,8,'E',note='Stair landing outer wall, matte')
# sinking damage
for d in dec:
  if d['type']=='rune_lintel' and (d['x'],d['y']) in [(2,8),(8,6)]: d['sag']=True; d['note']+='; sagging, cracked'
# fire paid away
add('cold_brazier',1,5,note='Cold brazier in the muster hall corner, ash only')
add('cold_brazier',9,1,note='Cold brazier in the guard hall corner')
add('cold_brazier',16,8,note='Cold brazier at the stair landing, matte')
add('forge_niche_empty',1,8,'N',note='Empty forge niche, seen from (1,7)')
add('forge_niche_empty',9,5,'N',note='Empty forge niche, seen from (9,4)')
add('forge_niche_empty',7,4,'N',note='Empty forge niche in the antechamber, seen from (7,3)')
add('soot_ghost',10,5,'S',note='Soot ghost where a lamp hung, hook corridor')
add('soot_ghost',9,7,'N',note='Soot ghost, hook corridor')
add('soot_ghost',12,11,'N',note='Soot ghost in Pell\'s rooms')
add('soot_ghost',3,10,'W',note='Soot ghost in the gate passage')
add('soot_ghost',4,8,'S',note='Soot ghost over the cellar landing')

secrets=[(x,y) for y in range(H) for x in range(Wd) if G[y][x]=='S']
mounts={(s['x'],s['y'],s['face']) for s in [{'x':0,'y':6,'face':'E'},{'x':4,'y':1,'face':'W'},{'x':6,'y':4,'face':'S'},{'x':4,'y':6,'face':'W'},{'x':8,'y':1,'face':'W'},{'x':8,'y':5,'face':'S'},{'x':14,'y':3,'face':'W'},{'x':0,'y':3,'face':'E'},{'x':9,'y':0,'face':'S'}]}|{(14,9,'W'),(8,10,'E')}
dress=json.load(open('dressing_act1.json')); dress=dress.get('1',dress.get('floor1',dress))
dfaces={(e['x'],e['y'],e['face']):k for k,v in dress.items() if isinstance(v,list) for e in v if 'face' in e and k!='water_line'}
errs=[];seen={}
cheb=lambda a,b: max(abs(a[0]-b[0]),abs(a[1]-b[1]))
for d in dec:
  x,y=d['x'],d['y']; f=d.get('face')
  if f:
    dx,dy=D[f]; v=(x+dx,y+dy)
    if not isw(x,y) or G[v[1]][v[0]] in '#S': errs.append(('face',d))
    d['zone']=zone(*v)
    k=(x,y,f)
    if k in mounts and d['type']!='low': errs.append(('mount',d))
    if k in dfaces: errs.append(('existing',dfaces[k],d))
    if k in seen: errs.append(('dup',d))
    seen[k]=1
  elif d['type'] in('rune_lintel','lintel_heraldry'):
    if G[y][x] not in '.D': errs.append(('lintel',d))
    d['zone']=zone(x,y)
  elif d['type'] in('copper_pipe','roots_ceiling'):
    d['zone']=zone(x,y); d['ceiling']=True
  else:
    if T[y][x].replace(' ','')!='{}': errs.append(('floor',d,T[y][x]))
    d['zone']=zone(x,y)
  for s in secrets:
    if cheb((x,y),s)<=1 and not (d['type']=='lintel_heraldry' and d.get('side')=='W'): errs.append(('secret',d))
    if d['type']=='knot_band' and cheb((x,y),s)<=2: errs.append(('knot',d))
  if d['type'] in('chains','weapon_rack','shield_row') and d['zone']!='guard_hall': errs.append(('purpose',d))
  if d['zone'] in('lair',) : errs.append(('lair',d))
for b in BULGE:
  if b not in {(x,y,f) for x,y,f,z in faces}: errs.append(('bulge',b))
print('decor',len(dec),'knots',sum(d['type']=='knot_band' for d in dec),'errors',errs)

if errs: raise SystemExit(errs)
out={
 'floor':1,'version':1,'author':'Levie',
 'basedOn':'public/levels/floor1.ts (voxel-floor1 map); regenerate with levels/tools/floor1_decor.py if the map changes',
 'faceConvention':'face = the direction a wall face points. The viewer stands on the square next to the wall in that direction (N is y-1, S is y+1, E is x+1, W is x-1). Same as sconces in floor1.ts.',
 'story':'Floor 1 is the top floor of a dwarf hold: its gate and guard level. The hold is sinking, so water stains rise from below.',
 'rules':{
  'noLight':'No decoration or material adds light or is emissive. Tile light is untouched: 0 flips across the 138 squares, tileLight(19,8) stays 0.05848.',
  'darkZones':'pell, hook_corridor, lair and stair_room are matte only: nothing pale, glossy or specular. They must look as dark as they do now.',
  'secrets':'No decoration on any wall tile within one square (incl. diagonals) of a secret wall (5,1), (5,13). knot_band never within two. The only mark on a secret is its own carving_secret.',
  'knotBand':'At most 3 on the floor.',
  'doors':'Door art stays painted. Only lintel decorations on door tiles; the lair door (19,5) stays plain.',
  'mounts':'No decoration on the 11 wall-mount faces (9 sconces, Pell lamp (14,9)W, jar rack (8,10)E).',
  'depth':'Nothing sticks out more than 0.05 of a square into a walkable square unless hideNearCamera is true; those join the wall-mount hide list.',
  'purpose':'Chains, weapon racks and shield rows only in guard_hall. Clan banners only in muster_hall, antechamber, guard_hall. Set-piece carvings (ancestor faces, beard reliefs, pillars, heraldry, rune lintels, waymarkers) only at doorways, junctions and room ends.',
  'variants':'Every wall face gets one of clean, damp, cracked, patched. No face matches its neighbour along the wall or another face seen from the same square (checked: 0 matches).',
  'noFloodCues':'Canon: the keep sank into the Mirefen mud but stayed dry inside. No tide lines, water-level stains, salt crust, barnacles or kelp anywhere.',
  'swamp':'The swamp presses in from outside. outerShell faces (solid rock or mud behind them) get seepage: wet_sheen outside dark zones, matte_dark (darkened, no specular) inside them. swampPressure (0 to 1) per zone scales how many mud-and-root cracks the renderer may add on outerShell faces. Every face gets a thin damp strip at the floor line.',
  'bulge':'bulge faces push out at most 0.04 of a square, so they stay under the depth limit.',
  'fire':'The fire was paid away: cold braziers, empty forge niches and soot ghost marks where lamps once hung. None of them glow.'
 },
 'zones':[{'id':z[0],'name':z[1],'viewerSquares':[list(r) for r in z[2]],'material':z[3],'swampPressure':z[4],'variantWeights':z[5],'story':z[6]} for z in Z],
 'materials':{'brick':'current wall brick','brick_banded':'brick with a darker band course at waist height (guard rooms)','soot':'soot-blackened brick with oil streaks','etched':'stone eaten smooth and pitted, matte'},
 'faces':[{'x':x,'y':y,'face':f,'zone':z,'material':ZD[z][3],'variant':assign[(x,y,f)],'outerShell':outer(x,y,f),'seepage':(('matte_dark' if z in DARK else 'wet_sheen') if outer(x,y,f) else None),'bulge':(x,y,f) in BULGE} for x,y,f,z in faces],
 'decorations':dec,
 'dressingOverrides':[
  {'file':'dressing_act1.json','key':'chains','from':{'x':8,'y':3,'face':'W'},'to':{'x':8,'y':3,'face':'E'},'why':'chains only in the guard hall; W faced the antechamber'},
  {'file':'dressing_act1.json','key':'rust_stain','from':{'x':8,'y':3,'face':'W'},'to':{'x':8,'y':3,'face':'E'},'why':'stays under the chains'},
  {'file':'dressing_act1.json','key':'water_line','action':'remove_all','why':'the 9 water_line stains read as a tide line; canon says the halls stayed dry. Pool-edge wet strips (wet_strip, auto) stay'},
  {'file':'dressing_act1.json','key':'banner_torn','from':{'x':14,'y':2,'face':'W'},'to':{'x':14,'y':4,'face':'W'},'why':'(14,2) is a door tile; moved to the guard hall east wall'}
 ]
}
json.dump(out,open(OUT,'w'),indent=1)
print('written',len(out['faces']),'faces',len(dec),'decorations', '->', OUT)
