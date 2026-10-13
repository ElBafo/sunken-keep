# Cave-in rubble front wall (near/mid/far) from the painted source art/src/rubble_src.jpg,
# processed like the portraits (build_ilsevar_from_source.py): crop -> one BOX scale-down per
# size from the source -> quantize to that distance's wall_front colours (+ up to 2 ramp steps
# brighter for lit faces), no dither, fully opaque. Brightness matched to ~0.9-1.0 of wall_front.
# python3 scripts/build_rubble_from_source.py [crop x0 y0 x1 y1]
import os,sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
from PIL import Image
import numpy as np
SRC='/workspace/sunken-keep/art/src/rubble_src.jpg'
D='public/art/dungeon_v2/'
SIZES={'near':(160,140),'mid':(120,100),'far':(80,70)}
src=Image.open(SRC).convert('RGB')
if len(sys.argv)==5: CROP=tuple(map(int,sys.argv[1:]))
else: CROP=(300,50,960,628)   # 1280x720 source: lantern (x~155-205) and painted side walls cropped out, heap fills, dark corridor above right
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
    target=wall.mean()*0.95
    def q(img):
        f=img.reshape(-1,1,3); i=((f-RAMP[None])**2).sum(2).argmin(1); return RAMP[i].reshape(img.shape)
    lo,hi=0.2,4.0
    for _ in range(18):
        g=(lo+hi)/2
        if q(np.clip(small*g,0,255)).mean()<target: lo=g
        else: hi=g
    out=q(np.clip(small*(lo+hi)/2,0,255)).astype(np.uint8)
    Image.fromarray(np.dstack([out,np.full((h,w),255,np.uint8)]),'RGBA').save(D+f'rubble_front_{dist}.png')
    print(f'{dist}: rubble mean {out.mean():.1f}, wall mean {wall.mean():.1f}, ratio {out.mean()/wall.mean():.2f}')
