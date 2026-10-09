from PIL import Image, ImageDraw
import json
HI=(190,230,215,255); MID=(110,170,155,230); DK=(60,110,100,200)
sizes={'near':1.0,'mid':0.65,'far':0.4}
meta={}
for s,k in sizes.items():
    # drop: 3 frames (forming, falling, stretched)
    w=max(3,round(5*k)); h=max(4,round(9*k))
    fr=[]
    for i in range(3):
        im=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(im)
        cx=w//2
        if i==0: d.ellipse((cx-1,0,cx+1,max(2,h//3)),fill=MID); im.putpixel((cx,0),HI)
        elif i==1: d.ellipse((max(0,cx-w//2),h//3,min(w-1,cx+w//2),h-1),fill=MID); im.putpixel((cx,h//3+1),HI)
        else: d.line((cx,0,cx,h-1),fill=DK); d.point((cx,h-1),fill=HI); d.point((cx,h-2),fill=MID)
        im.save(f'drip_drop_{i+1}_{s}.png'); fr.append(f'drip_drop_{i+1}_{s}.png')
    # ripple: 4 frames, flattened ellipse rings growing and fading
    rw=max(8,round(28*k)); rh=max(4,round(9*k))
    for i in range(4):
        im=Image.new('RGBA',(rw,rh),(0,0,0,0)); d=ImageDraw.Draw(im)
        t=(i+1)/4; a=int(255*(1-t*0.7))
        ew=rw*t; eh=rh*t
        x0=(rw-ew)/2; y0=(rh-eh)/2
        d.ellipse((x0,y0,x0+ew-1,y0+eh-1),outline=HI[:3]+(a,))
        if i>=1:
            ew2=ew*0.5; eh2=eh*0.5
            d.ellipse(((rw-ew2)/2,(rh-eh2)/2,(rw+ew2)/2-1,(rh+eh2)/2-1),outline=MID[:3]+(a//2,))
        if i==0: d.point((rw//2,rh//2-1),fill=HI); d.point((rw//2,rh//2-2),fill=HI)
        im.save(f'drip_ripple_{i+1}_{s}.png')
    meta[s]={'drop':[w,h],'ripple':[rw,rh]}
json.dump({'note':'Drop falls from ceiling crack to the floor line of its band (near 192, mid 165, far 147), frame 1 holds ~0.4s at the crack, frame 2 falls, frame 3 just before impact; then ripple 1-4 at ~10fps centred on the floor line. Ripple only over water; on dry stone skip it.','sizes':meta},open('drip.json','w'),indent=1)
# preview
pv=Image.new('RGBA',(300,40),(20,30,28,255));x=2
for s in sizes:
    for i in range(1,4): im=Image.open(f'drip_drop_{i}_{s}.png'); pv.alpha_composite(im,(x,2)); x+=im.width+2
    for i in range(1,5): im=Image.open(f'drip_ripple_{i}_{s}.png'); pv.alpha_composite(im,(x,20)); x+=im.width+1
pv=pv.crop((0,0,x+2,40)); pv.resize((pv.width*6,240),Image.NEAREST).save('../preview/drip_6x.png')
print(x)
