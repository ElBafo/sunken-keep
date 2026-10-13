# Chest (closed + open, near/mid/far) from the painted sources art/src/chest_{closed,open}_src.jpg,
# same pipeline as build_rubble_from_source.py: cut the chest out along a hand-traced outline
# (floor + background -> transparent) -> ONE BOX scale-down per size from the source -> quantize
# to that distance's dungeon_v2/wall_front colours (+ up to 2 brighter ramp steps for lit edges),
# no dither -> 1px dark silhouette outline + lit top edges. Brightness ~0.92 of wall_front.
# Closed and open share one scale and one base box: centred body, base on the bottom row, closed
# chest about as tall as the old one. Ramp also has 4 warm shades (forge orange #e08a3c darkened)
# for wood/rust. Far size gets a hand-drawn pass (bands, lock, recess, lit rim).
# python3 scripts/build_chest_from_source.py
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
from PIL import Image, ImageDraw
import numpy as np
D='public/art/dungeon/'; W='public/art/dungeon_v2/'
# outlines in 640x360 view coords of the 1280x720 sources (x2 when used)
POLY={'closed':[(148,92),(158,68),(200,66),(470,68),(495,74),(508,90),(513,130),(512,258),(500,280),(450,298),(440,298),(150,278),(145,270)],
      'open':[(172,38),(180,30),(490,30),(505,38),(513,60),(512,150),(502,170),(500,275),(450,302),(148,285),(142,275),(142,182),(160,172),(190,165),(185,60)]}
# per distance: frame size, closed-chest height (about the old chest's height); centred, base on bottom row
FOOT={'near':((80,60),40),'mid':((50,40),27),'far':((30,25),16)}
MARGIN=2
# warm wood/rust shades: the game's forge-orange accent #e08a3c (inventory-ui.ts) darkened
FORGE=np.array([0xe0,0x8a,0x3c]); WARM_K=(0.10,0.17,0.26,0.38)
BODY_X={'closed':(145,513),'open':(142,513)}   # body left/right in view coords -> same width in both
TARGET=0.92
IRON_SAT,IRON_L=0.55,110
def cut(n):
    src=Image.open(f'art/src/chest_{n}_src.jpg').convert('RGB'); S=4
    m=Image.new('L',(1280*S,720*S),0); ImageDraw.Draw(m).polygon([(x*2*S,y*2*S) for x,y in POLY[n]],fill=255)
    m=m.resize((1280,720),Image.BOX)
    xs=[p[0]*2 for p in POLY[n]]; ys=[p[1]*2 for p in POLY[n]]
    bb=(min(xs),min(ys),max(xs),max(ys))
    return src.crop(bb),m.crop(bb),bb
def simplify_far(n,o,op,RAMP,step,target):
    # hand pass for the 25x16 chest: blur from the BOX average turns bands/lock into a lump,
    # so redraw them as clear 1px marks over the quantized paint; plank pattern picked to hit target
    op=op.copy(); h,w=op.shape; ys,xs=np.nonzero(op); Y1=ys.max()
    for y in (Y1,Y1-1):                                   # bottom notch: give the base rows the row above's span
        xa=np.nonzero(op[y-1])[0]; op[y,xa.min():xa.max()+1]=True
    ys,xs=np.nonzero(op); X0,X1,Y0,Y1=xs.min(),xs.max(),ys.min(),ys.max()
    S=RAMP.sum(1); warm=[i for i in range(len(RAMP)) if RAMP[i][0]-RAMP[i][2]>8 and RAMP[i][0]>RAMP[i][1]+2]
    grey=[i for i in range(len(RAMP)) if i not in warm]
    dark=RAMP[grey[min(step,len(grey)-1)]]; lit=RAMP[warm[-1]]; lit2=RAMP[warm[-2]]
    iron=RAMP[min(grey,key=lambda i:abs(S[i]/3-1.6*target))]
    bw=X1-X0; body_top=Y0 if n=='closed' else Y0+int((Y1-Y0)*0.38)
    pad=np.pad(op,1); edge=op&~(pad[:-2,1:-1]&pad[2:,1:-1]&pad[1:-1,:-2]&pad[1:-1,2:])
    best=None
    for wi,di in ((2,0),(3,0),(2,1),(3,1),(1,0),(2,2),(3,2)):
        for per in (2,3,4):
            wood,woodd=RAMP[warm[wi]],RAMP[warm[di]]; o2=np.zeros_like(o)
            for y in range(h):
                for x in range(w):
                    if not op[y,x]: continue
                    if n=='open' and y<body_top and not (x in (X0,X0+1,X1,X1-1) or y<=Y0+1): o2[y,x]=RAMP[grey[0]]  # recess
                    else: o2[y,x]=wood if (y-Y0)%per==1 else woodd                                                    # planks
            for fx in (0.13,0.33,0.67,0.87):                                                  # iron bands
                bx=X0+round(bw*fx); o2[body_top+1:Y1,bx][op[body_top+1:Y1,bx]]=iron
            lx=X0+bw//2; ly=body_top+max(2,(Y1-body_top)//3)                                  # lock plate + keyhole
            o2[ly:ly+3,lx-1:lx+2]=iron; o2[ly+1,lx]=dark
            for x in range(X0+1,X1):
                if op[body_top+1,x]: o2[body_top+1,x]=lit                                    # lit rim
                if n=='open' and op[Y0+1,x]: o2[Y0+1,x]=lit2                                  # lid top lit warm
            o2[edge]=dark
            m=o2[op].mean(); 
            if best is None or abs(m-target)<abs(best[0]-target): best=(m,o2)
    return best[1],op
