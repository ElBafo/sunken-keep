# Cave-in rubble front wall (near/mid/far) + 6-frame dust burst. Deterministic.
import os,random,math
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
from PIL import Image,ImageDraw
D='public/art/dungeon_v2/'
def pal(f):
    cs={c[:3] for _,c in Image.open(f).convert('RGBA').getcolors(99999)}
    cs=[c for c in cs if max(c)-min(c)<=24 and not (c[2]>c[1] or c[0]>c[1]+4)]  # drop tinted outliers
    return sorted(cs,key=lambda c:sum(c))
def lum(c): return sum(c)
def build(W,H,seed,detail):
    r=random.Random(seed); P=pal(D+'wall_plain.png') if False else None
    im=Image.new('RGB',(W,H),(64,64,64)); d=ImageDraw.Draw(im)
    s=W/160
    # shade levels as indexes into a 0..1 brightness ramp, mapped later to palette
    def rock(cx,cy,rw,rh,base,jag):
        n=r.randint(6,9); pts=[]
        for i in range(n):
            a=2*math.pi*i/n+r.uniform(-.25,.25); k=r.uniform(1-jag,1)
            pts.append((cx+math.cos(a)*rw*k,cy+math.sin(a)*rh*k))
        d.polygon(pts,fill=(int(base*0.55*255),)*3)          # shadow body
        d.polygon([(x-1*s,y-1*s) for x,y in pts],fill=(int(base*255),)*3)
        # lit top-left facet
        top=[p for p in pts if p[1]<cy+rh*0.1]
        if len(top)>2: d.polygon([(x-1*s,y-1*s) for x,y in top],fill=(int(min(1,base*1.35)*255),)*3)
        if detail and rw>6*s and r.random()<.6:  # crack
            x0=cx+r.uniform(-rw,rw)*.4; y0=cy-rh*.5
            d.line([(x0,y0),(x0+r.uniform(-3,3)*s,cy),(x0+r.uniform(-4,4)*s,cy+rh*.5)],fill=(20,20,20),width=1)
    # 1) broken wall: big tilted blocks over upper/mid area, with dark gaps between
    rows=[(-4,22),(16,24),(36,24),(56,24),(74,22)]
    for y0,h in rows:
        x=-r.randint(4,20)
        while x<W/s+10:
            w=r.randint(24,42)
            rock((x+w/2)*s,(y0+h/2+r.uniform(-2,2))*s,(w/2+2)*s,(h/2+2)*s,r.uniform(.4,.7),.1)
            x+=w+r.randint(0,2)
    # a few deep dark gaps (no light)
    for _ in range(5 if detail else 3):
        gx,gy=r.uniform(15,145),r.uniform(8,70); gw,gh=r.uniform(3,7),r.uniform(2,4)
        d.polygon([((gx-gw)*s,gy*s),(gx*s,(gy-gh)*s),((gx+gw)*s,(gy+r.uniform(-1,1))*s),(gx*s,(gy+gh)*s)],fill=(0,0,0))
    # 2) fallen blocks
    for _ in range(int(7)):
        rock(r.uniform(10,150)*s,r.uniform(70,95)*s,r.uniform(9,18)*s,r.uniform(7,12)*s,r.uniform(.5,.85),.3)
    # 3) sloped pile: higher in middle, spreading full width onto floor
    for _ in range(int(140*(1 if detail else .5))):
        x=r.uniform(-5,165); top=95-28*math.exp(-((x-80)/55)**2)
        y=r.uniform(top,H/s+2); sz=r.uniform(3,7)+(y-top)*0.05
        rock(x*s,y*s,sz*s,sz*.7*s,r.uniform(.4,.95),.35)
    # pebbles spilling onto floor (bottom strip)
    for _ in range(int(60*(1 if detail else .4))):
        x=r.uniform(0,160); y=r.uniform(128,140)
        rock(x*s,y*s,r.uniform(1,2.5)*s,r.uniform(.8,1.6)*s,r.uniform(.3,.7),.2)
    return im
def to_pal(gray,target):
    P=pal(target); n=len(P); out=Image.new('RGBA',gray.size)
    px=gray.load(); o=out.load()
    for y in range(gray.height):
        for x in range(gray.width):
            v=(px[x,y][0]/255)**1.35; o[x,y]=P[min(n-1,int(v*(n-1)+.5))]+(255,)
    return out
for dist,seed,det in (('near',7,1),('mid',7,1),('far',7,0)):
    ref=D+f'wall_front_{dist}.png'; W,H=Image.open(ref).size
    g=build(W,H,seed,det); to_pal(g,ref).save(D+f'rubble_front_{dist}.png')
# dust burst, 160x140, dust.png palette (two tones, alpha in 17-steps)
DUST=[(145,141,125),(188,184,168)]
os.makedirs('public/proto3d/fx',exist_ok=True)
r=random.Random(3); parts=[(r.uniform(25,135),r.uniform(70,125),r.uniform(-1.5,1.5),r.uniform(-1.6,-.3),r.uniform(18,30),r.random()<.35) for _ in range(34)]
for f in range(6):
    im=Image.new('RGBA',(160,140)); px=im.load(); t=(f+1)/6
    life=[0.55,1,0.95,0.75,0.45,0.2][f]
    for x0,y0,vx,vy,rad,hi in parts:
        cx=x0+vx*f*5; cy=y0+vy*f*7+(f*f*0.3); R=rad*(0.45+t*0.9)
        for y in range(int(cy-R),int(cy+R)+1):
            for x in range(int(cx-R),int(cx+R)+1):
                if 0<=x<160 and 0<=y<140:
                    dd=math.hypot(x-cx,y-cy)/R
                    if dd<1:
                        a=(1-dd)*life*(0.8 if hi else 0.5)*255
                        if (x+y+f)%2 and a<60: a*=0.6   # dither edges
                        old=px[x,y][3]; a=min(221,max(old,int(a/17)*17))
                        if a: px[x,y]=DUST[1 if hi and dd<.5 else 0]+(a,)
    im.save(f'public/proto3d/fx/dust_burst_{f+1}.png')
