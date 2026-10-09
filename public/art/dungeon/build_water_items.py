import numpy as np, math, random
from PIL import Image, ImageDraw
def hx(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))
# --- tileable water 64x64 ---
def water(name,base,mid,hi,stones):
    rng=random.Random(name); N=64
    y,x=np.mgrid[0:N,0:N]/N*2*math.pi
    n=sum(math.sin(a)*np.sin(fx*x+fy*y+rng.random()*6) for a,(fx,fy) in [(1,(1,2)),(0.6,(3,-1)),(0.4,(2,3)),(0.3,(-4,2))])
    n=(n-n.min())/(n.max()-n.min())
    img=np.zeros((N,N,3)); 
    for t,c in [(0,base),(0.55,mid),(0.85,hi)]:
        img[n>=t]=hx(c)
    im=Image.fromarray(img.astype('uint8'))
    d=ImageDraw.Draw(im)
    if stones:  # submerged flagstone joints visible through shallow water
        for yy in (0,32): d.line([(0,yy),(63,yy)],fill=hx('#0a1a17'))
        for xx,(y0,y1) in [(0,(0,31)),(32,(32,63)),(20,(0,31)),(52,(32,63))]: d.line([(xx,y0),(xx,y1)],fill=hx('#0a1a17'))
    for _ in range(6):  # glints, wrap-safe
        gx,gy=rng.randrange(64),rng.randrange(64); L=rng.randint(2,4)
        for k in range(L): im.putpixel(((gx+k)%64,gy),hx('#7fc4a8'))
    im.save(f'{name}.png')
    return im
ws=water('water_shallow','#1d4238','#2a5a4a','#3c7462',True)
wd=water('water_deep','#081815','#0f2622','#1a3a32',False)
# --- items, drawn at 4x of near size, downscaled ---
S=4
def canvas(W=80,H=60): im=Image.new('RGBA',(W*S,H*S)); return im,ImageDraw.Draw(im)
def R(d,box,c,**k): d.rectangle([v*S for v in box],fill=hx(c),**k)
def E(d,box,c): d.ellipse([v*S for v in box],fill=hx(c))
def P(d,pts,c): d.polygon([(a*S,b*S) for a,b in pts],fill=hx(c))
items={}
im,d=canvas()  # rusty key
E(d,(14,22,34,42),'#3a2414'); E(d,(16,24,32,40),'#8a4a22'); E(d,(20,28,28,36),'#00000000'.replace('00000000','000000'))
R(d,(32,30,66,34),'#3a2414'); R(d,(32,30,66,32),'#a8602a'); R(d,(56,34,60,42),'#8a4a22'); R(d,(62,34,66,40),'#8a4a22')
E(d,(40,29,44,33),'#5a7a4a'); E(d,(18,25,22,29),'#c47a3a')
items['item_key']=im
im,d=canvas()  # chest
R(d,(14,26,66,58),'#1e140c'); R(d,(16,28,64,56),'#5a3a1e'); P(d,[(14,26),(20,10),(60,10),(66,26)],'#1e140c'); P(d,[(16,25),(21,12),(59,12),(64,25)],'#6e4826')
for xx in (22,54): R(d,(xx,11,xx+4,56),'#3b4442'); R(d,(xx,11,xx+1,56),'#7a8684')
R(d,(16,25,64,28),'#3b4442'); R(d,(36,30,44,40),'#c88a2a'); R(d,(39,34,41,38),'#1e140c'); R(d,(16,48,64,56),'#2f5a2a')
items['item_chest']=im
def potion(col,hi):
    im,d=canvas(); E(d,(24,20,56,58),'#0e1a18'); E(d,(26,22,54,56),'#2a3a38'); E(d,(28,32,52,55),col)
    R(d,(34,8,46,24),'#0e1a18'); R(d,(36,10,44,24),'#2a3a38'); R(d,(35,4,45,11),'#6e4826')
    E(d,(30,26,36,34),'#cfe8e0'); E(d,(42,40,47,45),hi); return im
items['item_potion_red']=potion('#b01c1c','#ff6a4a')
items['item_potion_blue']=potion('#1c4ab0','#6aa8ff')
items['item_potion_green']=potion('#2a8a3a','#8aff6a')
im,d=canvas()  # scroll
R(d,(18,20,62,44),'#3a2a18'); R(d,(20,22,60,42),'#d8c08a')
for yy in (26,30,34,38): R(d,(24,yy,52 if yy!=38 else 40,yy+1),'#6e5a3a')
E(d,(12,16,22,48),'#3a2a18'); E(d,(14,18,20,46),'#b89a62'); E(d,(58,16,68,48),'#3a2a18'); E(d,(60,18,66,46),'#b89a62')
E(d,(44,36,52,44),'#ff8844'); E(d,(46,38,50,42),'#b01c1c')
items['item_scroll']=im
SIZES={'near':(80,60),'mid':(50,40),'far':(30,25)}
sheet=Image.new('RGBA',(7*84,150),(16,30,26,255)); 
for i,(n,big) in enumerate(items.items()):
    big=big.crop(big.getbbox())
    x=0
    for k,(dn,(W,H)) in enumerate(SIZES.items()):
        sc=min(W/big.width,H/big.height)*0.7  # items sit smaller than monsters
        w,h=max(1,round(big.width*sc)),max(1,round(big.height*sc))
        sm=big.resize((w,h),Image.BOX); a=np.asarray(sm)[:,:,3]
        q=np.array(sm.convert('RGB').quantize(16,dither=Image.Dither.NONE).convert('RGBA')); q[:,:,3]=np.where(a>140,255,0)
        c=Image.new('RGBA',(W,H)); c.alpha_composite(Image.fromarray(q),((W-w)//2,H-h)); c.save(f'{n}_{dn}.png')
        sheet.alpha_composite(c,(i*84+2,[0,62,104][k]))
tiles=Image.new('RGB',(256,128)); 
for i in range(2):
    for j in range(2): tiles.paste(ws,(i*64,j*64)); tiles.paste(wd,(128+i*64,j*64))
pv=Image.new('RGBA',(588,280),(8,14,12,255)); pv.paste(tiles,(0,0)); pv.alpha_composite(sheet.crop((0,0,588,130)),(0,140))
pv.resize((588*2,560),Image.NEAREST).save('/workspace/sunken-keep/art/preview/water_items_2x.png')
