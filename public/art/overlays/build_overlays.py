import random, json
from PIL import Image, ImageDraw
R='/workspace/sunken-keep/art/'
DK=(70,6,8,255); MD=(128,14,16,255); BR=(176,24,24,255); HL=(222,70,60,255)
def splat(d,rng,cx,cy,r):
    for y in range(cy-r-2,cy+r+3):
        for x in range(cx-r-2,cx+r+3):
            q=(x-cx)**2+(y-cy)**2
            if 0<=x<64 and 0<=y<64 and (q<=r*r*0.6 or (q<=(r+2)**2 and rng.random()<0.25)):
                d.point((x,y),fill=BR if q<r*r*0.3 else rng.choice([MD,MD,DK]))
    d.point((cx,cy),fill=HL)
def drip(d,rng,x,y,length):
    w=2 if length>5 else 1
    for i in range(length):
        for dx in range(w):
            if 0<=y+i<64 and 0<=x+dx<64: d.point((x+dx,y+i),fill=MD if dx else BR)
    for dx in (-1,0,1,2)[:w+2]:
        if 0<=y+length<64 and 0<=x+dx<64: d.point((x+dx,y+length),fill=DK)
    if 0<=y+length+1<64: d.point((x,y+length+1),fill=DK)
def cut(d,rng,x,y,l):
    for i in range(l):
        d.point((x+i,y+i//2),fill=DK); d.point((x+i,y+i//2+1),fill=BR)
    for k in range(2): drip(d,rng,x+rng.randint(0,l-1),y+l//2+1,rng.randint(3,7))
rng=random.Random(7)
img=Image.new('RGBA',(64,64)); d=ImageDraw.Draw(img)
levels={}
# light: a cut and a couple of splashes near the edges
cut(d,rng,6,26,9); splat(d,rng,56,10,3); splat(d,rng,5,54,3); drip(d,rng,58,0,7)
levels['light']=img.copy()
# wounded: more cuts, splatter, drips from the top edge
cut(d,rng,40,40,8); splat(d,rng,50,52,3); splat(d,rng,12,8,3)
for x in rng.sample(range(2,62,3),4): drip(d,rng,x,0,rng.randint(3,10))
levels['wounded']=img.copy()
# badly hurt: heavy splatter, long drips, red edge vignette
splat(d,rng,58,34,4); splat(d,rng,6,20,4); splat(d,rng,30,60,3); cut(d,rng,22,14,10)
for x in rng.sample(range(1,63,3),6): drip(d,rng,x,0,rng.randint(6,18))
vig=Image.new('RGBA',(64,64)); vp=vig.load()
for y in range(64):
    for x in range(64):
        e=min(x,y,63-x,63-y)
        if e<6: vp[x,y]=(110,0,0,int(110*(1-e/6)))
levels['badly_hurt']=Image.alpha_composite(vig,img)
for k,v in levels.items(): v.save(R+f'overlays/blood_{k}.png')
# hit flash, two frames
for i,a in enumerate([150,70]):
    f=Image.new('RGBA',(64,64)); fp=f.load()
    for y in range(64):
        for x in range(64):
            e=min(x,y,63-x,63-y); fp[x,y]=(255,40,30,min(255,int(a*(1.0 if e<3 else 0.75))))
    f.save(R+f'overlays/hit_flash_{i+1}.png')
json.dump({"size":"64x64, see-through, draw on top of any expression",
 "blood":["blood_light.png","blood_wounded.png","blood_badly_hurt.png"],
 "bloodNote":"each level already includes the one before it, so show only one at a time",
 "hitFlash":["hit_flash_1.png","hit_flash_2.png"],"hitFlashTiming":"about 60 ms each, then remove"},
 open(R+'overlays/overlays.json','w'),indent=1)
# preview
row=Image.new('RGBA',(270,70),(10,12,12,255))
ov=[levels['light'],levels['wounded'],levels['badly_hurt'],Image.open(R+'overlays/hit_flash_1.png')]
for i,n in enumerate(['brannoc','wren','ilsevar','mags']):
    p=Image.open(R+f'portraits/{n}_neutral_placeholder.png').convert('RGBA')
    row.alpha_composite(Image.alpha_composite(p,ov[i]),(3+i*67,3))
row.resize((1080,280),Image.NEAREST).save(R+'preview/overlays_4x.png')
