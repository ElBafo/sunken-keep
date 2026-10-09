import numpy as np, math
from PIL import Image, ImageEnhance
A='/home/box/agent-data/agents/886e9186-eb6c-4545-8ca0-bfda02eef844/assets/'
M={'slime':('18db97e2d0d5cbdb7d03010f23ce5eb190e3bba35c445d7e339b92dad7ce67c3.jpg',0.7,0.85),
'drowned_dwarf':('033f6fafcdd2f93d640601619774a1e92e9d7be5472b7a9ca19cef3754283f0a.jpg',1.0,1.0),
'tide_spawn':('1c71ce34ed210cb115b36454ecf25f977f99301cd3ecda7a23cd4b95a7a98c14.jpg',0.9,0.95),
'keep_rat':('16bda73ad677c7be379d9e92bd46d2514c1756add97f1a7561acb43e10edd7ba.jpg',0.85,0.9),
'rust_crab':('9cb1a55fe223757dfb3441d6b96d4a201dc1b3028842cc0899a5300a4add7b12.jpg',0.85,0.9),
'bog_leeches':('a8260e659cad7445f08cdb4ede84591fddad2ce5e929eace3238d78ec9dc8e4a.jpg',0.75,0.85),
'cellar_spider':('c39dbb74eff15ce4a8dda79a18949a8826e59b62d8ab8e6f8a56c6c7b957e114.jpg',0.85,0.9),
'captain_dural':('e533dcca88a11747d12d9b3ce4ed6806c5949e8c2bc7208bcde6c53be2bbd80c.jpg',0.9,0.95)}
FIT={'keep_rat':0.62,'rust_crab':0.6,'bog_leeches':0.68,'cellar_spider':0.72,'captain_dural':0.97}
SIZES={'near':(80,60),'mid':(50,40),'far':(30,25)}
BASEFIT=0.88
def load(name):
    f,sat,bri=M[name]; raw=Image.open(A+f).convert('RGB')
    im=ImageEnhance.Brightness(ImageEnhance.Color(raw).enhance(sat)).enhance(bri)
    a=np.asarray(raw).astype(int); key=(a[:,:,0]-a[:,:,1]>90)&(a[:,:,2]-a[:,:,1]>90)
    rgb=np.asarray(im).copy(); rgb[key]=[12,16,14]
    full=Image.fromarray(np.dstack([rgb,np.where(key,0,255).astype('uint8')]),'RGBA')
    full=full.crop(full.getbbox())
    if name=='drowned_dwarf':  # Stonevow crest, mapped from the near-size design
        sc=min(80/full.width,60/full.height); w,h=round(full.width*sc),round(full.height*sc); ox,oy=(80-w)//2,60-h
        pat=["..D..",".DHD.","DBBBD","DDBDD",".DBD.","DBBBD"]; C={'D':(40,26,14,255),'B':(150,98,40,255),'H':(214,150,70,255)}
        px=1/sc; arr=np.array(full)
        for y,row in enumerate(pat):
            for x,c in enumerate(row):
                if c!='.':
                    fx=int((39+x-ox)*px); fy=int((28+y-oy)*px); arr[fy:fy+int(px)+1,fx:fx+int(px)+1]=C[c]
        full=Image.fromarray(arr)
    return full
def render(full,W,H,fit=0.88,sx=1,sy=1,shear=0,dx=0,dy=0,sink=0,tint=None,dark=1.0,ripple=False):
    # bottom-anchored; all offsets are fractions of the box
    base=min(W/full.width,H/full.height)*fit
    S=4; CW,CH=W*S,H*S
    w=max(1,round(full.width*base*sx*S)); h=max(1,round(full.height*base*sy*S))
    im=full.resize((w,h),Image.BOX)
    if shear: im=im.transform((w+int(abs(shear)*h),h),Image.AFFINE,(1,shear,-shear*h if shear>0 else 0,0,1,0),Image.BICUBIC)
    c=Image.new('RGBA',(CW,CH))
    x=(CW-im.width)//2+int(dx*CW); y=CH-im.height+int(dy*CH)+int(sink*im.height)
    c.alpha_composite(im,(x,y)) if 0<=x and 0<=y else c.paste(im,(x,y),im)
    if sink: c=Image.fromarray(np.where(np.arange(CH)[:,None,None]<CH-1,np.array(c),0).astype('uint8'))
    sm=c.resize((W,H),Image.BOX); arr=np.array(sm).astype(float)
    if tint: t,col=tint; arr[:,:,:3]=arr[:,:,:3]*(1-t)+np.array(col)*t
    arr[:,:,:3]*=dark
    a=arr[:,:,3]; arr[:,:,3]=np.where(a>140,255,0)
    out=Image.fromarray(np.clip(arr,0,255).astype('uint8')).copy()
    if ripple:
        p=out.load(); bb=out.getbbox() or (W//3,0,2*W//3,H)
        for xx in range(max(0,bb[0]-2),min(W,bb[2]+2)):
            if (xx+ripple)%3: p[xx,H-1]=(80,150,125,255)
            if (xx+ripple)%5==0 and H>2: p[xx,H-2]=(60,120,100,255)
    return out
def frames(name):
    F={}
    for i in range(4):
        s=math.sin(i*math.pi/2)
        F[f'idle_{i+1}']=dict(sx=1+0.035*s,sy=1-0.035*s,dx=0.01*math.cos(i*math.pi/2))
    F['attack_1']=dict(sx=1.05,sy=0.93,shear=-0.06)
    F['attack_2']=dict(sx=1.12,sy=1.12,shear=0.07,dy=-0.0)
    F['attack_3']=dict(sx=1.06,sy=1.05,shear=0.03)
    F['hurt_1']=dict(sx=0.96,sy=0.97,shear=-0.08,tint=(0.4,(255,240,230)))
    F['death_1']=dict(sx=1.04,sy=0.92,tint=(0.25,(255,240,230)),shear=-0.05)
    F['death_2']=dict(sx=1.08,sy=0.85,sink=0.25,dark=0.8,ripple=1)
    F['death_3']=dict(sx=1.12,sy=0.8,sink=0.55,dark=0.62,ripple=2)
    F['death_4']=dict(sx=1.15,sy=0.75,sink=0.85,dark=0.45,ripple=3)
    return F
order=['idle_1','idle_2','idle_3','idle_4','attack_1','attack_2','attack_3','hurt_1','death_1','death_2','death_3','death_4']
sheet=Image.new('RGBA',(12*82,len(M)*62+4),(16,30,26,255))
allframes={}
for r,name in enumerate(M):
    full=load(name); F=frames(name)
    for d,(W,H) in SIZES.items():
        imgs={k:render(full,W,H,fit=FIT.get(name,0.88),**F[k]) for k in order}
        # one shared palette per monster+size so frames don't flicker
        strip=Image.new('RGB',(W*12,H))
        for i,k in enumerate(order): strip.paste(imgs[k].convert('RGB'),(i*W,0))
        pal=strip.quantize(32,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
        for i,k in enumerate(order):
            a=imgs[k].getchannel('A'); q=imgs[k].convert('RGB').quantize(palette=pal,dither=Image.Dither.NONE).convert('RGBA'); q.putalpha(a)
            q.save(f'{name}_{k}_{d}.png')
            if d=='near': sheet.alpha_composite(q,(i*82+1,r*62+2))
        # static sprite = idle_1 so it matches the animation
        Image.open(f'{name}_idle_1_{d}.png').save(f'{name}_{d}.png')
sheet.resize((sheet.width*2,sheet.height*2),Image.NEAREST).save('/workspace/sunken-keep/art/preview/monster_frames_2x.png')
