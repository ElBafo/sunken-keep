# Floor 1 floor + ceiling variant map (Levie). For the floor/ceiling PR, not #59.
import re,json,hashlib
src=open('floor1.ts').read()
blk=src.split('tiles: [')[1].split('\n  ]')[0]
T=[re.findall(r"\{[^{}]*\}",l) for l in blk.splitlines() if l.strip().startswith('[')]
H,W=len(T),len(T[0])
def kind(c):
  if 'wall: true' in c: return 'wall'
  if 'deepWater' in c or 'shallowWater' in c: return 'water'
  return 'floor'   # floor, door, secret (once opened), stairs
K={(x,y):kind(T[y][x]) for y in range(H) for x in range(W)}
sq=[p for p,k in K.items() if k!='wall']
N4=lambda x,y:[(x+1,y),(x-1,y),(x,y+1),(x,y-1)]
hv=lambda *a:int(hashlib.md5(repr(a).encode()).hexdigest(),16)
water={p for p in sq if K[p]=='water'}
edge={p for p in sq if p not in water and any(q in water for q in N4(*p))}
CAP={'floor_stone':0.20,'floor_stone_4':0.20}
W_F={'floor_stone':1,'floor_stone_2':3,'floor_stone_3':4,'floor_stone_4':1}
nfree=len(sq)-len(water)
floor={}
for p in water: floor[p]='floor_water'
for p in edge: floor[p]='floor_stone'
cnt={'floor_stone':len(edge)}
for p in sorted([p for p in sq if p not in floor],key=lambda p:hv('f',p)):
  nb={floor.get(q) for q in N4(*p)}
  opts=[t for t in W_F if t not in nb and cnt.get(t,0)<CAP.get(t,1)*nfree] or [t for t in W_F if t not in nb]
  t=min(opts,key=lambda t:(cnt.get(t,0)/W_F[t],hv('t',p,t)))
  floor[p]=t; cnt[t]=cnt.get(t,0)+1
ceil={}
for p in sorted(sq,key=lambda p:(p[1],p[0])):
  nb={ceil.get(q) for q in N4(*p)}
  opts=[t for t in ('ceiling_2','ceiling_3','ceiling_4') if t not in nb]
  t=min(opts,key=lambda t:(sum(1 for v in ceil.values() if v==t),hv('ct',p,t)))
  ceil[p]=t
# checks
fm=sum(1 for p in sq for q in N4(*p) if q in floor and floor[q]==floor[p] and floor[p] not in('floor_water',) and not (p in edge and q in edge))
cm=sum(1 for p in sq for q in N4(*p) if q in ceil and ceil[q]==ceil[p])
out={'version':1,'floor':'floor1','for':'floor/ceiling PR (after #59), textures in art/floor_ceiling_floor1/',
 'rules':{'floor':'floor_water locked on cistern and cellar pool squares; floor_stone locked only on squares directly touching water (wider ring waits for the T-repeat fix). Elsewhere floor_stone_2/_3/_4 plus floor_stone, no 4-neighbour match, floor_stone and floor_stone_4 each capped at 20% of non-water squares.',
          'ceiling':'ceiling_2/_3/_4 only (ceiling.png dropped), no 4-neighbour match. Overlays sit on top: sunbeam crack at daylight (11,2), roots at (1,2), copper pipes along y=1 (1-3, 9-13) and y=6 (8-11).'},
 'squares':[{'x':x,'y':y,'floor':floor[(x,y)],'ceiling':ceil[(x,y)]} for (x,y) in sorted(sq,key=lambda p:(p[1],p[0]))]}
json.dump(out,open('floor1_floorceil.json','w'),indent=1)
from collections import Counter
print(len(sq),'squares',len(water),'water',len(edge),'edge')
print(Counter(floor.values()));print(Counter(ceil.values()))
print('floor matches (excl. locked water/edge runs)',fm,'ceiling matches',cm)
for y in range(H): print(''.join({'floor_water':'~','floor_stone':'1','floor_stone_2':'2','floor_stone_3':'3','floor_stone_4':'4'}.get(floor.get((x,y)),'#') for x in range(W)))
