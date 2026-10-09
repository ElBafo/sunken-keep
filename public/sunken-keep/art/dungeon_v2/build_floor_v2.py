from PIL import Image, ImageEnhance
import numpy as np
A='/home/box/agent-data/agents/886e9186-eb6c-4545-8ca0-bfda02eef844/assets/'
stone=Image.open(A+'c6bc36aa274b5a839d5404ea10988375b8f279726bf2862f12619a44c3c71229.jpg').convert('RGB').resize((1024,576))
water=Image.open(A+'6fb9c0727d22c315898b2e96bd486a1c7b176d43b0b7d2da091f2b99a10b4389.jpg').convert('RGB').resize((1024,576))
def px(im,w,h): return im.resize((w,h),Image.BOX)
def fade(arr,y0,y1,top):  # darken toward horizon
    h=arr.shape[0]
    for y in range(h):
        t=y/(h-1); f=(0.25+0.75*t) if not top else (0.25+0.75*(1-t))
        arr[y]*=f
    return arr
ceil=np.asarray(px(stone.crop((0,0,1024,250)),270,100),float)
ceil=fade(ceil,0,100,True)
def floor(src,k=1.0,tint=(1,1,1)):
    f=np.asarray(px(src.crop((0,300,1024,576)),270,100),float)
    f=fade(f,0,100,False)*k*np.array(tint)
    return f
outs={'stone':floor(stone),'shallow':floor(water),'deep':floor(water,0.8,(0.85,1.0,1.08))}
res={}
for n,f in outs.items():
    a=np.vstack([ceil,f]).clip(0,255).astype('uint8')
    im=Image.fromarray(a).quantize(48,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('RGB')
    im.save(f'backdrop_{n}.png'); res[n]=im
bands={'near':(170,200),'mid':(150,170),'far':(135,150)}
for n in ('shallow','deep'):
    for b,(y0,y1) in bands.items():
        o=Image.new('RGBA',(270,200),(0,0,0,0))
        o.paste(res[n].crop((0,y0,270,y1)),(0,y0)); o.save(f'floor_water_{n}_{b}.png')
# preview: backdrops + corridor composite
pv=Image.new('RGB',(270*3+20,200),(0,0,0))
for i,n in enumerate(res): pv.paste(res[n],(i*280,0))
pv.resize((pv.width*3,600),Image.NEAREST).save('../preview/v2_backdrops_3x.png')
def comp(bg):
    c=bg.copy().convert('RGBA')
    for d in ('far','mid','near'):
        pass
    for d,lx,rx,y in (('mid',45,195,50),('near',15,215,30)):
        l=Image.open(f'wall_left_{d}.png').convert('RGBA');r=Image.open(f'wall_right_{d}.png').convert('RGBA')
        c.alpha_composite(l,(lx,y)); c.alpha_composite(r,(rx,y))
    c.alpha_composite(Image.open('wall_front_far.png').convert('RGBA'),(95,65))
    c.alpha_composite(Image.open('sconce_lit_1_mid.png').convert('RGBA'),(52,80))
    return c
cv=Image.new('RGB',(560,200));cv.paste(comp(res['stone']),(0,0));cv.paste(comp(res['shallow']),(290,0))
cv.resize((1680,600),Image.NEAREST).save('../preview/v2_corridor_floor_3x.png')
print('ok')
