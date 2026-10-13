# Cave-in rubble front wall (near/mid/far) from the painted source art/src/rubble_src.jpg,
# processed like the portraits (build_ilsevar_from_source.py): crop -> one BOX scale-down per
# size from the source -> quantize to that distance's wall_front colours (+ up to 2 ramp steps
# brighter for lit faces), no dither, fully opaque. Brightness matched to ~0.9-1.0 of wall_front.
# python3 scripts/build_rubble_from_source.py [crop x0 y0 x1 y1]
import os,sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
from PIL import Image
import numpy as np
SRC='/workspace/sunken-keep/art/src/rubble_src_v2.jpg'   # v2: same scene, no smoke
D='public/art/dungeon_v2/'
SIZES={'near':(160,140),'mid':(120,100),'far':(80,70)}
src=Image.open(SRC).convert('RGB')
if len(sys.argv)==5: CROP=tuple(map(int,sys.argv[1:]))
else: CROP=(288,51,1000,675)   # 1024-view (230,41,800,540) x1.25: between the painted side walls, heap base on the bottom row   # 1280x720 source: lantern (x~155-205) and painted side walls cropped out, heap fills, dark corridor above right
# 1) baked-in haze at the top right -> dark corridor (polygon above the heap's right flank, source coords)
from PIL import ImageDraw
HAZE=[(630,50),(1280,50),(1280,370),(880,320),(800,300),(740,275),(690,200),(645,120)]
HAZE_FILL=False   # v2 source has no smoke
if HAZE_FILL: ImageDraw.Draw(src).polygon(HAZE,fill=(0,0,0))
# 2) crop: y1=575 / x1=900 trims the painted wet floor so the heap base sits on the bottom row
crop=src.crop(CROP)
for dist,(w,h) in SIZES.items():
    wall=np.array(Image.open(D+f'wall_front_{dist}.png').convert('RGB')).astype(int)
    P=np.unique(wall.reshape(-1,3),axis=0); P=P[np.argsort(P.sum(1))]
    step=max(1,len(P)//8)
    # extended ramp: wall colours plus up to 2 eighth-of-range steps brighter for lit faces,
    # built by scaling the brightest wall colours (the only non-wall colours allowed)
    top=P[-1].astype(float); ext=[np.clip(np.round(top*(1+0.12*k)),0,255).astype(int) for k in (1,2)]
    RAMP=np.vstack([P]+[e[None] for e in ext])
    small=np.array(crop.resize((w,h),Image.BOX)).astype(float)   # the only resample
    target=wall.mean()*0.93
    RI={tuple(c):i for i,c in enumerate(RAMP)}
    DARKT=RAMP[min(len(RAMP)-1,step)].sum()   # 'darkness' = the lowest eighth of the ramp
    def q(img):
        f=img.reshape(-1,1,3); i=((f-RAMP[None])**2).sum(2).argmin(1); o=RAMP[i].reshape(img.shape)
        # 3) sharpen by local contrast: darker outline where a neighbour is much darker,
        #    brighter lit edge where the pixel above is much darker
        L=o.sum(2); res=o.copy(); T=max(30,1.0*L.mean())   # high enough that only block edges, not surface texture, trigger
        for yy in range(h):
            for xx in range(w):
                i=RI[tuple(o[yy,xx])]
                if yy>0 and L[yy,xx]-L[yy-1,xx]>T: res[yy,xx]=RAMP[min(len(RAMP)-1,i+2*step)]; continue
                nb=[L[yy+dy,xx+dx] for dy,dx in ((1,0),(0,-1),(0,1)) if 0<=yy+dy<h and 0<=xx+dx<w]
                if nb and L[yy,xx]-min(nb)>T: res[yy,xx]=RAMP[max(0,i-step)]
        return res
    lo,hi=0.2,4.0
    for _ in range(14):
        g=(lo+hi)/2
        if q(np.clip(small*g,0,255)).mean()<target: lo=g
        else: hi=g
    out=q(np.clip(small*(lo+hi)/2,0,255)).astype(np.uint8)
    Image.fromarray(np.dstack([out,np.full((h,w),255,np.uint8)]),'RGBA').save(D+f'rubble_front_{dist}.png')
    print(f'{dist}: rubble mean {out.mean():.1f}, wall mean {wall.mean():.1f}, ratio {out.mean()/wall.mean():.2f}')
