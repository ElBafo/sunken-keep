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
DK=1.0
def build(dist,seed,fk=1.0,save=True):
    src=np.array(Image.open(D+f'wall_front_{dist}.png').convert('RGB')).astype(int)
    H,W=src.shape[:2]; s=W/160; r=random.Random(seed)
    P=np.unique(src.reshape(-1,3),axis=0); Pl=P.sum(1)
    order=np.argsort(Pl); dark=P[order[0]]; dark2=P[order[min(3,len(P)-1)]]
    WALLMEAN=src.mean(); DARK2=DK; RAMP=P[order]; RIDX={tuple(c):i for i,c in enumerate(RAMP)}
    STEP=max(1,len(RAMP)//8)   # one ramp step = 1/8 of the wall's luminance ramp
    def bump(c,n): return RAMP[min(len(RAMP)-1,RIDX[tuple(c)]+n*STEP)]
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
        k=r.choice((0,2)) if max(w,h)>1.6*min(w,h) else r.randrange(4); b=np.rot90(b,k); m=np.rot90(m,k)  # long slabs lie flat
        if r.random()<.5: b=b[:,::-1]; m=m[:,::-1]
        return b,m
    out=np.zeros_like(src); out[:]=dark
    # back layer: the collapsed mass behind, darker, many small chunks jammed together
    def place(b,m,x,y,k=1.0,outline=True):
        h,w=m.shape; b=shade(b,k) if k!=1 else b
        if outline:  # dark crack ring under the chunk, offset down-right (shadow)
            for dx,dy in ((1,1),):
                ys,xs=np.nonzero(m); ys=ys+y+dy; xs=xs+x+dx
                ok=(ys>=0)&(ys<H)&(xs>=0)&(xs<W); out[ys[ok],xs[ok]]=dark
        ys,xs=np.nonzero(m); c=b[ys,xs]; ys=ys+y; xs=xs+x
        ok=(ys>=0)&(ys<H)&(xs>=0)&(xs<W); out[ys[ok],xs[ok]]=c[ok]
    allb=[cut(b) for v in BLOCKS.values() for b in v]
    # plain stone only (bricks, base, caps, studs); knotwork limited to KNOT pieces
    plainbig=[cut(b) for k in ('base','cap','stud') for b in BLOCKS[k]]+[cut((32,114,80,126)),cut((80,114,128,126))]
    knot=[cut(b) for b in BLOCKS['panel'][:1]+BLOCKS['pillar'][1:2]]
    small=[cut(b) for k in ('brick','stud','base','cap') for b in BLOCKS[k]]
    plainall=plainbig+small
    def top(x): return H*1.3*abs(x/W-0.5)   # triangular cap: full height centre, 35% at edges
    # 1) back mass: dim chunks packed edge to edge over the whole square (stone deeper in the corridor)
    y=-2
    while y<H:
        x=-r.randint(0,8); rowh=0
        while x<W:
            b,m=chunk(r.choice(plainall),.5); h,w=m.shape
            if y>=max(top(x),top(x+w))-2*s: place(b,m,x,y+r.randint(-1,1),r.uniform(.83,.87))
            x+=w-r.randint(0,2); rowh=max(rowh,h)
        y+=max(3,int(rowh*.7))
    # 2) front pile, stacked with a skyline: each chunk drops until it rests on what is below it.
    surf=np.full(W,H+int(2*s))
    def drop(b,m,x,k):
        h,w=m.shape; cols=[c for c in range(w) if 0<=x+c<W and m[:,c].any()]
        if not cols: return False
        low={c:np.nonzero(m[:,c])[0].max() for c in cols}; hi_={c:np.nonzero(m[:,c])[0].min() for c in cols}
        y=min(surf[x+c]-low[c]-1 for c in cols)+int(s)   # sink 1px: chunks bite into each other
        if any(y+hi_[c]<top(x+c)-s for c in cols): return False   # strict per-column cap   # above pile outline
        bm=b[m].mean()
        if bm<WALLMEAN: b=np.array([[bump(c,2 if bm<DARK2*WALLMEAN else 1) for c in row] for row in b])  # +1 step, +2 on the darkest  # whole-block +1 step for dark blocks
        place(b,m,x,y,1.0)   # original shading kept inside the block
        # light catches the top face and the edge facing down the slope: +1/+2 ramp steps
        t=max(2,int(round(s*3))); right=(x+w/2)>W/2
        ys,xs=np.nonzero(m)
        for yy,xx in zip(ys,xs):
            X,Y=x+xx,y+yy
            if not(0<=X<W and 0<=Y<H): continue
            top_d=yy-hi_.get(xx,yy) if xx in hi_ else 99
            row=np.nonzero(m[yy])[0]; edge_d=(row.max()-xx) if right else (xx-row.min())
            if top_d<t: out[Y,X]=bump(out[Y,X],2 if top_d<t-1 else 1)
            elif edge_d<t: out[Y,X]=bump(out[Y,X],1)
        for c in cols: surf[x+c]=min(surf[x+c],y+hi_[c])
        return True
    pieces=[]
    for kb in knot[:KN[dist]]: pieces.append((0,chunk(kb,.6)))
    for _ in range(30): pieces.append((0,chunk(r.choice(plainbig),.6)))
    for _ in range(80): pieces.append((1,chunk(r.choice(plainbig),.35)))
    for _ in range(160): pieces.append((2,chunk(r.choice(small),.35)))
    pieces.sort(key=lambda p:(p[0],-p[1][1].sum()))
    for tier,(b,m) in pieces:
        w=m.shape[1]
        for _try in range(12):
            x=int(r.uniform(-.15,1.0)*W-w*.3)
            if drop(b,m,x,fk*[1.0,.95,.98][tier]*r.uniform(.93,1.05)): break
    # 3) grit: 1-3px crumbs of wall pixels lying on the pile surface and spilled on the floor
    for _ in range(int(50*s)):
        x=r.randrange(W); g=max(1,int(r.uniform(1,2.6)*s+.4))
        y=int(H-r.uniform(1,6)*s)
        sx=r.randrange(W-g); sy=r.randrange(H-g); gg=src[sy:sy+g,sx:sx+g]
        place(gg,np.ones((g,g),bool),x,y-g+1,.7,outline=False)
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
    if not save: return m1
    a=np.dstack([out,np.full((H,W),255)]).astype(np.uint8)
    Image.fromarray(a,'RGBA').save(D+f'rubble_front_{dist}.png'); return m1
KN={'near':2,'mid':1,'far':0}
# rubble now comes from scripts/build_rubble_from_source.py; set BUILD_RUBBLE=1 to rebuild the procedural version
for dist,seed in ((('near',11),('mid',12),('far',13)) if os.environ.get('BUILD_RUBBLE') else ()):
    m=build(dist,seed); w=np.array(Image.open(D+f'wall_front_{dist}.png').convert('RGB')).mean()
    print(f'{dist}: rubble mean {m:.1f}, wall mean {w:.1f}')
# dust burst, 160x140: stringy smeared wisps drifting down/out, dust.png colours + 17-step alpha
DUST=[(145,141,125),(188,184,168)]
os.makedirs('public/proto3d/fx',exist_ok=True)
r=random.Random(5)
# each wisp is a random-walk polyline from the collapse line, pushed out sideways and down
wisps=[]
for _ in range(40):
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
            th=2+int(t*3)   # thin strings, occasional 2px smear
            for k in range(th):
                for j in range(-2-int(t*5),3+int(t*5)):   # horizontal smear widens over time
                    xi=int(x+j); yi=int(y+k)
                    if 0<=xi<160 and 0<=yi<140 and rr.random()<.85-abs(j)*.07:
                        a=fade*life*max(0,1-abs(j)*.12)*(0.5 if w['hi'] else 0.36)
                        acc[yi,xi]=min(1,acc[yi,xi]+a*.5)
                        if w['hi'] and abs(j)<1 and fade>.5: hi[yi,xi]=True
    if f==5: acc*=.45   # last frame: faint leftover wisps, no bright streak pop after the soft cloud
    if f in (0,1,2,3,4):   # soft shapes: small dense burst (1-2) -> merged cloud (3-5) into 2-3 large soft drifting shapes
        rs=np.random.default_rng(7)
        cl=np.zeros((140,160)); yy,xx=np.mgrid[0:140,0:160]
        for (cx,cy,rx,ry,wt) in ((40,92,46,20,1.0),(118,88,44,22,.9),(80,112,52,16,.7))[:3 if f<4 else 3]:
            cx+=(-1 if cx<80 else 1)*(f-2)*8; cy+=(f-2)*6; g=[.45,.7,1,1.15,1.3][f]; rx*=g; ry*=g
            # warped, ragged edge: radius modulated by low-freq noise per angle and row
            ang=np.arctan2((yy-cy)/ry,(xx-cx)/rx); rad=np.hypot((xx-cx)/rx,(yy-cy)/ry)
            warp=1+.25*np.sin(3*ang+cx)+.18*np.sin(5*ang+cy)+.12*np.sin(yy*.35+cx)
            cl=np.maximum(cl,wt*np.clip(1-rad/warp,0,1)**.8)
        n=rs.random((140,160)); n=(n+np.roll(n,1,1)+np.roll(n,-1,1)+np.roll(n,2,1))/4   # horizontal smear grain
        k=[.53,.53,.53,.53,.53][f]
        acc=np.maximum(acc*.35,cl*k*(.75+.5*n)); hi[:]=False
        hi|=(cl>.75)&(n>.55)
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
