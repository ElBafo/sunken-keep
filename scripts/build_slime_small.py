"""Floor 1 v2 small slime (0.8 x big slime world height) + slime_split_1..3."""
import os,json,glob,colorsys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
from PIL import Image
import sys; sys.path.insert(0,'scripts'); from slime_clean import clean, helmet_sprite
D='public/art/dungeon/monsters_v2/'; DISTS=['close','near','mid','far']
SZ=json.load(open(D+'sizes.json')); WALL=SZ['wallPx']; SQ={'close':'1','near':'2','mid':'3','far':'4'}
BIG=SZ["monsters"]["slime"]; H_SMALL=round(BIG["worldHeight"]*0.8,4)   # small = 0.8 x big slime
files=sorted(os.path.basename(f) for f in glob.glob(D+'slime_*.png') if not os.path.basename(f).startswith(('slime_small','slime_split')))
pal=set()
for f in files:
    for p in Image.open(D+f).convert('RGBA').getdata():
        if p[3]>=128: pal.add(p[:3])
pal=sorted(pal); OUT=min(pal,key=sum)
def tint(c):
    if c==OUT: return c
    h,l,s=colorsys.rgb_to_hls(*[v/255 for v in c]); l=min(1,l*1.08)
    g=colorsys.hls_to_rgb(h,l,s); r,gg,b=[round(v*255) for v in g]
    return (max(0,r-4),min(255,gg+6),max(0,b-4))
