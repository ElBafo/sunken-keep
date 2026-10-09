import numpy as np
from PIL import Image
A='/home/box/agent-data/agents/886e9186-eb6c-4545-8ca0-bfda02eef844/assets/'
SRC={'brannoc':'437a72d7154b73288b36df67fbbf342c95fae818558120e8602093c46502bcaf.jpg',
'wren':'a15cd1c5d9284383c4e5f9166a80810fdb366a8c935e05f67b1d5c02ef18aa61.jpg',
'ilsevar':'f4a854cd55a4d3e4f8011850a92be5888a722903da8be03ea2d10ce5cac3c1dd.jpg',
'mags':'dc3f6425518ef967bdfa0cc064686e08bea9e506145ecc2d2d54b041e5c8d432.jpg'}
ALIGN={'brannoc':0.15,'wren':0.6,'ilsevar':0.1,'mags':0.15}  # where the square sits vertically in the panel
STATES=['healthy','wounded','near_death']
sheet=Image.new('RGBA',(3*67+3,4*67+3),(10,12,12,255))
for r,(n,f) in enumerate(SRC.items()):
    im=Image.open(A+f).convert('RGB'); a=np.asarray(im).astype(int).sum(2)
    cols=(a>30).mean(0)>0.3; rows=(a>30).mean(1)>0.3
    # panels = runs of True cols
    runs=[];s=None
    for x,v in enumerate(cols):
        if v and s is None: s=x
        if not v and s is not None:
            if x-s>100: runs.append((s,x))
            s=None
    if s is not None and len(cols)-s>100: runs.append((s,len(cols)))
    ys=np.where(rows)[0]; y0,y1=ys.min(),ys.max()
    FIX={'wren':([(44,400),(465,815),(881,1238)],112,578),'ilsevar':([(50,415),(458,821),(865,1230)],144,548)}
    if n in FIX: runs,y0,y1=FIX[n]
    print(n,runs,y0,y1)
    for i,(x0,x1) in enumerate(runs[:3]):
        w=x1-x0-8; h=y1-y0
        top=y0+int((h-w)*ALIGN[n]) if h>w else y0
        p=im.crop((x0+4,top,x0+4+w,top+w)).resize((64,64),Image.BOX).quantize(64,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('RGBA')
        p.save(f'portraits/{n}_{STATES[i]}.png'); sheet.alpha_composite(p,(3+i*67,3+r*67))
sheet.resize((sheet.width*4,sheet.height*4),Image.NEAREST).save('preview/health_states_4x.png')
