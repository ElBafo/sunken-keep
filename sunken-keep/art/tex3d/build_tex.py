from PIL import Image
import numpy as np
A='/home/box/agent-data/agents/886e9186-eb6c-4545-8ca0-bfda02eef844/assets/'
L=lambda h:Image.open(A+h).convert('RGB').resize((1024,576))
wall=L('9a285001acc2f20cb6179efa8c200a98f93f5c5588f49c3a105ae07d1c3c3c2e.jpg')
door=L('605a103623da7f9bfba03a49a740573e3a29cec2d8cb0d62cff5f0d852883490.jpg')
stone=L('c6bc36aa274b5a839d5404ea10988375b8f279726bf2862f12619a44c3c71229.jpg')
water=L('6fb9c0727d22c315898b2e96bd486a1c7b176d43b0b7d2da091f2b99a10b4389.jpg')
def seamless(im,band=0.18):
    a=np.asarray(im,float); h,w,_=a.shape
    s=np.roll(np.roll(a,w//2,1),h//2,0)
    y=np.linspace(-1,1,h)[:,None];x=np.linspace(-1,1,w)[None,:]
    m=np.clip((np.maximum(abs(x),abs(y))-(1-band*2))/(band*2),0,1)[...,None]
    return Image.fromarray((a*(1-m)+s*m).astype('uint8'))
def tex(crop,name,seam=True,k=1.0,tint=(0.92,1.05,1.0)):
    im=crop.resize((256,256),Image.LANCZOS)
    if seam: im=seamless(im)
    a=np.asarray(im,float)*k*np.array(tint)
    im=Image.fromarray(a.clip(0,255).astype('uint8')).resize((64,64),Image.BOX)
    im=im.quantize(32,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('RGB')
    im.save(name+'.png'); return im
out=[tex(wall.crop((340,40,690,390)),'wall_knot',seam=False),
     tex(wall.crop((0,40,120,520)).resize((240,480)).crop((0,0,240,240)),'wall_pilaster'),
     tex(wall.crop((700,300,900,500)),'wall_plain'),
     tex(door.crop((230,0,790,495)),'door_locked',seam=False),
     tex(stone.crop((300,420,620,576)),'floor_stone'),
     tex(water.crop((260,380,760,576)),'floor_water',k=1.15),
     tex(stone.crop((300,0,720,90)),'ceiling')]
pv=Image.new('RGB',(len(out)*68,68))
for i,im in enumerate(out): pv.paste(im,(i*68+2,2))
pv.resize((pv.width*3,204),Image.NEAREST).save('../preview/tex3d_3x.png')
# tiled check
t=Image.new('RGB',(192,64))
for i,n in enumerate(['wall_plain','floor_stone','floor_water']):
    pass
