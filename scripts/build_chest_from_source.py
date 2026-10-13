# Chest (closed + open, near/mid/far) from the painted sources art/src/chest_{closed,open}_src.jpg,
# same pipeline as build_rubble_from_source.py: cut the chest out along a hand-traced outline
# (floor + background -> transparent) -> ONE BOX scale-down per size from the source -> quantize
# to that distance's dungeon_v2/wall_front colours (+ up to 2 brighter ramp steps for lit edges),
# no dither -> 1px dark silhouette outline + lit top edges. Brightness ~0.92 of wall_front.
# Closed and open share one scale and one base box: same left column, same right column (body),
# base on the bottom row of the frame, same footprint as the old hand-built chest.
# python3 scripts/build_chest_from_source.py
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
from PIL import Image, ImageDraw
import numpy as np
D='public/art/dungeon/'; W='public/art/dungeon_v2/'
# outlines in 640x360 view coords of the 1280x720 sources (x2 when used)
POLY={'closed':[(148,92),(158,68),(200,66),(470,68),(495,74),(508,90),(513,130),(512,258),(500,280),(450,298),(440,298),(150,278),(145,270)],
      'open':[(172,38),(180,30),(490,30),(505,38),(513,60),(512,150),(502,170),(500,275),(450,302),(148,285),(142,275),(142,182),(160,172),(190,165),(185,60)]}
# old footprint per distance: frame size, left column, right column (exclusive) of the closed chest; base = bottom row
FOOT={'near':((80,60),17,62),'mid':((50,40),10,40),'far':((30,25),5,24)}
BODY_X={'closed':(145,513),'open':(142,513)}   # body left/right in view coords -> same width in both
TARGET=0.92
def cut(n):
    src=Image.open(f'art/src/chest_{n}_src.jpg').convert('RGB'); S=4
    m=Image.new('L',(1280*S,720*S),0); ImageDraw.Draw(m).polygon([(x*2*S,y*2*S) for x,y in POLY[n]],fill=255)
    m=m.resize((1280,720),Image.BOX)
    xs=[p[0]*2 for p in POLY[n]]; ys=[p[1]*2 for p in POLY[n]]
    bb=(min(xs),min(ys),max(xs),max(ys))
    return src.crop(bb),m.crop(bb),bb
def ramp(dist):
    wall=np.array(Image.open(W+f'wall_front_{dist}.png').convert('RGB')).astype(int)
    P=np.unique(wall.reshape(-1,3),axis=0); P=P[np.argsort(P.sum(1))]
    top=P[-1].astype(float); ext=[np.clip(np.round(top*(1+0.12*k)),0,255).astype(int) for k in (1,2)]
    return wall,np.vstack([P]+[e[None] for e in ext]),max(1,len(P)//8)
for dist,((fw,fh),x0,x1) in FOOT.items():
    wall,RAMP,step=ramp(dist)
    for n in ('closed','open'):
        crop,mask,bb=cut(n)
        bx0,bx1=BODY_X[n][0]*2-bb[0],BODY_X[n][1]*2-bb[0]
        s=(x1-x0)/(bx1-bx0)
        w=round(crop.width*s); h=round(crop.height*s)
        rgb=np.array(crop).astype(float)*np.array(mask)[...,None]/255
        sm=np.array(Image.fromarray(rgb.astype(np.uint8)).resize((w,h),Image.BOX)).astype(float)   # the only resample
        a=np.array(mask.resize((w,h),Image.BOX)).astype(float)/255
        col=np.where(a[...,None]>0.01,sm/np.maximum(a[...,None],0.01),0)
        op=a>=0.5
        ox=x0-round(bx0*s); oy=fh-h
        def q(img):
            f=img.reshape(-1,1,3); i=((f-RAMP[None])**2).sum(2).argmin(1); return i.reshape(h,w)
        def build(g):
            I=q(np.clip(col*g,0,255)); R=I.copy()
            pad=np.pad(op,1)
            edge=op&~(pad[:-2,1:-1]&pad[2:,1:-1]&pad[1:-1,:-2]&pad[1:-1,2:])
            L=RAMP[I].sum(2)
            for y in range(h):
                for x in range(w):
                    if not op[y,x]: continue
                    if edge[y,x]: R[y,x]=min(I[y,x],step); continue        # 1px dark silhouette outline
                    above_edge=edge[y-1,x] if y>0 else True
                    if (above_edge and y>0 and not op[y-2,x] if y>1 else above_edge) or (y>0 and L[y,x]-L[y-1,x]>max(30,L[op].mean())):
                        R[y,x]=min(len(RAMP)-1,I[y,x]+2*step)            # lit top edge
            return RAMP[R]
        lo,hi=0.2,6.0
        for _ in range(16):
            g=(lo+hi)/2; o=build(g)
            if o[op].mean()<wall.mean()*TARGET: lo=g
            else: hi=g
        o=build((lo+hi)/2).astype(np.uint8)
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
