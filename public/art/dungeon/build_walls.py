import random, numpy as np
from PIL import Image
S=4; TW,TH=160*S,140*S
BASE=np.array([0x1a,0x38,0x30],float)
def hexc(h): return np.array([int(h[i:i+2],16) for i in (1,3,5)],float)
def stone_tex(seed=1, aligned_region=None):
    rng=random.Random(seed); img=np.zeros((TH,TW,3)); img[:]=BASE*0.55
    # chunky noise at game-pixel resolution
    def chunky(scale=S): 
        n=np.array([[rng.random() for _ in range(TW//scale)] for _ in range(TH//scale)])
        return np.kron(n,np.ones((scale,scale)))
    noise=chunky()
    ch=14*S; frieze=10*S
    y=frieze; row=0
    while y<TH:
        x=-rng.randint(0,20*S) if row%2 else 0
        while x<TW:
            w=rng.randint(22,36)*S
            x0,x1=max(x,0),min(x+w,TW); y0,y1=y,min(y+ch,TH)
            if aligned_region and x0<aligned_region[1] and x1>aligned_region[0]:
                pass
            shade=1.0+rng.uniform(-0.15,0.15)
            tint=np.array([1.0,1.0+rng.uniform(-0.05,0.08),1.0])
            blk=BASE*shade*tint
            img[y0:y1,x0:x1]=blk*(0.85+0.3*noise[y0:y1,x0:x1,None])
            img[y0:y0+S,x0:x1]=blk*1.35      # top highlight
            img[y0:y1,x0:x0+S]=blk*1.2       # left highlight
            img[y1-S:y1,x0:x1]=blk*0.6       # bottom shadow
            img[y0:y1,max(x1-S,0):x1]=blk*0.6
            x+=w
        img[y:y+S,:]=BASE*0.3  # mortar
        y+=ch; row+=1
    # carved frieze with dwarven key pattern
    fr=BASE*1.15; img[0:frieze,:]=fr*(0.9+0.2*noise[0:frieze,:,None]); img[frieze-S:frieze,:]=BASE*0.35; img[0:S,:]=fr*1.3
    for x in range(0,TW,8*S):
        for (a,b,c,d) in [(1,2,7,3),(1,2,2,8),(1,7,5,8),(4,4,5,8)]:
            img[a*S:b*S if b>a else (a+1)*S, x+c*S-S:x+d*S-S] = BASE*0.45 if (a,b)!=(1,2) else BASE*0.45
    # pilasters at both edges
    for xs in (0, TW-12*S):
        p=BASE*1.1; img[frieze:,xs:xs+12*S]=p*(0.9+0.2*noise[frieze:,xs:xs+12*S,None])
        img[frieze:,xs+2*S:xs+3*S]=BASE*0.5; img[frieze:,xs+9*S:xs+10*S]=BASE*0.5
        img[frieze:,xs:xs+S]=p*1.3; img[frieze:,xs+11*S:xs+12*S]=BASE*0.4
    # moss blotches near lower half and mortar lines
    for _ in range(140):
        mx=rng.randrange(0,TW//S)*S; my=rng.randrange(TH//2//S,TH//S)*S
        for k in range(rng.randint(2,6)):
            xx=mx+rng.randint(-3,3)*S; yy=my+rng.randint(-1,1)*S
            if 0<=xx<TW-S and 0<=yy<TH-S: img[yy:yy+S,xx:xx+S]=hexc('#2f5a2a')*rng.uniform(0.8,1.2)
    # water damage streaks
    for _ in range(18):
        sx=rng.randrange(0,TW//S)*S; sy=rng.randrange(frieze//S,TH//2//S)*S; L=rng.randint(6,20)*S
        img[sy:sy+L,sx:sx+S]*=0.7
    # flooded base: water across the bottom
    wl=TH-18*S
    water=hexc('#0d2622')
    img[wl:,:]=img[wl:,:]*0.35+water*0.65
    for _ in range(40):
        rx=rng.randrange(0,TW//S-6)*S; ry=rng.randrange(wl//S+1,TH//S-1)*S; L=rng.randint(3,8)*S
        img[ry:ry+S,rx:rx+L]=hexc('#3c6e5e')
    img[wl:wl+S,:]=hexc('#4d8a74')
    return np.clip(img,0,255)
def door(img,kind):
    img=img.copy(); dx0,dx1=TW//2-28*S,TW//2+28*S; dy0=36*S; wl=TH-18*S
    # stone arch frame
    img[dy0-6*S:TH, dx0-6*S:dx1+6*S]=BASE*1.25
    img[dy0-6*S:dy0-5*S, dx0-6*S:dx1+6*S]=BASE*1.6
    img[dy0-6*S:TH, dx0-6*S:dx0-5*S]=BASE*1.5
    img[dy0-6*S:TH, dx1+5*S:dx1+6*S]=BASE*0.5
    # keystone
    img[dy0-10*S:dy0-2*S, TW//2-5*S:TW//2+5*S]=BASE*1.45; img[dy0-10*S:dy0-9*S, TW//2-5*S:TW//2+5*S]=BASE*1.8
    if kind=='locked':
        wood=hexc('#2b2219')
        for i,x in enumerate(range(dx0,dx1,8*S)):
            img[dy0:TH,x:x+8*S]=wood*(1.0+0.12*(i%2)); img[dy0:TH,x:x+S]=wood*0.5
        for by in (dy0+10*S, dy0+40*S, dy0+70*S):
            img[by:by+4*S,dx0:dx1]=hexc('#3b4442'); img[by:by+S,dx0:dx1]=hexc('#5c6866')
            for rx in range(dx0+3*S,dx1,10*S): img[by+S:by+3*S,rx:rx+2*S]=hexc('#7a8684')
        # red lock indicator
        cx,cy=TW//2,dy0+52*S
        img[cy-7*S:cy+7*S,cx-6*S:cx+6*S]=hexc('#3a1010')
        img[cy-5*S:cy+5*S,cx-4*S:cx+4*S]=hexc('#b01c1c')
        img[cy-3*S:cy+1*S,cx-2*S:cx+2*S]=hexc('#ff4a3a')
        img[cy+1*S:cy+4*S,cx-1*S:cx+1*S]=hexc('#3a1010')
    else:
        # dark corridor beyond, receding
        for y in range(dy0,TH):
            img[y,dx0:dx1]=hexc('#06100e')
        inner=(dx0+14*S,dx1-14*S,dy0+18*S,TH-28*S)
        img[inner[2]:inner[3],inner[0]:inner[1]]=hexc('#0e1f1b')
        # side walls of the corridor
        for i in range(14*S):
            t=i/(14*S)
            img[int(dy0+t*18*S):int(TH-t*10*S),dx0+i]=BASE*0.45*(1-t*0.5)
            img[int(dy0+t*18*S):int(TH-t*10*S),dx1-1-i]=BASE*0.35*(1-t*0.5)
        img[wl:,dx0:dx1]=hexc('#0b201c'); img[wl:wl+S,dx0+8*S:dx1-8*S]=hexc('#2f5c4e')
    img[wl:,:]=np.where(np.arange(TW)[None,:,None]>=0,img[wl:,:],img[wl:,:])
    return img
def secret(img,kind):
    img=img.copy(); x0,x1=TW//2-30*S,TW//2+30*S; y0=10*S
    if kind=='closed':
        # faint seams: slightly lighter vertical lines, aligned joints
        img[y0:TH-18*S,x0:x0+S]=BASE*0.8; img[y0:TH-18*S,x1-S:x1]=BASE*0.8
        for y in range(y0,TH-18*S,14*S): img[y:y+S,x0:x1]=BASE*0.42
    else:
        img[y0:TH,x0:x1]=hexc('#050c0b')
        inner=(x0+12*S,x1-12*S)
        img[y0+20*S:TH-24*S,inner[0]:inner[1]]=hexc('#0c1a17')
        # slab slid to the right, its edge visible
        img[y0:TH,x1-6*S:x1]=BASE*1.3; img[y0:TH,x1-6*S:x1-5*S]=BASE*1.7
        img[TH-18*S:,x0:x1]=hexc('#0b201c'); img[TH-18*S:TH-17*S,x0+6*S:x1-8*S]=hexc('#2f5c4e')
    return img
def front(tex,w,h,dark):
    im=Image.fromarray((tex*dark).astype('uint8')).resize((w,h),Image.BOX); return im
def side(tex,w,Ho,Hi,dark,ss=3):
    out=np.zeros((Ho,w,4))
    th,tw=tex.shape[:2]; ratio=Ho/Hi
    for y in range(Ho):
        for x in range(w):
            acc=np.zeros(3); n=0
            for sy in range(ss):
                for sx in range(ss):
                    fx=(x+(sx+.5)/ss)/w; fy=y+(sy+.5)/ss
                    h=Ho+(Hi-Ho)*fx; top=(Ho-h)/2
                    if top<=fy<top+h:
                        invz=1+(1/ratio-1)*fx; z=1/invz; u=(z-1)/(ratio-1)
                        v=(fy-top)/h
                        acc+=tex[min(th-1,int(v*th)),min(tw-1,int(u*tw))]; n+=1
            if n>ss*ss//2: out[y,x,:3]=acc/n*dark*(1-0.25*fx); out[y,x,3]=255
    return Image.fromarray(out.astype('uint8'),'RGBA')
FR={'near':(160,140,1.0),'mid':(120,100,0.81),'far':(80,70,0.62)}
SD={'near':(40,140,100,1.0),'mid':(30,100,70,0.81),'far':(20,70,50,0.62)}
wall=stone_tex(1)
pieces={}
for d,(w,h,k) in FR.items():
    pieces[f'wall_front_{d}']=front(wall,w,h,k)
    pieces[f'door_locked_{d}']=front(door(wall,'locked'),w,h,k)
    pieces[f'door_open_{d}']=front(door(wall,'open'),w,h,k)
    pieces[f'secret_closed_{d}']=front(secret(wall,'closed'),w,h,k)
    pieces[f'secret_open_{d}']=front(secret(wall,'open'),w,h,k)
for d,(w,Ho,Hi,k) in SD.items():
    l=side(wall,w,Ho,Hi,k); pieces[f'wall_left_{d}']=l; pieces[f'wall_right_{d}']=l.transpose(Image.FLIP_LEFT_RIGHT)
# shared palette
allimg=Image.new('RGB',(400,600)); y=0;x=0
for n,p in pieces.items():
    allimg.paste(p.convert('RGB'),(x,y)); x+=p.width
    if x>240: x=0; y+=140
from PIL import ImageDraw as _D
_d=_D.Draw(allimg)
for i,c in enumerate(['#3a1010','#b01c1c','#ff4a3a','#7a1414','#2b2219','#5c6866','#7a8684']):
    for k,m in enumerate([1.0,0.81,0.62]):
        rgb=tuple(int(int(c[j:j+2],16)*m) for j in (1,3,5)); _d.rectangle([380,i*40+k*12,399,i*40+k*12+11],fill=rgb)
pal=allimg.quantize(64,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
for n,p in pieces.items():
    rgba=p.convert('RGBA'); a=rgba.getchannel('A')
    q=rgba.convert('RGB').quantize(palette=pal,dither=Image.Dither.NONE).convert('RGBA'); q.putalpha(a)
    q.save(f'{n}.png'); pieces[n]=q
# preview: corridor composite in 270x200 view
V=Image.new('RGBA',(270,200),(8,14,12,255))
def put(n,x,y): V.alpha_composite(pieces[n],(x,y))
put('wall_front_far',95,65)
put('wall_left_far',75,65); put('wall_right_far',175,65)
put('door_locked_mid',75-75+75,50) if False else None
put('wall_left_mid',45,50); put('wall_right_mid',195,50)
put('wall_left_near',15,30); put('wall_right_near',225,30)
V.resize((1080,800),Image.NEAREST).save('/workspace/sunken-keep/art/preview/corridor_4x.png')
sheet=Image.new('RGBA',(5*164,140*3+12),(8,14,12,255))
for r,d in enumerate(['near','mid','far']):
    for c,k in enumerate(['wall_front','door_locked','door_open','secret_closed','secret_open']):
        sheet.alpha_composite(pieces[f'{k}_{d}'],(c*164+2,r*144+2))
sheet.resize((sheet.width*2,sheet.height*2),Image.NEAREST).save('/workspace/sunken-keep/art/preview/wall_pieces_2x.png')
print(len(pieces))