TINT={c:tint(c) for c in pal}
def near(c): return min(pal,key=lambda p:(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2)
def finish(im,do_tint):
    im=im.convert('RGBA'); w,h=im.size; px=im.load(); cache={}
    for y in range(h):
        for x in range(w):
            r,g,b,a=px[x,y]
            if a<128: px[x,y]=(0,0,0,0); continue
            c=cache.get((r,g,b)) or cache.setdefault((r,g,b),near((r,g,b))); px[x,y]=c+(255,)
    src=im.copy(); sp=src.load()
    for y in range(h):
        for x in range(w):
            if sp[x,y][3]==0: continue
            edge=any(not(0<=x+dx<w and 0<=y+dy<h) or sp[x+dx,y+dy][3]==0 for dx,dy in((1,0),(-1,0),(0,1),(0,-1)))
            c=OUT if edge else sp[x,y][:3]
            px[x,y]=(TINT[c] if do_tint else c)+(255,)
    return im
def small_canvas(d):
    bw,bh=BIG[d]['px']; s=H_SMALL/BIG['worldHeight']; return round(bw*s),round(WALL[SQ[d]]*H_SMALL)
HURT=[(120,128,81),(132,145,97),(152,152,117),(175,180,128)]
def lum(c): return 0.299*c[0]+0.587*c[1]+0.114*c[2]
def hurt_from(idle,ref):
    # flash frame rebuilt from the cleaned idle: squash to the hurt bbox, recolour onto the hurt ramp by luminance quartile
    b=idle.crop(idle.getbbox()); rb=ref.getbbox(); b=b.resize((rb[2]-rb[0],rb[3]-rb[1]),Image.NEAREST)
    out=Image.new('RGBA',ref.size,(0,0,0,0)); out.paste(b,(rb[0],rb[1]))
    p=out.load(); ls=sorted(lum(p[x,y]) for y in range(out.height) for x in range(out.width) if p[x,y][3])
    q=[ls[int(len(ls)*k/4)] for k in (1,2,3)]
    for y in range(out.height):
        for x in range(out.width):
            c=p[x,y]
            if c[3]: p[x,y]=HURT[sum(lum(c)>t for t in q)]+(255,)
    return out
_cache={}
def clean_src(stem):
    if stem not in _cache:
        if stem=='slime_hurt_1':
            _cache[stem]=hurt_from(clean_src('slime_idle_1'),Image.open(D+stem+'_close.png').convert('RGBA'))
        else: _cache[stem]=clean(Image.open(D+stem+'_close.png'))
    return _cache[stem]
made=[]
for f in files:
    d=f[:-4].rsplit('_',1)[1]; stem=f[:-4].rsplit('_',1)[0]
    src=clean_src(stem)   # largest source, helmet + bones painted out
    cw,ch=small_canvas(d)
    out=finish(src.resize((cw,ch),Image.LANCZOS),True)
    name=f.replace('slime','slime_small',1); out.save(D+name); made.append(name)
# split frames
def body(im):  # crop to opaque bbox
    return im.crop(im.getbbox())
WAIST=0.40
for d in DISTS:
    bigraw=Image.open(D+f'slime_idle_1_{d}.png').convert('RGBA'); big=clean(bigraw)
    sm=Image.open(D+f'slime_small_idle_1_{d}.png').convert('RGBA')
    bw,bh=big.size; sw,sh=sm.size; W=max(bw,2*sw+2); H=bh
    def canvas(): return Image.new('RGBA',(W,H),(0,0,0,0))
    helm=helmet_sprite(bigraw)
    # 1: squash + deep waist (40% of body height, pinched from the top), helmet kept, sitting under the pinch
    b=body(big); nw,nh=round(b.width*1.12),round(b.height*0.9)
    sq=b.resize((nw,nh),Image.NEAREST); p=sq.load(); cx=(nw-1)/2; depth=round(nh*WAIST); half=max(2,round(nw*0.10))
    for x in range(nw):
        t=1-((x-cx)/half)**2
        if t<=0: continue
        cut=max(1,round(depth*t**0.5))
        top=next((y for y in range(nh) if p[x,y][3]),None)
        if top is None: continue
        for yy in range(top,min(nh-1,top+cut)): p[x,yy]=(0,0,0,0)
    hs=helm.resize((max(1,round(helm.width*1.12)),max(1,round(helm.height*0.9))),Image.NEAREST)
    hy=min(nh-hs.height-1,depth+1)
    sq.alpha_composite(hs,(round(cx-hs.width/2+0.5),hy))
    c=canvas(); c.paste(sq,((W-nw)//2,H-nh),sq); c=finish(c,False)
    # 2: two smalls tearing apart, helmet dropped on the floor between them ; 3: two smalls apart
    hsm=helm.resize((max(1,round(helm.width*sw/bw)),max(1,round(helm.height*sw/bw))),Image.LANCZOS)
    for n,off in ((2,0.34),(3,0.5)):
        c2=canvas(); s_=body(sm); dx=round(s_.width*off)
        for sx in (W//2-dx-s_.width//2, W//2+dx-s_.width//2):
            c2.alpha_composite(s_,(max(0,min(W-s_.width,sx)),H-s_.height))
        if n==2:
            hb=finish(hsm,False); hb=hb.crop(hb.getbbox()); c2.alpha_composite(hb,(W//2-hb.width//2,H-hb.height))
        out=c2
        out.save(D+f'slime_split_{n}_{d}.png'); made.append(f'slime_split_{n}_{d}.png')
    c.save(D+f'slime_split_1_{d}.png'); made.append(f'slime_split_1_{d}.png')
# metadata
SZ['monsters']['slime_small']={'worldHeight':H_SMALL,'worldHeightSource':'floor1 v2 split (0.8 x slime)',
  **{d:{'squares':int(SQ[d]),'px':list(small_canvas(d)),'exactPx':round(WALL[SQ[d]]*H_SMALL,2),
       'quadWorld':[round(BIG[d]['quadWorld'][0]*0.8,4),round(BIG[d]['quadWorld'][1]*0.8,4)],'feetShifted':{},'rimLight':False} for d in DISTS}}
json.dump(SZ,open(D+'sizes.json','w'),indent=1)
A=json.load(open('public/art/dungeon/monster_anchor.json'))
def anchor(n):
    im=Image.open(D+n); bb=im.getbbox(); return {'footRow':bb[3]-1,'gapBelow':im.height-bb[3],'topRow':bb[1]}
for n in made: A['files'][n]=anchor(n)
for k in ('slime_small','slime_split'):
    A['summary'][k]={}
    for d in DISTS:
        fs=[n for n in made if n.startswith(k+'_') and n.endswith('_'+d+'.png')]
        g=sorted({A['files'][n]['gapBelow'] for n in fs})
        e={'frames':len(fs),'gapBelow':g,'consistent':len(g)==1,'offFrames':[n for n in fs if A['files'][n]['gapBelow']!=0]}
        if k=='slime_small':
            i=A['files'][f'slime_small_idle_1_{d}.png']; e['idleBodyHeightPx']=i['footRow']-i['topRow']+1
        A['summary'][k][d]=e
json.dump(A,open('public/art/dungeon/monster_anchor.json','w'),indent=1)
print(len(made),'frames')
