from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
import numpy as np, json
A='/home/box/agent-data/agents/886e9186-eb6c-4545-8ca0-bfda02eef844/assets/'
R='/workspace/sunken-keep/art/'
W,H=270,585
# bg: take generated, crop to tall portrait, colour-match
raw=Image.open(A+'ffcca144d5928cbd1ee016e2e5a49d6458fae7ea0e06b7083cc45e3b8e8c7f2d.jpg').convert('RGB').resize((1024,576))
# source is landscape; crop centre and stretch to portrait by sampling more of height via pad
# regenerate crop: take full width portion of interest and resize to 270x585
bg=raw.resize((480,270)).resize((270,152),Image.BOX)  # too short
# Better: use intro shot5 which is 854x480, crop for tall feel and pad with sky/water
s5=Image.open(R+'intro/shot5_swamp.png').convert('RGB')
s1=Image.open(R+'intro/shot1_keep.png').convert('RGB')
mid=raw.crop((230,0,794,576)).resize((270,276),Image.LANCZOS)
sky=raw.crop((230,0,794,70)).resize((270,150),Image.LANCZOS).filter(ImageFilter.GaussianBlur(1))
refl=mid.crop((0,276-159,270,276)).transpose(Image.FLIP_TOP_BOTTOM)
ra=np.asarray(refl,float)*0.5
for y in range(ra.shape[0]):
    sh=int(2*np.sin(y*0.7)); ra[y]=np.roll(ra[y],sh,0)
refl=Image.fromarray(ra.astype('uint8'))
bg=Image.new('RGB',(W,H)); bg.paste(sky,(0,0)); bg.paste(mid,(0,150)); bg.paste(refl,(0,426))
a=np.asarray(bg,float)
for y,k in ((150,16),(426,6)):
    seg=a[y-k:y+k].copy()
    for i in range(2*k):
        t=i/(2*k-1); a[y-k+i]=seg[0]*(1-t)+seg[-1]*t if y==150 else a[y-k+i]
