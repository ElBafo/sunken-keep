import numpy as np, json, random
from PIL import Image, ImageDraw
def hx(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))
rng=random.Random(7)
STONE=np.array(hx('#2a3330'),float)
def stone(w,h,base=STONE,seed=1):
    r=random.Random(seed); a=np.zeros((h,w,3)); a[:]=base
    n=np.array([[r.random() for _ in range(w)] for _ in range(h)])
    a*= (0.88+0.22*n)[...,None]
    # blocks
    y=0;row=0
    while y<h:
        x=-r.randint(0,14) if row%2 else 0
        while x<w:
            bw=r.randint(18,30); s=1+r.uniform(-0.08,0.08)
            a[y:y+12,max(x,0):x+bw]*=s
            a[y:y+12,max(x,0):max(x,0)+1]*=0.55
            x+=bw
        a[y:y+1,:]*=0.55; a[min(y+1,h-1):min(y+2,h),:]*=1.25
        y+=12;row+=1
    return a
def bevel(a,x0,y0,x1,y1,hi=1.45,lo=0.5,w=1):
    for k in range(w):
        a[y0+k,x0+k:x1-k]*=hi; a[y0+k:y1-k,x0+k]*=hi
        a[y1-1-k,x0+k:x1-k]*=lo; a[y0+k:y1-k,x1-1-k]*=lo
def well(a,x0,y0,x1,y1):
    a[y0:y1,x0:x1]=np.array(hx('#0a1211'),float)
    a[y0,x0:x1]=hx('#050908'); a[y0:y1,x0]=hx('#050908')
    a[y1-1,x0:x1]=hx('#4a5652'); a[y0:y1,x1-1]=hx('#4a5652')
def rivet(a,x,y):
    a[y,x]=hx('#c88a3a'); a[y+1,x]=hx('#6e4618'); a[y,x+1]=hx('#8a5a24'); a[y+1,x+1]=hx('#3a240c')
W,H=270,216
a=stone(W,H)
# outer bronze-trimmed frame
a[0:3,:]=hx('#5a3c1c'); a[0,:]=hx('#b07a34'); a[2,:]=hx('#2a1a0a')
bevel(a,0,0,W,H,w=2)
# carved dwarven knot band under the top trim
for x in range(4,W-4,8):
    for (dx,dy) in [(0,4),(1,4),(2,4),(2,5),(2,6),(3,6),(4,6),(4,5),(4,4),(5,4),(6,4)]:
        a[dy,x+dx]=np.array(hx('#141b19'),float)
L={}
L['log']=(6,10,264,58)
for i in range(4): L[f'attack_{i}']=(5+i*67,62,63+i*67,84)
for k,(c,r) in {'turn_left':(0,0),'forward':(1,0),'turn_right':(2,0),'strafe_left':(0,1),'back':(1,1),'strafe_right':(2,1)}.items():
    x=8+c*37; y=96+r*37; L['pad_'+k]=(x,y,x+35,y+35)
L['compass']=(124,92,166,134)
for r in range(3):
    for c in range(3):
        x=176+c*30; y=96+r*30; L[f'inv_{r*3+c}']=(x,y,x+28,y+28)
L['menu']=(124,142,166,166)
for k,(x0,y0,x1,y1) in L.items():
    if k.startswith(('pad_','attack_','menu')):
        continue
    # raised stone lip around wells
    bevel(a,x0-2,y0-2,x1+2,y1+2,hi=1.3,lo=0.6)
    well(a,x0,y0,x1,y1)
# bronze rivets at frame corners and between sections
for (x,y) in [(4,4),(W-6,4),(4,H-6),(W-6,H-6),(118,92),(118,170),(170,92),(170,170)]:
    rivet(a,x,y)
