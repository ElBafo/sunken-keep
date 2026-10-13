# Cave-in rubble front wall (near/mid/far) + 6-frame dust burst. Deterministic.
# Rubble = real carved blocks cut out of wall_front_<dist>.png (whole blocks with their
# mortar edges/shading), chipped into irregular chunks, only flipped / rot90'd (no
# resampling), stacked into a collapse. Every pixel is a wall_front colour; fully opaque.
import os,random,math
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
from PIL import Image
import numpy as np
D='public/art/dungeon_v2/'
# source blocks in near-space (160x140) coords: x0,y0,x1,y1
BLOCKS={'cap':[(0,0,32,24),(128,0,160,24)],
 'frieze':[(32,0,80,22),(80,0,128,22)],
 'stud':[(2,22,30,32),(130,22,158,32)],
 'pillar':[(3,32,29,74),(3,74,29,116),(131,32,157,74),(131,74,157,116)],
 'panel':[(34,26,80,71),(80,26,126,71),(34,71,80,116),(80,71,126,116)],
 'brick':[(32+12*i,114,44+12*i,126) for i in range(8)],
 'base':[(0,125,40,140),(40,125,80,140),(80,125,120,140),(120,125,160,140)]}
def build(dist,seed):
    src=np.array(Image.open(D+f'wall_front_{dist}.png').convert('RGB')).astype(int)
    H,W=src.shape[:2]; s=W/160; r=random.Random(seed)
    P=np.unique(src.reshape(-1,3),axis=0); Pl=P.sum(1)
    order=np.argsort(Pl); dark=P[order[0]]; dark2=P[order[min(3,len(P)-1)]]
    def quant(img):  # snap to nearest wall colour
        f=img.reshape(-1,1,3); i=((f-P[None])**2).sum(2).argmin(1); return P[i].reshape(img.shape)
    def shade(img,k): return quant(np.clip(img*k,0,255))
    def cut(rect):
        x0,y0,x1,y1=[int(round(v*s)) for v in rect]; return src[y0:y1,x0:x1].copy()
    def chunk(blk,minfrac=.45):
        h,w=blk.shape[:2]
        # break off a random sub-piece (keeps at least one original mortar edge)
        cw=max(2,int(w*r.uniform(minfrac,1))); ch=max(2,int(h*r.uniform(minfrac,1)))
        x=r.choice([0,w-cw]); y=r.choice([0,h-ch]); b=blk[y:y+ch,x:x+cw]
        m=np.ones(b.shape[:2],bool); h,w=m.shape
        for cx,cy in ((0,0),(1,0),(0,1),(1,1)):        # chipped corners
            if r.random()<.7:
                a=r.randint(1,max(1,min(w,h)//2)); bb=r.randint(1,max(1,min(w,h)//2))
                for yy in range(bb):
                    for xx in range(int(a*(1-yy/bb))):
                        m[h-1-yy if cy else yy, w-1-xx if cx else xx]=False
        side=r.randrange(4); depth=max(1,min(w,h)//5); v=0   # jagged break edge
        n=w if side<2 else h
        for i in range(n):
            v=max(0,min(depth,v+r.choice((-1,0,1))))
            if side==0: m[:v,i]=False
            elif side==1: m[h-v:,i]=False
            elif side==2: m[i,:v]=False
            else: m[i,w-v:]=False
        k=r.randrange(4); b=np.rot90(b,k); m=np.rot90(m,k)
        if r.random()<.5: b=b[:,::-1]; m=m[:,::-1]
        return b,m
    out=np.zeros_like(src); out[:]=dark
    # back layer: the collapsed mass behind, darker, many small chunks jammed together
    def place(b,m,x,y,k=1.0,outline=True):
        h,w=m.shape; b=shade(b,k) if k!=1 else b
        if outline:  # dark crack ring under the chunk, offset down-right (shadow)
            for dx,dy in ((1,1),(1,0),(0,1)):
                ys,xs=np.nonzero(m); ys=ys+y+dy; xs=xs+x+dx
                ok=(ys>=0)&(ys<H)&(xs>=0)&(xs<W); out[ys[ok],xs[ok]]=dark
        ys,xs=np.nonzero(m); c=b[ys,xs]; ys=ys+y; xs=xs+x
        ok=(ys>=0)&(ys<H)&(xs>=0)&(xs<W); out[ys[ok],xs[ok]]=c[ok]
    allb=[cut(b) for v in BLOCKS.values() for b in v]
    big=[cut(b) for k in ('panel','pillar','frieze','cap') for b in BLOCKS[k]]
    small=[cut(b) for k in ('brick','stud','base','cap','frieze') for b in BLOCKS[k]]
    def top(x): return H*(0.30+0.75*abs(x/W-0.5)**1.5)   # pile surface: high centre, spreads wide at the base
    # 1) back mass: dim chunks packed edge to edge over the whole square (stone deeper in the corridor)
    y=-2
    while y<H:
        x=-r.randint(0,8); rowh=0
        while x<W:
            b,m=chunk(r.choice(allb),.5); h,w=m.shape
            place(b,m,x,y+r.randint(-1,1),r.uniform(.48,.6)); x+=w-r.randint(0,2); rowh=max(rowh,h)
        y+=max(3,int(rowh*.7))
    # 2) front pile, stacked with a skyline: each chunk drops until it rests on what is below it.
    surf=np.full(W,H+int(2*s))
    def drop(b,m,x,k):
        h,w=m.shape; cols=[c for c in range(w) if 0<=x+c<W and m[:,c].any()]
        if not cols: return False
        low={c:np.nonzero(m[:,c])[0].max() for c in cols}; hi_={c:np.nonzero(m[:,c])[0].min() for c in cols}
        y=min(surf[x+c]-low[c]-1 for c in cols)+int(s)   # sink 1px: chunks bite into each other
        if y+min(hi_.values())<min(top(x+c) for c in cols)-2*s: return False   # above pile outline
        place(b,m,x,y,k)
        for c in cols: surf[x+c]=min(surf[x+c],y+hi_[c])
        return True
    pieces=[]
    for _ in range(14): pieces.append((0,chunk(r.choice(big),.55)))
    for _ in range(40): pieces.append((1,chunk(r.choice(big),.3)))
    for _ in range(90): pieces.append((2,chunk(r.choice(small),.35)))
    pieces.sort(key=lambda p:(p[0],-p[1][1].sum()))
    for tier,(b,m) in pieces:
        w=m.shape[1]
        for _try in range(6):
            x=int(r.uniform(-.15,1.0)*W-w*.3)
            if drop(b,m,x,[1.15,1.08,1.12][tier]*r.uniform(.93,1.05)): break
    # 3) grit: 1-3px crumbs of wall pixels lying on the pile surface and spilled on the floor
    for _ in range(int(160*s)):
        x=r.randrange(W); g=max(1,int(r.uniform(1,2.6)*s+.4))
        y=int(min(H-1,surf[x]+r.uniform(-1,1)*s)) if r.random()<.6 else int(H-r.uniform(1,8)*s)
        sx=r.randrange(W-g); sy=r.randrange(H-g); gg=src[sy:sy+g,sx:sx+g]
        place(gg,np.ones((g,g),bool),x,y-g+1,1.0,outline=True)
    # 6) a few irregular dark cracks between blocks (no light through)
    for _ in range(int(5+3*s)):
        x=r.uniform(.1,.9)*W; y=r.uniform(.15,.85)*H; L=int(r.uniform(5,14)*s)
        dx=r.choice((-1,1))
        for i in range(L):
            xi,yi=int(x),int(y)
            if 0<=xi<W-1 and 0<=yi<H: out[yi,xi]=dark; 
            if s>.7 and 0<=xi+1<W and 0<=yi<H and i%3: out[yi,xi+1]=dark
            if r.random()<.6: y+=1
            else: x+=dx
            if r.random()<.15: dx=-dx
    # match overall brightness to the wall
    m0=src.mean(); m1=out.mean()
    print(dist,'wall mean',round(m0,1),'rubble mean',round(m1,1))
    # no global rescale (it flattens the depth); report the difference instead
    a=np.dstack([out,np.full((H,W),255)]).astype(np.uint8)
    Image.fromarray(a,'RGBA').save(D+f'rubble_front_{dist}.png')
for dist,seed in (('near',11),('mid',12),('far',13)): build(dist,seed)
# dust burst, 160x140: stringy smeared wisps drifting down/out, dust.png colours + 17-step alpha
DUST=[(145,141,125),(188,184,168)]
os.makedirs('public/proto3d/fx',exist_ok=True)
r=random.Random(5)
# each wisp is a random-walk polyline from the collapse line, pushed out sideways and down
wisps=[]
for _ in range(64):
    x=r.uniform(20,140); y=r.uniform(40,95); side=1 if x>80 else -1
    wisps.append(dict(x=x,y=y,vx=side*r.uniform(.4,1.6),vy=r.uniform(.2,1.0),
        ang=r.uniform(-.6,.6)+(0 if side>0 else math.pi),L=r.uniform(14,40),hi=r.random()<.3,seed=r.random()))
def frame(f):
    acc=np.zeros((140,160)); hi=np.zeros((140,160),bool)
    life=[0.6,0.85,1.0,1.0,0.6,0.3][f]  # burst, burst, peak, peak, thin (skip still), thin
    t=f/5
    for w in wisps:
        rr=random.Random(w['seed']+f*.0001*0)  # same shape each frame, just drifts/stretches
        x=w['x']+w['vx']*f*5; y=w['y']+w['vy']*f*6+f*f*.4
        ang=w['ang']+.25*math.sin(w['seed']*9); L=w['L']*(.5+t*1.1)
        n=int(L)
        for i in range(n):
            ang+=rr.uniform(-.35,.35); x+=math.cos(ang); y+=math.sin(ang)*.5+.25+t*.3
            fade=(1-i/n)**.7
            th=1+int(rr.random()<.35)   # thin strings, occasional 2px smear
            for k in range(th):
                for j in range(-1-int(t*2),2+int(t*2)):   # horizontal smear widens over time
                    xi=int(x+j); yi=int(y+k)
                    if 0<=xi<160 and 0<=yi<140 and rr.random()<.75-abs(j)*.12:
                        a=fade*life*(1-abs(j)*.25)*(0.85 if w['hi'] else 0.6)
                        acc[yi,xi]=max(acc[yi,xi],a)
                        if w['hi'] and abs(j)<1 and fade>.5: hi[yi,xi]=True
    a=(np.clip(acc,0,221/255)*255/17).astype(int)*17
    im=np.zeros((140,160,4),np.uint8)
    for c,msk in ((DUST[0],~hi),(DUST[1],hi)):
        sel=msk&(a>0); im[sel,:3]=c; im[sel,3]=a[sel]
    Image.fromarray(im,'RGBA').save(f'public/proto3d/fx/dust_burst_{f+1}.png')
for f in range(6): frame(f)
# timing (t=0 at the crash; view turn 0-0.45 s)
TIMING=[(1,0.0,'burst (during view turn)'),(2,0.2,'burst (during view turn)'),(3,0.45,'full cloud, peak as turn ends'),
        (4,0.8,'full cloud'),(5,1.2,'thinning; also the still shown after a skip'),(6,1.6,'thinning, gone by ~2.0 s')]
print('frame  start   phase')
for n,t,p in TIMING: print(f'dust_burst_{n}  {t:4.2f} s  {p}')
