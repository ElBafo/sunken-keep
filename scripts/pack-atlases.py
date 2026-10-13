import os,json,glob,sys
from PIL import Image
P='public/'; title=[l.strip() for l in open('scripts/atlas-floor1-capture.txt')]
groups={'monsters':sorted(os.path.relpath(f,P) for f in glob.glob(P+'art/dungeon/monsters_v2/*.png')),
 'portraits':[f for f in title if f.startswith('art/portraits/')],
 'ui':[f for f in title if f.startswith('art/ui/') and not f.startswith('art/ui/title/')],
 'props':[f for f in title if f.startswith(('art/dungeon/','art/fx/hits/','proto3d/tex3d/torch/'))]}
PAD=2; MAX=2048; out={}
def pack(files,W):
    items=sorted(files,key=lambda f:(-Image.open(P+f).size[1],f)); pl={}; x=y=rowh=0; maxw=0
    for f in items:
        w,h=Image.open(P+f).size; cw,ch=w+2*PAD,h+2*PAD
        if x+cw>W: x=0;y+=rowh;rowh=0
        pl[f]=(x+PAD,y+PAD,w,h); x+=cw; rowh=max(rowh,ch); maxw=max(maxw,x)
    return pl,maxw,y+rowh
for g,files in groups.items():
    sheets=[]; rest=list(files)
    while rest:
        best=None
        for W in (256,512,1024,2048):
            pl,w,h=pack(rest,W)
            if h<=MAX: best=(pl,w,h); break
        if not best:  # split: take as many as fit
            pl,w,h=pack(rest,MAX); keep={f:v for f,v in pl.items() if v[1]+v[3]+PAD<=MAX}
            best=(keep,MAX,max(v[1]+v[3]+PAD for v in keep.values()))
        sheets.append(best); rest=[f for f in rest if f not in best[0]]
    for i,(pl,w,h) in enumerate(sheets):
        name=g if len(sheets)==1 else f'{g}_{i}'
        A=Image.new('RGBA',(w,h),(0,0,0,0))
        for f,(x,y,fw,fh) in pl.items():
            im=Image.open(P+f).convert('RGBA')
            # 1px extrude
            A.paste(im.crop((0,0,fw,1)),(x,y-1)); A.paste(im.crop((0,fh-1,fw,fh)),(x,y+fh))
            A.paste(im.crop((0,0,1,fh)),(x-1,y)); A.paste(im.crop((fw-1,0,fw,fh)),(x+fw,y))
            for cx,cy,dx,dy in ((0,0,-1,-1),(fw-1,0,fw,-1),(0,fh-1,-1,fh),(fw-1,fh-1,fw,fh)):
                A.putpixel((x+dx,y+dy),im.getpixel((cx,cy)))
            A.paste(im,(x,y))
        A.save(f'{P}art/atlas/{name}.png')
        json.dump({'image':f'art/atlas/{name}.png','size':{'w':w,'h':h},'padding':PAD,'extrude':1,
          'frames':{f:dict(zip('xywh',v)) for f,v in sorted(pl.items())}},open(f'{P}art/atlas/{name}.json','w'),indent=1)
        out[name]=(len(pl),w,h)
print(out)
