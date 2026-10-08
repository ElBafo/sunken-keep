import random, json
from PIL import Image, ImageDraw
R='/workspace/sunken-keep/art/'
STONE=(92,96,84,255); LIT=(128,132,112,255); SH=(46,50,44,255); CUT=(28,30,26,255); MOSS=(58,86,48,255)
GLOW=[(255,170,60,255),(224,110,30,255),(150,60,20,255)]
SIZES={'near':(40,24),'mid':(26,16),'far':(16,10)}
def plate(w,h,seed,glow):
    rng=random.Random(seed); im=Image.new('RGBA',(w,h)); d=ImageDraw.Draw(im)
    d.rectangle([0,0,w-1,h-1],fill=SH); d.rectangle([1,1,w-2,h-2],fill=STONE)
    d.line([1,1,w-2,1],fill=LIT); d.line([1,1,1,h-2],fill=LIT)
    s=max(1,h//8); cols=max(2,(w-4)//(s*3+1)); x=3
    for c in range(cols):
        gx=x+c*(s*3+1); top=3; bot=h-4
        if gx+s*2>w-3: break
        strokes=[((0,0),(0,1)),((0,0),(1,0)),((1,0),(1,1)),((0,1),(1,1)),((0,0),(1,1)),((1,0),(0,1)),((0,.5),(1,.5))]
        for st in rng.sample(strokes,3):
            (a,b),(c2,e)=st
            col=GLOW[1] if glow else CUT
            d.line([gx+a*s*2,top+b*(bot-top),gx+c2*s*2,top+e*(bot-top)],fill=col)
    for _ in range(w*h//30):
        px,py=rng.randint(1,w-2),rng.choice([h-2,h-3,rng.randint(1,h-2)])
        if im.getpixel((px,py))==STONE: d.point((px,py),fill=MOSS)
    if glow:
        for y in range(h):
            for x in range(w):
                p=im.getpixel((x,y))
                if p==GLOW[1] and rng.random()<0.3: d.point((x,y),fill=GLOW[0])
        halo=Image.new('RGBA',(w+4,h+4)); hd=ImageDraw.Draw(halo)
        hd.rectangle([0,0,w+3,h+3],fill=(255,120,30,50)); hd.rectangle([1,1,w+2,h+2],fill=(255,120,30,90))
        halo.alpha_composite(im,(2,2)); im=halo
    return im
out={}
for i,name in enumerate(['carving_start','carving_door','carving_secret']):
    for dist,(w,h) in SIZES.items():
        f=f'{name}_{dist}.png'; plate(w,h,100+i,name=='carving_secret').save(R+'decals/'+f); out.setdefault(name,{})[dist]=f
json.dump({"note":"Front-wall decals, drawn natively at each distance (no scaling). Centre on the front wall piece at eye height. carving_secret has a 2px orange glow border, so it's 4px bigger each way.",
 "sizes":SIZES,"files":out},open(R+'decals/carvings.json','w'),indent=1)
pv=Image.new('RGBA',(320,40),(16,20,18,255)); x=4
for name in out:
    for dist in ['near','mid','far']:
        im=Image.open(R+'decals/'+out[name][dist]); pv.alpha_composite(im,(x,4 if dist=='near' else 8)); x+=im.width+3
    x+=3
pv.crop((0,0,x,32)).resize((x*6,32*6),Image.NEAREST).save(R+'preview/carvings_6x.png')
