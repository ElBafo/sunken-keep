import numpy as np, math
from PIL import Image
W,H,HZ,VX=270,200,100,135
S=4  # supersample
def hx(h): return np.array([int(h[i:i+2],16) for i in (1,3,5)],float)
rng=np.random.default_rng(3)
noise=rng.random((256,256))
def flag(u,v):
    # flagstones 1 cell = 2x2 stones, staggered; returns (shade, mortar)
    su=u*2; sv=v*2; row=np.floor(sv); su=su+0.5*(row%2)
    fu,fv=su-np.floor(su),sv-row
    mort=(fu<0.06)|(fv<0.06)
    n=noise[(np.floor(su).astype(int)*37+row.astype(int)*11)%256,(row.astype(int)*7)%256]
    return n,mort
def render(kind):
    ys,xs=np.mgrid[0:H*S,0:W*S]/S+0.5/S
    img=np.zeros((H*S,W*S,3))
    dy=ys-HZ; floor=dy>0; ceil=dy<0
    z=70/np.maximum(np.abs(dy),1e-3)          # 1.0 at y170 / y30
    u=(xs-VX)/70*z+0.5; v=z
    n,m=flag(u,v)
    fade=np.clip(1.15-0.28*(z-1),0.18,1.0)[...,None]
    # floor
    base=hx('#22302b'); stone=base*(0.8+0.4*n[...,None]); stone[m]=hx('#0e1714')
    fl=stone*fade
    if kind!='stone':
        deep=kind=='deep'
        wcol=hx('#0b1c18') if deep else hx('#1d4238')
        a=0.88 if deep else 0.55
        # ripples
        rip=np.sin(u*9+np.sin(v*5)*2)*np.sin(v*7)
        wc=wcol*(1+0.15*rip[...,None])
        fl=(stone*(1-a)+wc*a)*fade
        glint=(rip>(0.985 if deep else 0.93))&(z<4)
        fl[glint]=hx('#5f9c86')*fade[glint]
    img[floor]=fl[floor]
    # ceiling: dark stone with dwarven beams every cell
    cb=hx('#151d1b')*(0.85+0.3*n[...,None])
    cb[m]=hx('#0a100e')
    beam=((v%1)<0.18)
    cb[beam]=hx('#2a2219')*(0.9+0.2*n[beam][...,None])
    beamedge=((v%1)>=0.18)&((v%1)<0.24)
    cb[beamedge]=hx('#0a0806')
    img[ceil]=(cb*fade*0.9)[ceil]
    # horizon band darkness
    img[np.abs(dy)<4]=hx('#060b0a')
    out=Image.fromarray(np.clip(img,0,255).astype('uint8')).resize((W,H),Image.BOX)
    return out
ims={k:render(k) for k in ['stone','shallow','deep']}
strip=Image.new('RGB',(W*3,H)); [strip.paste(im,(i*W,0)) for i,im in enumerate(ims.values())]
pal=strip.quantize(48,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
for k,im in ims.items():
    q=im.quantize(palette=pal,dither=Image.Dither.NONE).convert('RGB'); q.save(f'backdrop_{k}.png'); ims[k]=q
# per-distance floor water overlays (full 270x200 canvas, transparent elsewhere)
BANDS={'near':(170,200),'mid':(150,170),'far':(135,150)}
for k in ['shallow','deep']:
    src=np.array(ims[k].convert('RGBA'))
    for d,(y0,y1) in BANDS.items():
        o=np.zeros_like(src); o[y0:y1]=src[y0:y1]; Image.fromarray(o).save(f'floor_water_{k}_{d}.png')
# preview: backdrop + walls + items/monster
def comp(bk):
    V=Image.open(f'backdrop_{bk}.png').convert('RGBA')
    def put(n,x,y): V.alpha_composite(Image.open(n+'.png'),(x,y))
    put('wall_front_far',95,65); put('wall_left_far',75,65); put('wall_right_far',175,65)
    put('wall_left_mid',45,50); put('wall_right_mid',195,50)
    put('wall_left_near',15,30); put('wall_right_near',225,30)
    return V
a=comp('stone'); b=comp('shallow'); c=comp('deep')
# show standing positions: sprite bottoms at band bottoms
b.alpha_composite(Image.open('item_key_mid.png'),(110,170-40+4)); b.alpha_composite(Image.open('keep_rat_far.png'),(120,150-25+3))
row=Image.new('RGBA',(3*274,200)); [row.alpha_composite(v,(i*274,0)) for i,v in enumerate([a,b,c])]
row.resize((row.width*3,600),Image.NEAREST).save('/workspace/sunken-keep/art/preview/backdrops_3x.png')
