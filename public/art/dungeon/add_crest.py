# Stonevow crest (tarnished bronze anvil under a peak) on the drowned dwarf's chest
from PIL import Image
D,B,H,V=(40,26,14,255),(150,98,40,255),(214,150,70,255),(70,130,100,255)
near=["..D..",".DHD.","DBBBD","DDBDD",".DBD.","DBBBD"]
mid=[".D.","DHD","DBD"]
for size,pat,(cx,cy) in [('near',near,(41,28)),('mid',mid,(25,18))]:
    im=Image.open(f'drowned_dwarf_{size}.png').convert('RGBA'); px=im.load()
    ox,oy=cx-len(pat[0])//2,cy
    for y,row in enumerate(pat):
        for x,c in enumerate(row):
            if c!='.': px[ox+x,oy+y]={'D':D,'B':B,'H':H}[c]
    if size=='near': px[ox+1,oy+4]=V; px[ox+3,oy+2]=V  # verdigris specks
    im.save(f'drowned_dwarf_{size}.png')