# little forge glow under compass
a[136:140,138:152]*=np.array([1.6,1.2,0.8])
img=Image.fromarray(np.clip(a,0,255).astype('uint8'))
# button sprites: stone keys with bronze trim, normal + pressed, 9-slice (margin 4)
def button(w,h,pressed):
    b=stone(w,h,base=np.array(hx('#3a4440'),float),seed=3)
    b[0,:]=hx('#7a5428'); b[-1,:]=hx('#7a5428'); b[:,0]=hx('#7a5428'); b[:,-1]=hx('#7a5428')
    if pressed: b[1:-1,1:-1]*=0.7; bevel(b,1,1,w-1,h-1,hi=0.6,lo=1.3)
    else: bevel(b,1,1,w-1,h-1,hi=1.45,lo=0.55)
    return Image.fromarray(np.clip(b,0,255).astype('uint8'))
button(12,12,False).save('button_9slice.png'); button(12,12,True).save('button_pressed_9slice.png')
# icons (bone-white with orange accent), 15x15
ICON={
'forward':["......#......",".....###.....","....#####....","...###.###...","..###...###..","......#......","......#......","......#......"],
'back':None,'turn_left':None,'turn_right':None,'strafe_left':None,'strafe_right':None}
def draw_icons():
    out={}
    C=hx('#d8ccb0'); S=hx('#1a1210'); A=hx('#ff8844')
    def mk(lines):
        h=len(lines); w=len(lines[0]); im=Image.new('RGBA',(w+2,h+2)); p=im.load()
        for y,l in enumerate(lines):
            for x,ch in enumerate(l):
                if ch!='.':
                    for dx,dy in [(1,2),(2,1),(1,1)][::-1]:
                        if p[x+dx,y+dy][3]==0: pass
                    p[x+1,y+2]=S+(255,) if p[x+1,y+2][3]==0 else p[x+1,y+2]
        for y,l in enumerate(lines):
            for x,ch in enumerate(l):
                if ch=='#': p[x+1,y+1]=C+(255,)
                if ch=='o': p[x+1,y+1]=A+(255,)
        return im
    up=["...#...","..###..",".#####.","###.###","#.#.#.#","..#.#..","..#.#..","..###.."]
    out['forward']=mk(up)
    out['back']=out['forward'].transpose(Image.FLIP_TOP_BOTTOM)
    tl=["..#.....",".##.....","#######.",".##...#.","..#...#.","......#.","......#.","......#."]
    out['turn_left']=mk(tl); out['turn_right']=out['turn_left'].transpose(Image.FLIP_LEFT_RIGHT)
    sl=["...#....","..##....",".#######","########",".#######","..##....","...#...."]
    out['strafe_left']=mk(sl); out['strafe_right']=out['strafe_left'].transpose(Image.FLIP_LEFT_RIGHT)
    out['attack']=mk(["......##",".....###","....###.","#..###..",".####...","..##....",".#.#....","#...#..."])
    out['menu']=mk(["#######","........","#######","........","#######"])
    return out