def ramp(dist):
    wall=np.array(Image.open(W+f'wall_front_{dist}.png').convert('RGB')).astype(int)
    P=np.unique(wall.reshape(-1,3),axis=0); P=P[np.argsort(P.sum(1))]
    top=P[-1].astype(float); ext=[np.clip(np.round(top*(1+0.12*k)),0,255).astype(int) for k in (1,2)]
    sc=wall.mean()/26.2   # warm shades follow the distance's darkening like the wall does
    warm=[np.round(FORGE*k*sc).astype(int) for k in WARM_K]
    R=np.vstack([P]+[e[None] for e in ext]+[w[None] for w in warm]); R=R[np.argsort(R.sum(1),kind='stable')]
    return wall,R,max(1,len(P)//8)
for dist,((fw,fh),H) in FOOT.items():
    wall,RAMP,step=ramp(dist)
    for n in ('closed','open'):
        crop,mask,bb=cut(n)
        bx0,bx1=BODY_X[n][0]*2-bb[0],BODY_X[n][1]*2-bb[0]
        cb=cut('closed')[2]; s=H/(cb[3]-cb[1])                    # same scale for closed and open
        assert (bx1-bx0)*s<=fw-2*MARGIN
        w=round(crop.width*s); h=round(crop.height*s)
        rgb=np.array(crop).astype(float)*np.array(mask)[...,None]/255
        sm=np.array(Image.fromarray(rgb.astype(np.uint8)).resize((w,h),Image.BOX)).astype(float)   # the only resample
        a=np.array(mask.resize((w,h),Image.BOX)).astype(float)/255
        col=np.where(a[...,None]>0.01,sm/np.maximum(a[...,None],0.01),0)
        op=a>=0.5
        ox=round((fw-(bx1-bx0)*s)/2-bx0*s); oy=fh-h
        WARM=[i for i in range(len(RAMP)) if RAMP[i][0]-RAMP[i][2]>8 and RAMP[i][0]>RAMP[i][1]+2]; GREY=[i for i in range(len(RAMP)) if i not in WARM]
        WL=RAMP[WARM].sum(1)
        # wood vs iron from the source: rusty iron is the saturated orange-brown, wood the greyer brown
        sat=(col[...,0]-col[...,2])/np.maximum(col[...,0],1); iron=op&(sat>IRON_SAT)&(col.sum(2)>IRON_L)
        def q(img):
            Lp=img.sum(2); I=np.zeros((h,w),int)
            f=img.reshape(-1,1,3); G=np.array(GREY); I_g=G[((f-RAMP[G][None])**2).sum(2).argmin(1)].reshape(h,w)
            I_w=np.array(WARM)[np.abs(Lp[...,None]-WL[None,None]).argmin(2)]   # wood: warm shade by brightness, not hue
            I=np.where(iron,I_g,I_w)
            if iron.any():                                                       # warm rust highlights on the iron
                t=np.percentile(Lp[iron],85); I=np.where(iron&(Lp>=t),WARM[2],I)
            return I
        def build(g):
            I=q(np.clip(col*g,0,255)); R=I.copy()
            pad=np.pad(op,1)
            edge=op&~(pad[:-2,1:-1]&pad[2:,1:-1]&pad[1:-1,:-2]&pad[1:-1,2:])
            L=RAMP[I].sum(2)
            for y in range(h):
                for x in range(w):
                    if not op[y,x]: continue
                    if edge[y,x]: R[y,x]=GREY[min(step,len(GREY)-1)]; continue   # 1px dark silhouette outline
                    top=y>0 and edge[y-1,x] and (y<2 or not op[y-2,x])
                    if top or (y>0 and L[y,x]-L[y-1,x]>max(30,L[op].mean())):
                        R[y,x]=WARM[-1] if L[y,x]>=L[op].mean() else WARM[-2]     # lit rim: two brightest warm shades
            return RAMP[R]
        lo,hi=0.2,6.0
        for _ in range(16):
            g=(lo+hi)/2; o=build(g)
            if o[op].mean()<wall.mean()*TARGET: lo=g
            else: hi=g
        o=build((lo+hi)/2)
        if dist=='far': o,op=simplify_far(n,o,op,RAMP,step,wall.mean()*TARGET)
        o=o.astype(np.uint8)
        out=np.zeros((fh,fw,4),np.uint8)
        # paste with clipping
        for y in range(h):
            for x in range(w):
                X,Y=ox+x,oy+y
                if op[y,x] and 0<=X<fw and 0<=Y<fh: out[Y,X,:3]=o[y,x]; out[Y,X,3]=255
        name=f'item_chest_{dist}' if n=='closed' else f'item_chest_open_{dist}'
        Image.fromarray(out,'RGBA').save(D+name+'.png')
        bbx=Image.fromarray(out).getbbox()
        print(f'{name}: {fw}x{fh} bbox {bbx} chest mean {o[op].mean():.1f} wall {wall.mean():.1f} ratio {o[op].mean()/wall.mean():.2f}')
