import json
from PIL import Image, ImageDraw
A='/home/box/agent-data/agents/886e9186-eb6c-4545-8ca0-bfda02eef844/assets/'
ROOT='/workspace/sunken-keep/art/'
BG=(16,22,24,235); BRASS=(176,141,87,255); DARK=(74,56,32,255); HI=(222,190,130,255)
# 9-slice bubble: 12x12, slice margin 4
b=Image.new('RGBA',(12,12),(0,0,0,0)); d=ImageDraw.Draw(b)
d.rectangle([1,1,10,10],fill=BG)
d.line([2,0,9,0],fill=BRASS); d.line([2,11,9,11],fill=BRASS); d.line([0,2,0,9],fill=BRASS); d.line([11,2,11,9],fill=BRASS)
for p in [(1,1),(10,1),(1,10),(10,10)]: d.point(p,fill=BRASS)
d.line([2,1,9,1],fill=DARK); d.line([1,2,1,9],fill=DARK)
b.save(ROOT+'ui/bubble_9slice.png')
# tail 9x6 pointing down, top row overlaps bubble bottom border
t=Image.new('RGBA',(9,6),(0,0,0,0)); d=ImageDraw.Draw(t)
for y in range(6):
    l,r=y,8-y
    if l>r: break
    d.line([l,y,r,y],fill=BG); d.point((l,y),fill=BRASS); d.point((r,y),fill=BRASS)
d.line([0,0,8,0],fill=BG); d.point((0,0),fill=BRASS); d.point((8,0),fill=BRASS)
t.save(ROOT+'ui/bubble_tail.png')
json.dump({"bubble":"bubble_9slice.png, 12x12, slice margins 4px on every side; stretch the middle",
 "tail":"bubble_tail.png, 9x6, points down; place its top row over the bubble's bottom border, centred on the speaker's portrait",
 "layout":"bubble spans x 0-269 at the bottom of the 270x200 view; text padding 6px left/right, 4px top/bottom; 43 chars per line at 6px advance; 2 lines = 28px tall bubble"},
 open(ROOT+'ui/bubble.json','w'),indent=1)
# placeholder portraits from the concept sheet
sheet=Image.open(A+'9a15b194b7e33d53c07a763d47dd539456a379eb15203a235ec0e4708efb6367.jpg').convert('RGB')
boxes={'brannoc':(302,30,608,336),'wren':(672,30,978,336),'ilsevar':(302,387,608,693),'mags':(672,387,978,693)}
ports={}
import os
for n,bx in boxes.items():
    p=sheet.crop(bx).resize((64,64),Image.BOX).quantize(32,method=Image.Quantize.MEDIANCUT).convert('RGBA')
    if n=='mags': p=Image.open(ROOT+'portraits/mags_neutral_placeholder.png').convert('RGBA')
    else: p.save(ROOT+f'portraits/{n}_neutral_placeholder.png')
    ports[n]=p
# font renderer
F=Image.open(ROOT+'font/font_5x7.png'); FJ=json.load(open(ROOT+'font/font_5x7.json'))
def text(img,x,y,s,col=(236,226,200,255)):
    tint=Image.new('RGBA',F.size,col); tint.putalpha(F.getchannel('A'))
    for c in s:
        i=ord(c)-32; gx,gy=(i%16)*6,(i//16)*10
        img.alpha_composite(tint.crop((gx,gy,gx+5,gy+9)),(x,y)); x+=6
def wrap(s,n=43):
    out,line=[], ''
    for w in s.split():
        if len(line)+len(w)+(1 if line else 0)>n: out.append(line); line=w
        else: line=(line+' '+w).strip()
    return out+[line]
# mock 270x480 screen
scr=Image.new('RGBA',(270,480),(10,12,12,255))
view=Image.open(A+'a59b68adf9514830e8417f3a551b6d0c486abc3022ae71bab1cdfc4ac4ccdad4.jpg').convert('RGB')
view=view.crop((180,0,720,400)).resize((270,200),Image.BOX).quantize(32).convert('RGBA')
scr.alpha_composite(view,(0,0))
order=['brannoc','wren','ilsevar','mags']
for i,n in enumerate(order): scr.alpha_composite(ports[n],(3+i*67,206))
lines=wrap("Someone carry me. Brannoc. Not like that.")
lines=wrap("Big, slimy and coming straight at me. Story of my love life.")
h=len(lines)*10+8; by=200-h-8
bub=Image.new('RGBA',(270,h)); 
src=b
# 9-slice stretch
def nine(src,w,h,m=4):
    o=Image.new('RGBA',(w,h),(0,0,0,0)); s=src.size[0]
    for (sx0,sx1,dx0,dx1) in [(0,m,0,m),(m,s-m,m,w-m),(s-m,s,w-m,w)]:
        for (sy0,sy1,dy0,dy1) in [(0,m,0,m),(m,s-m,m,h-m),(s-m,s,h-m,h)]:
            o.alpha_composite(src.crop((sx0,sy0,sx1,sy1)).resize((dx1-dx0,dy1-dy0),Image.NEAREST),(dx0,dy0))
    return o
scr.alpha_composite(nine(b,270,h),(0,by))
spk=3; tx=3+spk*67+32-4
scr.alpha_composite(t,(tx,by+h-1))
for k,l in enumerate(lines): text(scr,6,by+4+k*10,l)
scr.save(ROOT+'preview/mock_screen_1x.png')
scr.resize((1080,1920),Image.NEAREST).save(ROOT+'preview/mock_screen_4x.png')
fp=Image.new('RGBA',(96,60),(16,22,24,255)); fp.alpha_composite(Image.open(ROOT+'font/font_5x7.png')); fp.resize((96*8,60*8),Image.NEAREST).save(ROOT+'preview/font_5x7_8x.png')
