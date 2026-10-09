import numpy as np
from PIL import Image, ImageEnhance
A='/home/box/agent-data/agents/886e9186-eb6c-4545-8ca0-bfda02eef844/assets/'
wall=Image.open(A+'9a285001acc2f20cb6179efa8c200a98f93f5c5588f49c3a105ae07d1c3c3c2e.jpg').convert('RGB')
door=Image.open(A+'605a103623da7f9bfba03a49a740573e3a29cec2d8cb0d62cff5f0d852883490.jpg').convert('RGB')
sconce=Image.open(A+'c73f7ef2f31d7c84b53a210a38d6f7512847d4b6f9f2f42925e5498816193d4f.jpg').convert('RGB')
wall=wall.resize((1024,576),Image.BOX); door=door.resize((1024,576),Image.BOX); sconce=sconce.resize((1024,576),Image.BOX)
# --- source textures (hi-res, ~8:7) ---
WH=515
wt=Image.new('RGB',(590,WH)); wt.paste(wall.crop((0,0,120,WH)),(0,0)); wt.paste(wall.crop((340,0,690,WH)),(120,0)); wt.paste(wall.crop((904,0,1024,WH)),(470,0))
dt=door.crop((230,0,790,495))
def tint(im,k=1.0):  # cold green cast like the mock, brightness k
    a=np.asarray(im).astype(float); a*=np.array([0.92,1.05,1.0])*k; return Image.fromarray(np.clip(a,0,255).astype('uint8'))
wt=tint(wt); dt=tint(dt)
# open door: darken the leaf area into a receding corridor
do=np.asarray(dt).astype(float).copy()
x0,x1,y0,y1=160,400,100,480
for y in range(95,y1):
    # arch top: semicircle centred 280 radius 120 at y<215
    for x in range(x0,x1):
        cx=x-280
        if y<215 and (cx*cx+(y-215)**2)>118**2: continue
        t=min(abs(cx)/120,1)
        depth=0.08+0.10*(1-t)
        do[y,x]=np.array([14,26,23])*(0.6+depth*3)
# inner corridor frame
do[180:430,225:335]=np.array([10,20,18]); do[180:430,225:229]=np.array([40,60,52]); do[180:430,331:335]=np.array([8,14,12])
do[420:480,170:390]=np.array([12,28,24]); do[420:423,180:380]=np.array([70,120,100])
dopen=Image.fromarray(np.clip(do,0,255).astype('uint8'))
# secret walls
wa=np.asarray(wt).astype(float)
sc=wa.copy(); sc[110:470,118:121]*=0.6; sc[110:470,469:472]*=0.6; sc[110:113,118:472]*=0.6  # faint seams around centre slab
so=wa.copy(); so[105:WH,120:470]=np.array([8,15,13]); so[160:WH,170:420]=np.array([10,19,17])
so[105:WH,440:470]=wa[105:WH,440:470]*1.25  # slab edge pulled aside
so[470:WH,120:470]=np.array([12,28,24])
sclosed=Image.fromarray(np.clip(sc,0,255).astype('uint8')); sopen=Image.fromarray(np.clip(so,0,255).astype('uint8'))
TEX={'wall':wt,'door_locked':dt,'door_open':dopen,'secret_closed':sclosed,'secret_open':sopen}
FR={'near':(160,140,1.0),'mid':(120,100,0.78),'far':(80,70,0.58)}
SD={'near':(40,140,100,1.0),'mid':(30,100,70,0.78),'far':(20,70,50,0.58)}
def front(tex,w,h,k): return ImageEnhance.Brightness(tex.resize((w,h),Image.BOX)).enhance(k)
def side(tex,w,Ho,Hi,dark,ss=3):
    t=np.asarray(tex).astype(float); th,tw=t.shape[:2]; out=np.zeros((Ho,w,4)); ratio=Ho/Hi
    for y in range(Ho):
        for x in range(w):
            acc=np.zeros(3); n=0
            for sy in range(ss):
                for sx in range(ss):
                    fx=(x+(sx+.5)/ss)/w; fy=y+(sy+.5)/ss; h=Ho+(Hi-Ho)*fx; top=(Ho-h)/2
                    if top<=fy<top+h:
                        z=1/(1+(1/ratio-1)*fx); u=(z-1)/(ratio-1); v=(fy-top)/h
                        acc+=t[min(th-1,int(v*th)),min(tw-1,int(u*tw))]; n+=1
            if n>ss*ss//2: out[y,x,:3]=acc/n*dark*(1-0.3*fx); out[y,x,3]=255
    return Image.fromarray(out.astype('uint8'),'RGBA')
P={}
for d,(w,h,k) in FR.items():
    for n,t in TEX.items():
        P[('wall_front' if n=='wall' else n)+'_'+d]=front(t,w,h,k).convert('RGBA')
side_src=wt.resize((300,262),Image.BOX)
for d,(w,Ho,Hi,k) in SD.items():
    l=side(side_src,w,Ho,Hi,k); P[f'wall_left_{d}']=l; P[f'wall_right_{d}']=l.transpose(Image.FLIP_LEFT_RIGHT)