bg=Image.fromarray(a.clip(0,255).astype('uint8'))
bg=ImageEnhance.Color(ImageEnhance.Contrast(bg).enhance(1.1)).enhance(0.95)
bg=bg.quantize(64,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('RGB')
bg.save('title_bg.png')
# logo from intro title, brighter
logo=Image.open(R+'intro/title.png').convert('RGBA')
# make orange/bronze glow
la=np.asarray(logo); mask=la[...,3]>0
rgb=la[...,:3].astype(float); rgb[mask]=rgb[mask]*np.array([1.1,0.85,0.55])+np.array([30,10,0])
logo=Image.fromarray(np.dstack([rgb.clip(0,255).astype('uint8'),la[...,3]]))
logo.save('title_logo.png')
# stone button 9slice-ish: make solid button sprites
def btn(w,h,pressed=False,dim=False):
    im=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(im)
    fill=(55,48,38,255) if not pressed else (35,30,24,255)
    if dim: fill=(40,38,36,255)
    edge=(140,110,60,255) if not dim else (80,70,50,255)
    hi=(180,150,90,255); sh=(20,16,12,255)
    d.rectangle((0,0,w-1,h-1),fill=fill,outline=edge)
    d.line((1,1,w-2,1),fill=hi if not pressed else sh)
    d.line((1,1,1,h-2),fill=hi if not pressed else sh)
    d.line((1,h-2,w-2,h-2),fill=sh if not pressed else hi)
    d.line((w-2,1,w-2,h-2),fill=sh if not pressed else hi)
    return im
for st,pr,di in (('normal',False,False),('pressed',True,False),('dim',False,True)):
    btn(120,28,pr,di).save(f'btn_{st}.png')
# compose title screen mock
scr=bg.convert('RGBA')
scr.alpha_composite(logo,((W-logo.width)//2,48))
# breathing windows: 3 tiny orange pixels as overlay frames later
ba=np.asarray(bg.convert('RGB')).astype(int)
m=(ba[...,0]>150)&(ba[...,0]-ba[...,2]>60)
m[:150]=False; m[426:]=False
wa=np.zeros((H,W,4),'uint8'); wa[m]=[255,170,70,255]
win=Image.fromarray(wa,'RGBA')
win.save('title_windows_glow.png'); scr.alpha_composite(win)
# font render
font=Image.open(R+'font/font_5x7.png').convert('RGBA')
fm=json.load(open(R+'font/font_5x7.json'))
def draw_text(im,text,x,y,col=(230,200,140,255),scale=2):
    for ch in text:
        g=fm['glyphs'].get(ch) or fm['glyphs'].get(ch.upper())
        if not g: x+=6*scale; continue
        cell=font.crop((g['x'],g['y'],g['x']+5,g['y']+9))
        a=np.asarray(cell); m=a[...,3]>0; rgb=np.zeros_like(a)
        rgb[m]=col; rgb[...,3][m]=255
        glyph=Image.fromarray(rgb).resize((5*scale,9*scale),Image.NEAREST)
        im.alpha_composite(glyph,(x,y)); x+=6*scale
    return x
# buttons
labels=['Continue','New Game','Load','Settings']
by=404
for i,lab in enumerate(labels):
    b=btn(140,30,False,i==0); scr.alpha_composite(b,((W-140)//2,by+i*38))
for i,lab in enumerate(labels):
    tw=len(lab)*12; draw_text(scr,lab,(W-tw)//2,by+i*38+6)
tag='Something holds the water back.'; ty=48+logo.height+6
draw_text(scr,tag,(W-len(tag)*6)//2,ty,col=(170,190,160,255),scale=1)
scr.save('title_screen.png')
# save slot frame
slot=Image.new('RGBA',(250,70),(0,0,0,0)); d=ImageDraw.Draw(slot)
d.rectangle((0,0,249,69),fill=(30,28,24,240),outline=(140,110,60,255))
d.rectangle((1,1,248,68),outline=(80,60,30,255))
# portrait wells
for i in range(4):
    x=8+i*36; d.rectangle((x,6,x+30,36),fill=(18,22,20,255),outline=(90,70,40,255))
slot.save('save_slot_frame.png')
empty=slot.copy()
draw_text(empty,'Empty slot',8,43,col=(150,135,105,255),scale=1)
draw_text(empty,'The keep is waiting.',8,56,col=(110,105,90,255),scale=1)
empty.save('save_slot_empty.png')
filled=slot.copy()
for i,n in enumerate(['brannoc','wren','ilsevar','mags']):
    p=Image.open(R+f'portraits/{n}_healthy.png').convert('RGBA').resize((28,28),Image.BOX)
    filled.alpha_composite(p,(9+i*36,7))
draw_text(filled,'Floor 12: Drowned Throne',8,43,scale=1)
draw_text(filled,'3:17 played',8,56,col=(170,160,130,255),scale=1)
filled.save('save_slot.png')
ow=Image.new('RGBA',(220,80),(0,0,0,0)); d=ImageDraw.Draw(ow)
d.rectangle((0,0,219,79),fill=(30,28,24,250),outline=(180,80,40,255))
d.rectangle((1,1,218,78),outline=(90,40,20,255))
ow.save('save_overwrite_frame.png')
owb=ow.copy()
for x,lab,col in ((20,'Overwrite',(200,80,60,255)),(120,'Keep it',(160,200,140,255))):
    bb=btn(80,22,False,False); owb.alpha_composite(bb,(x,48)); draw_text(owb,lab,x+(80-len(lab)*6)//2,55,col=col,scale=1)
draw_text(owb,'Overwrite this save?',(220-20*6)//2,12,col=(230,180,120,255),scale=1)
draw_text(owb,'The old run sinks for good.',(220-27*6)//2,26,col=(170,160,130,255),scale=1)
owb.save('save_overwrite.png')
# load screen mock
ls=bg.convert('RGBA').copy(); ls.alpha_composite(ImageEnhance.Brightness(ls.convert('RGB')).enhance(0.45).convert('RGBA'))
draw_text(ls,'Load Game',70,40,scale=3)
ls.alpha_composite(owb,((W-220)//2,380))
for i in range(3):
    s=filled if i==0 else empty; ls.alpha_composite(s,((W-250)//2,110+i*80))
ls.save('load_screen_mock.png')
# preview strip
pv=Image.new('RGBA',(W*2+8,H),(0,0,0,255)); pv.alpha_composite(scr,(0,0)); pv.alpha_composite(ls,(W+8,0))
pv.resize((pv.width*2,H*2),Image.NEAREST).save(R+'preview/title_save_2x.png')
json.dump({
 'canvas':[W,H],'bg':'title_bg.png','logo':'title_logo.png','logoPos':[(W-logo.width)//2,48],'windowsGlow':'title_windows_glow.png',
 'tagline':{'y':ty,'scale':1,'color':[170,190,160],'centered':True},
 'buttons':{'normal':'btn_normal.png','pressed':'btn_pressed.png','dim':'btn_dim.png','size':[140,30],
   'positions':{l:[65,by+i*38] for i,l in enumerate(labels)},'labelFontScale':2,
   'note':'labels drawn in code from story/title_text.json; Continue uses dim when no save exists'},
 'saveSlot':{'frame':'save_slot_frame.png','exampleFilled':'save_slot.png','exampleEmpty':'save_slot_empty.png','size':[250,70],
   'portraitWells':[[8+i*36,6,30,30] for i in range(4)],'portraitInset':[1,1,28,28],
   'textLines':[[8,43],[8,56]],'fontScale':1,'maxChars':39},
 'overwrite':{'frame':'save_overwrite_frame.png','example':'save_overwrite.png','size':[220,80],
   'textLines':[[0,12],[0,26]],'textCentered':True,
   'buttons':{'Overwrite':[20,48,80,22],'Keep it':[120,48,80,22]},'buttonImage':'btn_normal.png (scale to 80x22) or draw'},
 'hint':'pulse title_windows_glow.png alpha 0.4..1.0 over 2s for breathing windows; boat is baked into bg'
},open('title.json','w'),indent=1)
print('ok')
