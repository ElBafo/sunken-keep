import json, numpy as np
from PIL import Image
A='/home/box/agent-data/agents/886e9186-eb6c-4545-8ca0-bfda02eef844/assets/'
R='/workspace/sunken-keep/art/'
SHOTS={1:'3547685d887a930b1b6596ebd36df1accef462bdc17c6d8e9489ec9d3c580500.jpg',
2:'1e55573a1f7618da6a16e676769bd5d8816d1821eb877d3fb3593d9ac7f9e909.jpg',
3:'95a5a43f2943eb177848649138067526331bed9d895219a42aea04f1016f91fd.jpg',
4:'6c409bee4c77bb92c7b60979d720f327c7ad9e1370402112fcbc9d78a99f7604.jpg',
5:'53f4884d0dbb05708ded72af105c4eb56538d67b0319796589172c29d4ebb871.jpg',
6:'56478a02d92a6ecf50beeea4fd4b0bc8d6d9c7fee6e9110187d7331fa37222f4.jpg'}
NAMES={1:'keep',2:'sinking',3:'forge',4:'drowned',5:'swamp',6:'gate'}
def px(im,w=427,h=240,colors=64):
    return im.resize((w,h),Image.BOX).quantize(colors,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('RGBA').resize((w*2,h*2),Image.NEAREST)
meta={"canvas":"270x480","note":"Each shot is 854x480 (art drawn at 2x the game's pixel size). Show a 270x480 window and pan it sideways by panX (from -> to, in px, left edge of the window).","shots":{}}
PAN={1:(150,430,'pan right across the keep'),2:(430,150,'pan back left while the keep sinks; shake and lightning flashes in code'),
3:(292,292,'hold on the anvil and dying forge; bubbles, light rays and the falling hammer in code'),
4:(100,420,'slow pan right as the eyes open one by one'),
5:(292,292,'hold; boat sprite glides up from the bottom, fog layers drift in code'),
6:(0,584,'slow pan left to right so each party member gets their beat, then the title fades in')}
for k,f in SHOTS.items():
    o=px(Image.open(A+f).convert('RGB')); fn=f'shot{k}_{NAMES[k]}.png'; o.save(fn)
    meta['shots'][k]={"file":fn,"panX":[PAN[k][0],PAN[k][1]],"direction":PAN[k][2]}
# shot 4 eyes: positions are the centre of each pair in shot coords; open order = list order
EYES=[(430,272,1),(338,273,1),(528,273,1),(385,276,1),(260,284,1),(485,284,1),(564,275,1),(146,298,2)]
meta['shots'][4]['eyes']={"sprite":"eyes.png","frames":"3 frames of 8x2 (scale 1) or 16x4 (scale 2): closed, half, open","positions":[{"x":x,"y":y,"scale":s} for x,y,s in EYES],"timing":"open one pair every ~0.6 s, last one is closest"}
e=Image.new('RGBA',(24,2))
for i,c in enumerate([(0,0,0,0),(70,140,100,255),(170,255,200,255)]):
    for x in (i*8+1,i*8+2,i*8+5,i*8+6):
        for y in (0,1): e.putpixel((x,y),c)
    if i==2:
        for x in (i*8+2,i*8+6): e.putpixel((x,0),(240,255,240,255))
e.save('eyes.png'); e.resize((48,4),Image.NEAREST).save('eyes_2x.png')
# boat sprite, chroma key magenta
b=Image.open(A+'53ce057a99c007baeec3882831894a84ca243614b8ffaddcfd6851db31dbb5e6.jpg').convert('RGB').crop((450,100,840,600))
a=np.asarray(b).astype(int); key=(a[:,:,0]>180)&(a[:,:,1]<90)&(a[:,:,2]>180)
rgba=np.dstack([a,np.where(key,0,255)]).astype('uint8'); bi=Image.fromarray(rgba,'RGBA')
bb=bi.getbbox(); bi=bi.crop(bb); w=40; h=round(bi.height*w/bi.width)
small=bi.resize((w,h),Image.BOX); al=np.asarray(small)[:,:,3]
sm=small.convert('RGB').quantize(32,dither=Image.Dither.NONE).convert('RGBA'); s=np.array(sm); s[:,:,3]=np.where(al>140,255,0)
Image.fromarray(s).resize((w*2,h*2),Image.NEAREST).save('boat.png')
meta['shots'][5]['boat']={"sprite":"boat.png","path":"from (x 427, y 500) to (x 427, y 330), centre of sprite, over ~5 s, ease out"}
# title
F=Image.open(R+'font/font_5x7.png')
def word(s,scale,col):
    im=Image.new('RGBA',(len(s)*6*scale,7*scale+scale)); tint=Image.new('RGBA',F.size,col); tint.putalpha(F.getchannel('A'))
    for i,c in enumerate(s):
        n=ord(c)-32; g=tint.crop(((n%16)*6,(n//16)*10,(n%16)*6+5,(n//16)*10+7)).resize((5*scale,7*scale),Image.NEAREST)
        im.alpha_composite(g,(i*6*scale,0))
    return im
def styled(s,scale):
    base=word(s,scale,(222,170,90,255)); hi=word(s,scale,(255,228,160,255)); sh=word(s,scale,(30,14,6,255))
    o=Image.new('RGBA',(base.width+2,base.height+2))
    for dx,dy in [(0,0),(2,0),(0,2),(2,2),(1,2),(2,1)]: o.alpha_composite(sh,(dx,dy))
    o.alpha_composite(base,(1,1)); top=hi.crop((0,0,hi.width,scale*3)); o.alpha_composite(top,(1,1)); return o
t1=styled('THE',2); t2=styled('SUNKEN KEEP',3)
T=Image.new('RGBA',(270,t1.height+t2.height+4)); T.alpha_composite(t1,((270-t1.width)//2,0)); T.alpha_composite(t2,((270-t2.width)//2,t1.height+4)); T.save('title.png')
meta['title']={"file":"title.png","place":"centred at y 60 on shot 6, fade in over 1.5 s"}
json.dump(meta,open('intro.json','w'),indent=1)
# preview: one 270x480 frame per shot
pv=Image.new('RGBA',(6*274,480),(0,0,0,255))
for i,k in enumerate(SHOTS):
    im=Image.open(f'shot{k}_{NAMES[k]}.png'); x=(PAN[k][0]+PAN[k][1])//2; fr=im.crop((x,0,x+270,480))
    if k==4:
        for (ex,ey,s) in EYES:
            if x<=ex<x+270:
                sp=Image.open('eyes.png' if s==1 else 'eyes_2x.png'); w8=8*s; fr.alpha_composite(sp.crop((2*w8,0,3*w8,2*s)),(ex-x-w8//2,ey-s))
    if k==5: bt=Image.open('boat.png'); fr.alpha_composite(bt,(135-bt.width//2,330-bt.height//2))
    if k==6: fr.alpha_composite(T,(0,40))
    pv.alpha_composite(fr,(i*274,0))
pv.resize((pv.width*2//2,480),Image.NEAREST).save(R+'preview/intro_frames.png')
print('ok',T.size)