# --- sconces ---
s=np.asarray(sconce).astype(int); key=((s[:,:,0]-s[:,:,1]>70)&(s[:,:,2]-s[:,:,1]>40))
rgba=np.dstack([np.asarray(sconce),np.where(key,0,255).astype('uint8')])
lit=Image.fromarray(rgba,'RGBA'); bb=lit.getbbox(); lit=lit.crop(bb)
cup_y=240-bb[1]  # flame above this row
dead=np.array(lit).copy(); dead[:cup_y,:,3]=0
cup=dead[cup_y:cup_y+60]; m=cup[:,:,3]>0; cup[m,:3]=(cup[m,:3]*0.35).astype('uint8')
dead=Image.fromarray(dead)
def flicker(im,i):
    a=np.array(im); fl=Image.fromarray(a[:cup_y]); base=Image.fromarray(a[cup_y:])
    sy=[1.0,0.9,1.08][i]; sx=[1.0,1.05,0.95][i]
    f2=fl.resize((max(1,int(fl.width*sx)),max(1,int(fl.height*sy))),Image.BICUBIC)
    out=Image.new('RGBA',(im.width,im.height+40)); out.alpha_composite(base,(0,40+cup_y)); out.alpha_composite(f2,((im.width-f2.width)//2+[0,3,-3][i],40+cup_y-f2.height))
    return out
SC={'near':(26,40),'mid':(17,26),'far':(11,17)}
src_dead=Image.new('RGBA',(lit.width,lit.height+40)); src_dead.alpha_composite(dead,(0,40))
srcs={'dead':src_dead,'lit_1':flicker(lit,0),'lit_2':flicker(lit,1),'lit_3':flicker(lit,2)}
for d,(w,h) in SC.items():
    for n,im in srcs.items():
        sm=im.resize((w,h),Image.BOX); a=np.array(sm); a[:,:,3]=np.where(a[:,:,3]>120,255,0)
        P[f'sconce_{n}_{d}']=Image.fromarray(a)
# --- shared palette & save ---
big=Image.new('RGB',(900,600)); x=y=0
for n,im in [(k,v) for k,v in P.items() if not k.startswith('sconce')]:
    if x+im.width>900: x=0; y+=145
    big.paste(im.convert('RGB'),(x,y)); x+=im.width+1
pal=big.quantize(96,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
spal=Image.new('RGB',(200,60)); sx=0
for k,v in P.items():
    if k.startswith('sconce'): spal.paste(v.convert('RGB'),(sx%200,0 if sx<200 else 30)); sx+=v.width
spal=spal.quantize(32,dither=Image.Dither.NONE)
for n,im in P.items():
    al=im.getchannel('A'); q=(im.convert('RGB').quantize(64,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE) if n.startswith('door_locked') else im.convert('RGB').quantize(palette=(spal if n.startswith('sconce') else pal),dither=Image.Dither.NONE)).convert('RGBA'); q.putalpha(al); q.save(n+'.png'); P[n]=q
# --- preview using backdrop + thick-block rule ---
def view(front_center='wall_front', sconce_left=True):
    V=Image.open('/workspace/sunken-keep/art/dungeon/backdrop_shallow.png').convert('RGBA')
    pos={'far':(95,65,80),'mid':(75,50,120),'near':(55,30,160)}
    # far: side blocks fronts + sides
    for dx in (-2,-1,1,2): V.alpha_composite(P['wall_front_far'],(95+dx*80,65))
    V.alpha_composite(P[front_center+'_far' if front_center!='wall_front' else 'wall_front_far'],(95,65))
    V.alpha_composite(P['wall_left_mid'],(45,50)); V.alpha_composite(P['wall_right_mid'],(195,50))
    V.alpha_composite(P['wall_left_near'],(15,30)); V.alpha_composite(P['wall_right_near'],(215,30))
    if sconce_left: V.alpha_composite(P['sconce_lit_1_mid'],(52,78))
    return V
a=view(); 
b=Image.open('/workspace/sunken-keep/art/dungeon/backdrop_shallow.png').convert('RGBA')
b.alpha_composite(P['wall_left_near'],(15,30)); b.alpha_composite(P['wall_right_near'],(215,30)); b.alpha_composite(P['door_locked_near'],(55,30)); b.alpha_composite(P['sconce_lit_2_near'],(30,70))
row=Image.new('RGBA',(548,200)); row.alpha_composite(a,(0,0)); row.alpha_composite(b,(278,0))
row.resize((548*3,600),Image.NEAREST).save('/workspace/sunken-keep/art/preview/v2_views_3x.png')
sheet=Image.new('RGBA',(5*164,3*144),(8,14,12,255))
for r,d in enumerate(['near','mid','far']):
    for c,k in enumerate(['wall_front','door_locked','door_open','secret_closed','secret_open']):
        sheet.alpha_composite(P[f'{k}_{d}'],(c*164+2,r*144+2))
sheet.resize((sheet.width*2,sheet.height*2),Image.NEAREST).save('/workspace/sunken-keep/art/preview/v2_pieces_2x.png')
sc=Image.new('RGBA',(4*30*3,50),(30,40,36,255))
for i,n in enumerate(['dead','lit_1','lit_2','lit_3']): sc.alpha_composite(P[f'sconce_{n}_near'],(i*30+2,4))
sc.resize((sc.width*3,150),Image.NEAREST).save('/workspace/sunken-keep/art/preview/v2_sconces_3x.png')
print(len(P))
