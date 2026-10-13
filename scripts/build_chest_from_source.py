# Chest (closed + open, near/mid/far) from the painted sources art/src/chest_{closed,open}_src.jpg,
# same pipeline as build_rubble_from_source.py: cut the chest out along a hand-traced outline
# (floor + background -> transparent) -> ONE BOX scale-down per size from the source -> quantize
# to that distance's dungeon_v2/wall_front colours (+ up to 2 brighter ramp steps for lit edges),
# no dither -> 1px dark silhouette outline + lit top edges. Brightness ~0.92 of wall_front.
# Closed and open share one scale and one base box: centred body, base on the bottom row, closed
# chest about as tall as the old one. Ramp also has 4 warm shades (forge orange #e08a3c darkened)
# for wood/rust. Far = area-downscale of the finished mid frames + clean hand pass (far_from_mid).
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
def despeckle(o,op):
    # merge isolated single pixels (colour unlike all 8 opaque neighbours) into their median neighbour
    o=o.copy(); h,w=op.shape; src=o.copy()
    for y in range(1,h-1):
        for x in range(1,w-1):
            if not op[y,x]: continue
            nb=[tuple(src[y+dy,x+dx]) for dy in (-1,0,1) for dx in (-1,0,1) if (dy or dx) and op[y+dy,x+dx]]
            if len(nb)==8 and tuple(src[y,x]) not in nb:
                L=sorted(nb,key=sum); o[y,x]=L[len(L)//2]
    return o
def far_from_mid(n):
    # far = area-downscale of the finished mid frame (same shape + palette), then a clean hand pass
    (fw,fh),H=FOOT['far']; wall,RAMP,step=ramp('far',1.0)   # near-strength warm shades: far needs the contrast
    WARM=[i for i in range(len(RAMP)) if RAMP[i][0]-RAMP[i][2]>8 and RAMP[i][0]>RAMP[i][1]+2]
    GREY=[i for i in range(len(RAMP)) if i not in WARM]
    mid=Image.open(D+('item_chest_mid.png' if n=='closed' else 'item_chest_open_mid.png')).convert('RGBA')
    cm=Image.open(D+'item_chest_mid.png').getbbox(); s=H/(cm[3]-cm[1])
    bb=mid.getbbox(); m=np.array(mid.crop(bb)).astype(float)
    w=round(m.shape[1]*s); h=round(m.shape[0]*s)
    pm=m[...,:3]*m[...,3:]/255
    a=np.array(Image.fromarray(m[...,3].astype(np.uint8)).resize((w,h),Image.BOX)).astype(float)/255
    rgb=np.array(Image.fromarray(pm.astype(np.uint8)).resize((w,h),Image.BOX)).astype(float)/np.maximum(a[...,None],0.01)
    op=a>=0.5; L=rgb.sum(2)
    pad=np.pad(op,1); edge=op&~(pad[:-2,1:-1]&pad[2:,1:-1]&pad[1:-1,:-2]&pad[1:-1,2:])
    ys,xs=np.nonzero(op); X0,X1,Y0,Y1=xs.min(),xs.max(),ys.min(),ys.max()
    dark=RAMP[GREY[min(step,len(GREY)-1)]]; recess_c=RAMP[GREY[1]]
    W0,W1,W2,W3=(RAMP[i] for i in WARM[:4]); band=RAMP[GREY[step]]   # bands: dark wall grey (iron)
    inner=op&~edge
    if n=='open':   # recess = dark interior below the lid back, above the front body
        rows=[y for y in range(Y0,Y1+1) if inner[y].any()]
        dk=inner&(L<np.percentile(L[inner],35))
        rec_rows=[y for y in rows if dk[y].sum()>=0.5*inner[y].sum() and Y0+2<y<Y0+(Y1-Y0)*0.75]
        r0,r1=(min(rec_rows),max(rec_rows)) if rec_rows else (Y0+4,Y0+7)
        body_top=r1+1
    else: body_top=Y0+1
    def make(thr):
        o=np.zeros((h,w,3),int)
        o[inner]=np.where((L[inner]>=thr)[:,None],W1,W0)            # wood: warm shades 2-3 (darkest two warm shades at near strength)
        if n=='open':
            for y in range(r0,r1+1):
                xi=np.nonzero(inner[y])[0]
                if len(xi)>2: o[y,xi[1]:xi[-1]]=recess_c              # dark recess, 1px warm sides
                if len(xi): o[y,xi[0]]=W3; o[y,xi[-1]]=W3
            for x in range(X0,X1+1):
                if inner[r1+1,x]: o[r1+1,x]=W3                        # lit front rim
                if inner[r0-1,x]: o[r0-1,x]=W2                        # lid back lower edge
        for x in range(X0,X1+1):                                      # lit top rim
            col=np.nonzero(inner[:,x])[0]
            if len(col): o[col[0],x]=W3 if x%3 else W2
        for fx in (0.25,0.75):                                        # darker band columns
            bx=X0+round((X1-X0)*fx)
            for y in range(body_top+1,Y1):
                if inner[y,bx]: o[y,bx]=band
        lx=X0+(X1-X0)//2; ly=body_top+max(1,(Y1-body_top)//3)          # 2x2 lighter lock
        o[ly:ly+2,lx:lx+2]=W3
        o[edge]=dark; return o
    tgt=wall.mean()*TARGET; best=None
    for q in range(5,96,3):
        o=make(np.percentile(L[inner],q)); mm=o[op].mean()
        if best is None or abs(mm-tgt)<abs(best[0]-tgt): best=(mm,o)
    o=best[1].astype(np.uint8); out=np.zeros((fh,fw,4),np.uint8)
    ox=(fw-w)//2; oy=fh-h
    out[oy:oy+h,ox:ox+w,:3][op]=o[op]; out[oy:oy+h,ox:ox+w,3][op]=255
    name='item_chest_far' if n=='closed' else 'item_chest_open_far'
    Image.fromarray(out,'RGBA').save(D+name+'.png')
    print(f'{name}: {fw}x{fh} bbox {Image.fromarray(out).getbbox()} ratio {o[op].mean()/wall.mean():.2f}')
def far_hand(n):
    # far (30x25) drawn by hand in the far palette, proportions from the mid frames (bbox 43x27 -> 25x16):
    # 3/4 view from slightly above: curved lid top in the brightest warm, front wood, a right side face
    # 2 steps darker than the front (not black), dark lid seam, 2 iron bands + 2x2 lock, dark bottom row
    # + 1-row floor shadow. Open: 5-row brighter lid back rising above the body, dark hinge line,
    # black recess (no glint), warm rim. Brightness 1.00-1.05 of wall, hard cap 1.05.
    wall,RAMP,step=ramp('far',1.0)
    WARM=[i for i in range(len(RAMP)) if RAMP[i][0]-RAMP[i][2]>8 and RAMP[i][0]>RAMP[i][1]+2]
    GREY=[i for i in range(len(RAMP)) if i not in WARM]
    W=[np.round(FORGE*k).astype(int) for k in (0.10,0.17,0.26,0.38)]   # forge warm shades (explicit; the wall ramp has olive-browns too)
    K=RAMP[GREY[0]]; DK=RAMP[GREY[step]]; G2=RAMP[GREY[2*step]]
    SIDE=np.round(FORGE*0.06).astype(int)   # 2 steps (0.10->0.08->0.06) below the front wood, not black
    x0,xf,x1=2,22,26
    best=None
    for per,lid_v,pan_v in [(p_,l_,q_) for p_ in (2,3,4,99) for l_ in (0,1,2,3) for q_ in (2,)]:   # open: brightest lid-back panel that fits the 1.05 cap (0 and 1 exceed it)
        o=np.zeros((25,30,3),int); a=np.zeros((25,30),bool)
        def px(x,y,c): o[y,x]=c; a[y,x]=True
        if n=='closed':
            top=9
            lid=[(top,4,x1-2),(top+1,3,x1-1),(top+2,x0,x1),(top+3,x0,x1)]
            shades=[[W[3],W[3],W[2],W[1]],[W[3],W[2],W[1],W[1]],[W[3],W[2],W[1],W[0]],[W[3],W[1],W[1],W[0]]][lid_v]
            for (y,a0,a1),c in zip(lid,shades):
                for x in range(a0,a1+1): px(x,y,c if x<=xf else W[1])
            for x in range(x0,x1+1): px(x,top+4,DK)                               # lid seam
            body0=top+5
        else:
            top=4
            panel=[(top,5,x1-3),(top+1,4,x1-2),(top+2,3,x1-1),(top+3,3,x1-1),(top+4,x0+1,x1)]   # 5 rows, tilted back
            shades=[[W[3],W[3],W[2],W[2],W[1]],[W[3],W[2],W[2],W[1],W[1]],[W[3],W[2],W[1],W[1],W[0]],[W[3],W[1],W[1],W[0],W[0]]][pan_v]
            for (y,a0,a1),c in zip(panel,shades):
                for x in range(a0,a1+1): px(x,y,c if x<=xf-1 else W[1])
            for x in range(x0+1,x1+1): px(x,top+5,DK)                             # hinge line
            for y in (top+6,top+7,top+8):                                         # black recess, warm sides, no glint
                for x in range(x0,x1+1): px(x,y,K)
                px(x0+1,y,W[1]); px(xf,y,W[1])
            for x in range(x0,x1+1): px(x,top+9,W[3] if x<=xf else W[2])          # lit front rim
            body0=top+10
        for y in range(body0,23):
            for x in range(x0,x1+1):
                c=(np.round(FORGE*0.08).astype(int) if (y-body0)%per==per-1 else W[0]) if x<=xf else SIDE      # front W1 (one step brighter) with darker plank seams; side face
                px(x,y,c)
        for bx in (6,18):
            for y in range(body0,23): px(bx,y,G2 if y==body0 else DK)            # iron bands
        ly=body0+2; px(12,ly,W[3]); px(13,ly,W[3]); px(12,ly+1,W[3]); px(13,ly+1,W[2])   # 2x2 lock
        for x in range(x0,x1+1): px(x,23,DK)                                     # front-bottom shadow row
        for x in range(x0+1,x1+2): px(x,24,K)                                    # floor shadow
        pad=np.pad(a,1); edge=a&~(pad[:-2,1:-1]&pad[2:,1:-1]&pad[1:-1,:-2]&pad[1:-1,2:]); edge[24]=False
        lit_top=np.zeros_like(a)
        for x in range(30):
            ys=np.nonzero(a[:,x])[0]
            if len(ys): lit_top[ys[0],x]=True
        o[edge&~lit_top]=K; o[lit_top]=np.where((np.arange(30)<=xf)[:,None],W[3],W[2])[np.nonzero(lit_top)[1]]
        m=o[a].mean(); r=m/wall.mean()
        if r>1.05: continue                                                       # hard cap
        if best is None or abs(r-1.025)<abs(best[0]/wall.mean()-1.025): best=(m,o.copy(),a.copy())
    m,o,a=best; out=np.zeros((25,30,4),np.uint8); out[a,:3]=o[a]; out[a,3]=255
    name='item_chest_far' if n=='closed' else 'item_chest_open_far'
    Image.fromarray(out,'RGBA').save(D+name+'.png')
    print(f'{name}: 30x25 bbox {Image.fromarray(out).getbbox()} ratio {m/wall.mean():.3f}')
def ramp(dist,warm_scale=None):
    wall=np.array(Image.open(W+f'wall_front_{dist}.png').convert('RGB')).astype(int)
    P=np.unique(wall.reshape(-1,3),axis=0); P=P[np.argsort(P.sum(1))]
    top=P[-1].astype(float); ext=[np.clip(np.round(top*(1+0.12*k)),0,255).astype(int) for k in (1,2)]
    sc=wall.mean()/26.2 if warm_scale is None else warm_scale   # warm shades follow the distance's darkening like the wall does
    warm=[np.round(FORGE*k*sc).astype(int) for k in WARM_K]
    R=np.vstack([P]+[e[None] for e in ext]+[w[None] for w in warm]); R=R[np.argsort(R.sum(1),kind='stable')]
    return wall,R,max(1,len(P)//8)
for dist,((fw,fh),H) in [(k,v) for k,v in FOOT.items() if k!='far']:
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
        if dist=='near': o=despeckle(o,op)
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

for n in ('closed','open'): far_hand(n)
