"""Paint helmet + bones out of big-slime frames by patch-copying the slime's own body texture."""
import colorsys
from PIL import Image
N8=[(dx,dy) for dx in(-1,0,1) for dy in(-1,0,1) if dx or dy]
def foreign(c):
    if c[3]<128 or sum(c[:3])==0: return False
    h,s,v=colorsys.rgb_to_hsv(*[v/255 for v in c[:3]])
    return h*360<50 or s<0.12
def components(im):
    w,h=im.size; p=im.load(); seen=set(); comps=[]
    for y in range(h):
        for x in range(w):
            if (x,y) in seen or not foreign(p[x,y]): continue
            st=[(x,y)]; seen.add((x,y)); comp=[]
            while st:
                a,b=st.pop(); comp.append((a,b))
                for dx,dy in N8:
                    q=(a+dx,b+dy)
                    if 0<=q[0]<w and 0<=q[1]<h and q not in seen and foreign(p[q]):
                        seen.add(q); st.append(q)
            comps.append(comp)
    return comps
def split_masks(im,min_px=5):
    """returns (helmet_pixels, other_foreign_components) ; helmet = largest component"""
    cs=[c for c in components(im) if len(c)>=min_px]; cs.sort(key=len,reverse=True)
    return (cs[0] if cs else []), cs[1:]
def find_shift(p,m,ok,maxr=120):
    for r in range(2,maxr):
        for dx,dy in [(r,0),(-r,0),(0,-r),(0,r),(r,-r),(-r,-r),(r,r),(-r,r)]:
            if all(ok(x+dx,y+dy) for x,y in m): return (dx,dy)
    return None
def fill_region(p,m,interior,allmask):
    bad=set(m)|allmask
    ok=lambda x,y: interior(x,y) and (x,y) not in bad
    sh=find_shift(p,m,ok)
    if sh:
        for x,y in m: p[x,y]=p[x+sh[0],y+sh[1]]
        return
    for T in (8,5,3,1):
        tiles={}
        for q in m: tiles.setdefault((q[0]//T,q[1]//T),[]).append(q)
        left=[]
        for t in tiles.values():
            sh=find_shift(p,t,ok)
            if sh:
                for x,y in t: p[x,y]=p[x+sh[0],y+sh[1]]
            else: left+=t
        m=left
        if not m: return
EYE=(175,180,128)
def eyes(im):
    w,h=im.size; p=im.load(); pts=set()
    seen=set()
    for y in range(h):
        for x in range(w):
            if (x,y) in seen or p[x,y][:3]!=EYE or p[x,y][3]<128: continue
            st=[(x,y)]; seen.add((x,y)); c=[]
            while st:
                a,b=st.pop(); c.append((a,b))
                for dx,dy in N8:
                    q=(a+dx,b+dy)
                    if 0<=q[0]<w and 0<=q[1]<h and q not in seen and p[q][:3]==EYE and p[q][3]>=128: seen.add(q); st.append(q)
            if len(c)>=max(6,w*h//2500): pts|=set(c)
    out=set(pts)
    for r in range(3):
        out|={(x+dx,y+dy) for x,y in out for dx,dy in N8}
    return out
def mirror_fill(p,m,interior,bad):
    m=set(m); bad=bad|m
    ok=lambda x,y: interior(x,y) and (x,y) not in bad
    rows={}
    for x,y in m: rows.setdefault(y,[]).append(x)
    todo=set()
    for y,xs in rows.items():
        xs.sort(); segs=[]; s0=xs[0]; pr=xs[0]
        for x in xs[1:]:
            if x!=pr+1: segs.append((s0,pr)); s0=x
            pr=x
        segs.append((s0,pr))
        for a,b in segs:
            mid=(a+b)/2
            for x in range(a,b+1):
                k1=(x-a); k2=(b-x)
                cands=[(a-1-k1,y),(b+1+k2,y)] if x<=mid else [(b+1+k2,y),(a-1-k1,y)]
                for q in cands:
                    if ok(*q): p[x,y]=p[q]; break
                else: todo.add((x,y))
    for x,y in sorted(todo,key=lambda q:q[1]):
        for dy in range(1,40):
            if ok(x,y+dy) : p[x,y]=p[x,y+dy]; break
            if ok(x,y-dy): p[x,y]=p[x,y-dy]; break
def clean(im,keep_helmet=False):
    im=im.convert('RGBA').copy(); w,h=im.size; p=im.load()
    helm,others=split_masks(im)
    comps=(others if keep_helmet else others+[helm])
    def opaque(x,y): return 0<=x<w and 0<=y<h and p[x,y][3]>=128
    def interior(x,y): return opaque(x,y) and all(opaque(x+dx,y+dy) for dx,dy in N8)
    allmask=set(q for c in ([helm]+others) for q in c)
    for comp in comps:
        m=set(comp)
        for (x,y) in list(comp):          # dilate 1 to swallow the dark rim around bones
            for dx,dy in N8:
                q=(x+dx,y+dy)
                if interior(*q): m.add(q)
        m=[q for q in m if opaque(*q)]
        if comp is helm and not keep_helmet: mirror_fill(p,m,interior,allmask|eyes(im))
        else: fill_region(p,m,interior,allmask)
        allmask-=set(m)
    return im
def helmet_sprite(im):
    im=im.convert('RGBA'); helm,_=split_masks(im)
    xs=[q[0] for q in helm]; ys=[q[1] for q in helm]
    x0,y0,x1,y1=min(xs),min(ys),max(xs),max(ys)
    out=Image.new('RGBA',(x1-x0+3,y1-y0+3),(0,0,0,0)); po=out.load(); p=im.load()
    # fill holes: take every pixel inside the helmet's row span
    hs=set(helm)
    for y in range(y0,y1+1):
        row=[x for x in range(x0,x1+1) if (x,y) in hs]
        if not row: continue
        for x in range(min(row),max(row)+1): po[x-x0+1,y-y0+1]=p[x,y]
    return out