for k,im in draw_icons().items(): im.save(f'icon_{k}.png')
# compass faces: 40x40 well content, letter shown big + tick ring
font=Image.open('/workspace/sunken-keep/art/font/font_5x7.png').convert('RGBA'); fm=json.load(open('/workspace/sunken-keep/art/font/font_5x7.json'))
def glyph(ch):
    g=fm['glyphs'][ch] if 'glyphs' in fm else None
    i=ord(ch)-32; cx,cy=(i%16)*6,(i//16)*10
    return font.crop((cx,cy,cx+5,cy+9))
for d in 'NESW':
    c=Image.new('RGBA',(42,42)); dr=ImageDraw.Draw(c)
    dr.ellipse([2,2,39,39],outline=hx('#7a5428')+(255,)); dr.ellipse([3,3,38,38],outline=hx('#3a240c')+(255,))
    for ang,(x,y) in enumerate([(20,4),(36,20),(20,36),(4,20)]): c.putpixel((x,y),hx('#c88a3a')+(255,)); c.putpixel((x+1,y),hx('#c88a3a')+(255,))
    g=glyph(d).resize((15,27),Image.NEAREST); arr=np.array(g); m=arr[:,:,3]>0; arr[m,:3]=hx('#ff8844'); arr[m,3]=255
    c.alpha_composite(Image.fromarray(arr),(14,8)); c.save(f'compass_{d}.png')
img.save('panel_bg.png')
json.dump({'size':[W,H],'place':'directly under the portraits, left edge 0; if the panel ends up shorter/taller, scale nothing: crop/extend from the bottom (stone blocks tile)',
 'wells':{k:v for k,v in L.items() if not k.startswith(('pad_','attack_','menu'))},
 'buttons':{k:v for k,v in L.items() if k.startswith(('pad_','attack_','menu'))},
 'buttonSprites':{'normal':'button_9slice.png','pressed':'button_pressed_9slice.png','sliceMargin':4},
 'icons':'icon_{forward,back,turn_left,turn_right,strafe_left,strafe_right,attack,menu}.png, centre them on the button, shift 1px down when pressed',
 'compass':'compass_{N,E,S,W}.png (42x42), place at compass well top-left',
 'logText':'font_5x7, colour #d8ccb0, 6px padding, 4 lines of 10px'},open('panel.json','w'),indent=1)
# preview: full screen mock
scr=Image.new('RGBA',(270,480),(0,0,0,255))
scr.paste(Image.open('/workspace/sunken-keep/art/dungeon/backdrop_shallow.png'),(0,0))
for n,pos in [('wall_front_far',(95,65)),('wall_left_far',(75,65)),('wall_right_far',(175,65)),('wall_left_mid',(45,50)),('wall_right_mid',(195,50)),('wall_left_near',(15,30)),('wall_right_near',(215,30))]:
    scr.alpha_composite(Image.open(f'/workspace/sunken-keep/art/dungeon/{n}.png'),pos)
scr.alpha_composite(Image.open('/workspace/sunken-keep/art/dungeon/keep_rat_mid.png'),(110,125))
scr.paste((20,26,24),(0,200,270,270))
for i,n in enumerate(['brannoc','wren','ilsevar','mags']): scr.alpha_composite(Image.open(f'/workspace/sunken-keep/art/portraits/{n}_healthy.png').convert('RGBA'),(3+i*67,203))
P=img.convert('RGBA'); 
bn=Image.open('button_9slice.png'); bp=Image.open('button_pressed_9slice.png')
def nine(src,w,h,m=4):
    o=Image.new('RGBA',(w,h)); sw,sh=src.size
    xs=[(0,m,0,m),(m,sw-m,m,w-m),(sw-m,sw,w-m,w)]; ys=[(0,m,0,m),(m,sh-m,m,h-m),(sh-m,sh,h-m,h)]
    for sx0,sx1,dx0,dx1 in xs:
        for sy0,sy1,dy0,dy1 in ys:
            o.paste(src.crop((sx0,sy0,sx1,sy1)).resize((dx1-dx0,dy1-dy0),Image.NEAREST),(dx0,dy0))
    return o
for k,(x0,y0,x1,y1) in L.items():
    if k.startswith(('pad_','attack_','menu')):
        P.alpha_composite(nine(bp if k=='pad_forward' else bn,x1-x0,y1-y0).convert('RGBA'),(x0,y0))
        name=k.replace('pad_','').split('_')[0] if k.startswith('attack') else k.replace('pad_','')
        ic=Image.open(f'icon_{name}.png'); off=1 if k=='pad_forward' else 0
        P.alpha_composite(ic,(x0+(x1-x0-ic.width)//2,y0+(y1-y0-ic.height)//2+off))
P.alpha_composite(Image.open('compass_N.png'),(124,92))
# log text sample
txt=['The water deepens.','A keep rat eyes your bread.']
for li,t in enumerate(txt):
    for ci,ch in enumerate(t):
        g=np.array(glyph(ch)); m=g[:,:,3]>0; g[m,:3]=hx('#d8ccb0'); P.alpha_composite(Image.fromarray(g),(12+ci*6,16+li*10))
scr.alpha_composite(P,(0,270-6))
scr.resize((1080,1920),Image.NEAREST).resize((540,960),Image.NEAREST).save('/workspace/sunken-keep/art/preview/panel_mock_2x.png')
