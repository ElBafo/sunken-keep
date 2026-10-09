import numpy as np
from PIL import Image, ImageEnhance
A='/home/box/agent-data/agents/886e9186-eb6c-4545-8ca0-bfda02eef844/assets/'
M={'slime':('18db97e2d0d5cbdb7d03010f23ce5eb190e3bba35c445d7e339b92dad7ce67c3.jpg',0.7,0.85),
'drowned_dwarf':('033f6fafcdd2f93d640601619774a1e92e9d7be5472b7a9ca19cef3754283f0a.jpg',1.0,1.0),
'tide_spawn':('1c71ce34ed210cb115b36454ecf25f977f99301cd3ecda7a23cd4b95a7a98c14.jpg',0.9,0.95)}
SIZES={'near':(80,60),'mid':(50,40),'far':(30,25)}
out={}
for name,(f,sat,bri) in M.items():
    im=Image.open(A+f).convert('RGB')
    im=ImageEnhance.Brightness(ImageEnhance.Color(im).enhance(sat)).enhance(bri)
    a=np.asarray(Image.open(A+f).convert('RGB')).astype(int)
    key=(a[:,:,0]-a[:,:,1]>90)&(a[:,:,2]-a[:,:,1]>90)
    rgb=np.asarray(im).copy(); rgb[key]=[12,16,14]
    alpha=np.where(key,0,255).astype('uint8')
    full=Image.fromarray(np.dstack([rgb,alpha]),'RGBA'); full=full.crop(full.getbbox())
    for d,(W,H) in SIZES.items():
        sc=min(W/full.width,H/full.height); w,h=max(1,round(full.width*sc)),max(1,round(full.height*sc))
        sm=full.resize((w,h),Image.BOX); al=np.asarray(sm)[:,:,3]
        q=sm.convert('RGB').quantize(24,dither=Image.Dither.NONE).convert('RGBA'); qa=np.array(q); qa[:,:,3]=np.where(al>150,255,0)
        c=Image.new('RGBA',(W,H)); c.alpha_composite(Image.fromarray(qa),((W-w)//2,H-h)); c.save(f'{name}_{d}.png'); out[(name,d)]=c
# preview: each monster in the corridor at three depths
P=Image.open('/workspace/sunken-keep/art/preview/corridor_4x.png').resize((270,200),Image.NEAREST)
row=Image.new('RGBA',(3*274,200),(0,0,0,255))
for i,name in enumerate(M):
    v=P.copy()
    v.alpha_composite(out[(name,'far')],(135-15,95)); v.alpha_composite(out[(name,'near')],(135-40,120))
    row.alpha_composite(v,(i*274,0))
row.resize((row.width*3,600),Image.NEAREST).save('/workspace/sunken-keep/art/preview/monsters_3x.png')
