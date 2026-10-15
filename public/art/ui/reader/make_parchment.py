import numpy as np, json
from PIL import Image, ImageFilter
rng=np.random.default_rng(28)
S=4  # painted source supersample
def fnoise(h,w,beta,seed):
    r=np.random.default_rng(seed).standard_normal((h,w))
    F=np.fft.fft2(r); fy=np.fft.fftfreq(h)[:,None]; fx=np.fft.fftfreq(w)[None,:]
    f=np.sqrt(fx**2+fy**2); f[0,0]=1
    n=np.real(np.fft.ifft2(F/f**beta)); n-=n.mean(); return n/n.std()   # periodic over (h,w)
# palette: warm desaturated tan -> sepia, plus faint cold damp tone (swamp green-grey)
PAL=np.array([[226,210,172],[216,198,158],[205,186,145],[193,172,132],[178,156,117],
              [158,134,98],[132,106,74],[104,80,54],[78,56,36],[56,38,24],
              [190,180,140],[168,160,124]],float)
def quant(rgb):
    d=((rgb[...,None,:]-PAL[None,None])**2).sum(-1); return PAL[d.argmin(-1)]
def render(W,H,periodic,seed):
    h,w=H*S,W*S
    if periodic:  # build noise on a 64-periodic grid offset by 16 so corners/edges/centre tile
        P=64*S; base=lambda b,s: np.tile(fnoise(P,P,b,s),(int(np.ceil((h+P)/P)),int(np.ceil((w+P)/P))))
        def nz(b,s):
            t=base(b,s); o=16*S
            ys=np.arange(h); xs=np.arange(w)
            # map coords: inner region repeats from 16; far corner maps to 80..96
            def m(a,L): a=a.copy(); far=a>=L-16*S; a[far]=a[far]-(L-16*S)+80*S; return a
            return t[np.ix_(m(ys,h)%P+0, m(xs,w)%P)]
    else:
        def nz(b,s): return fnoise(h,w,b,s)
    yy,xx=np.mgrid[0:h,0:w]/S
    grain=0.55*nz(1.4,seed)+0.25*nz(0.6,seed+1)
    low=nz(2.2,seed+2)
    # ragged edge: per-edge distance perturbed by noise
    rag=nz(1.6,seed+3)
    d=np.minimum(np.minimum(xx,W-1-xx),np.minimum(yy,H-1-yy))
    # rounded corners
    cx=np.clip(xx,6,W-7); cy=np.clip(yy,6,H-7)
    dc=6-np.hypot(xx-cx,yy-cy); d=np.minimum(d,dc)
    d=d+1.2*rag
    alpha=(d>0.6).astype(float)
    edge=np.clip(1-(d-1)/10,0,1)**1.6            # darkening toward the edge, ~10px
    tone=0.10-0.035*low-0.03*grain                  # 0=lightest
    tone=tone+0.62*edge+0.15*np.clip(1-(d-1)/3,0,1)
    stain=(0 if periodic else 1)*np.clip(nz(2.4,seed+4)-1.3,0,None)*0.06    # faint damp blotches
    tone+=stain
    tone=np.clip(tone,0,1)
    idx=tone*9
    lo=np.floor(idx).astype(int).clip(0,8); fr=idx-lo
    rgb=PAL[lo]*(1-fr[...,None])+PAL[lo+1]*fr[...,None]
    damp=np.clip(nz(2.0,seed+5)-1.0,0,1)*(0.12 if periodic else 0.25)*(1-0.5*edge)
    rgb=rgb*(1-damp[...,None])+np.array([168,160,124])*damp[...,None]
    src=Image.fromarray(np.dstack([rgb,alpha*255]).clip(0,255).astype(np.uint8),'RGBA')
    src=src.filter(ImageFilter.GaussianBlur(S*0.35))
    small=np.asarray(src.resize((W,H),Image.BOX)).astype(float)
    a=(small[...,3]>140)
    q=quant(small[...,:3])
    out=np.dstack([q,a*255]).astype(np.uint8)
    return Image.fromarray(out,'RGBA'),src
D='/workspace/sunken-keep/sunken-keep/public/art/ui/reader/'
page,src=render(240,320,False,11); page.save(D+'parchment_page.png')
src.save('/workspace/sunken-keep/parchment_painted_source.png')
sheet,_=render(96,96,True,11); sheet.save(D+'parchment_9slice.png')
sheet.crop((16,16,80,80)).save(D+'parchment_tile.png')
json.dump({"page":"parchment_page.png","pageSize":[240,320],
 "nineSlice":{"image":"parchment_9slice.png","size":[96,96],"insets":{"left":16,"right":16,"top":16,"bottom":16},
   "edgeMode":"repeat","note":"corners 16x16 fixed; edges are 64px strips that tile seamlessly (repeat), centre 64x64 tiles; stretching also works but repeat keeps the grain crisp. Draw with imageSmoothingEnabled=false at integer scale."},
 "tile":{"image":"parchment_tile.png","size":[64,64],"seamless":True},
 "textArea":{"left":16,"right":16,"top":18,"bottom":20,"note":"matches NOTE_MARGIN_* in note-reader.ts; the dark sepia border sits inside the outer ~10px so text never touches it"},
 "textColours":{"body":"#3a2418","title":"#5a1810"},
 "palette":["#%02x%02x%02x"%tuple(int(v) for v in c) for c in PAL]},open(D+'parchment.json','w'),indent=1)
