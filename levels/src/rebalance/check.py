import collections
from f1v2 import *
W=len(G[0]);assert all(len(r)==W for r in G),[len(r) for r in G]
BL=set('#FPDS')
# apply cave-in: rubble is solid; measure from the post-scene position
G=[''.join('R' if (x,y) in RUBBLE else ch for x,ch in enumerate(r)) for y,r in enumerate(G)]
ORIGIN=AFTER_CAVE
def bfs(s,block):
    d={s:0};q=collections.deque([s])
    while q:
        x,y=q.popleft()
        for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
            n=(x+dx,y+dy)
            if n not in d and G[n[1]][n[0]] not in block: d[n]=d[(x,y)]+1;q.append(n)
    return d
d=bfs(ORIGIN,set('#FPR'))  # doors open
for p,m in MON.items(): print(m,p,'steps',d.get(p))
for p in list(ITEM)+list(TRIG):
    if p not in d and p not in RUBBLE and G[p[1]][p[0]] not in 'PS': print('UNREACH',p)
nk=bfs(ORIGIN,set('#FPDR'))
print('key w/o locked door',(2,5) in nk, 'stairs',d.get((16,10)))
if __name__=='__main__':
    WAY=[ORIGIN,(7,5),(7,9),(4,10),(5,11),(7,13),(4,13),(6,6),(5,7),(7,7),(2,5),(3,2),(6,3),(5,3),(9,4),(10,1),(12,3),(12,8),(13,9),(19,4),(19,7),(16,10)]
    print('nearest monster',min(d[p] for p in MON),'route',sum(bfs(a,set('#FPR'))[b] for a,b in zip(WAY,WAY[1:])))
