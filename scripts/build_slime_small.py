"""Floor 1 v2 small slime (0.44 wall height, x0.8 of big slime) + slime_split_1..3."""
import os,json,glob,colorsys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
from PIL import Image
D='public/art/dungeon/monsters_v2/'; DISTS=['close','near','mid','far']
SZ=json.load(open(D+'sizes.json')); WALL=SZ['wallPx']; SQ={'close':'1','near':'2','mid':'3','far':'4'}
BIG=SZ['monsters']['slime']; H_SMALL=0.44
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
made=[]
for f in files:
    d=f[:-4].rsplit('_',1)[1]; stem=f[:-4].rsplit('_',1)[0]
    src=Image.open(D+stem+'_close.png').convert('RGBA')   # largest source
    cw,ch=small_canvas(d)
    out=finish(src.resize((cw,ch),Image.LANCZOS),True)
    name=f.replace('slime','slime_small',1); out.save(D+name); made.append(name)
# split frames
def body(im):  # crop to opaque bbox
    return im.crop(im.getbbox())
for d in DISTS:
    big=Image.open(D+f'slime_idle_1_{d}.png').convert('RGBA'); sm=Image.open(D+f'slime_small_idle_1_{d}.png').convert('RGBA')
    bw,bh=big.size; sw,sh=sm.size; W=max(bw,2*sw+2); H=bh
    def canvas(): return Image.new('RGBA',(W,H),(0,0,0,0))
    # 1: squash + waist
    b=body(big); nw,nh=round(b.width*1.12),round(b.height*0.9)
    sq=b.resize((nw,nh),Image.NEAREST); p=sq.load(); cx=nw/2; waist=max(1,round(nh*0.18)); half=max(1,round(nw*0.12))
    for x in range(nw):
        t=1-abs(x-cx)/half
        if t<=0: continue
        cut=round(waist*t)
        for y in range(nh):
            if p[x,y][3]:
                for yy in range(y,min(nh,y+cut)): p[x,yy]=(0,0,0,0)
                break
    c=canvas(); c.paste(sq,((W-nw)//2,H-nh),sq); c=finish(c,False)
    # 2: two blobs overlapping/separating ; 3: two smalls apart
    for n,off in ((2,0.28),(3,0.5)):
        c2=canvas() if n==2 else canvas()
        if n==1: pass
        s=body(sm); dx=round(s.width*off)
        for sx in (W//2-dx-s.width//2+ (0 if n==3 else 0), W//2+dx-s.width//2):
            c2.alpha_composite(s,(max(0,min(W-s.width,sx)),H-s.height))
        outs={2:finish(c2,True),3:c2}
        outs[n].save(D+f'slime_split_{n}_{d}.png'); made.append(f'slime_split_{n}_{d}.png')
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
