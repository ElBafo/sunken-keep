from PIL import Image, ImageDraw
import json
R='/workspace/sunken-keep/art/'
W,H=270,585; VIEW=(0,0,270,380)
def nine(src,w,h,m=4):
    s=Image.open(src).convert('RGBA'); sw,sh=s.size; o=Image.new('RGBA',(w,h))
    xs=[(0,m,0,m),(m,sw-m,m,w-m),(sw-m,sw,w-m,w)]; ys=[(0,m,0,m),(m,sh-m,m,h-m),(sh-m,sh,h-m,h)]
    for a,b,c,d in xs:
        for e,f,g,hh in ys:
            if d>c and hh>g: o.paste(s.crop((a,e,b,f)).resize((d-c,hh-g),Image.NEAREST),(c,g))
    return o
bg=Image.open(R+'ui/panel/panel_bg.png').convert('RGBA')
stone=bg.crop((0,180,270,216))  # plain stone strip
panel=Image.new('RGBA',(270,205))
for y in range(0,205,36): panel.paste(stone,(0,y))
panel.paste(bg.crop((0,0,270,4)),(0,0))  # bronze trim on top
# tileable edge strip for leftover height
stone.crop((0,0,270,32)).save('stone_strip_tile.png')
L={'canvas':[W,H],'tapNote':'tap portrait = open character sheet. Two hand buttons under the bars show the equipped item icon (main hand left, off hand right), 31x28 px = 45x41pt on iPhone 15; tap to use, dim while recovering. Min tap target 28px = 41pt.','note':'scale canvas to screen width; fill leftover height with stone_strip_tile.png tiled vertically (below panel). View renders at 270x380, horizon y 190.','view':list(VIEW),'panelTop':380,'heroes':[]}
d=ImageDraw.Draw(panel)
def well(b,col=(18,22,20,255)):
    d.rectangle(b,fill=col); d.rectangle(b,outline=(90,70,40,255))
names=['brannoc','wren','ilsevar','mags']; mana={'wren','ilsevar'}
for i,n in enumerate(names):
    x0=2+i*67; y0=6
    pb=(x0+11,y0,x0+55,y0+44)
    p=Image.open(R+f'portraits/{n}_healthy.png').convert('RGBA').resize((44,44),Image.BOX)
    well((pb[0]-1,pb[1]-1,pb[2],pb[3])); panel.alpha_composite(p,(pb[0],pb[1]))
    hp=(x0+1,y0+46,x0+65,y0+49); mp=(x0+1,y0+51,x0+65,y0+54)
    d.rectangle(hp,fill=(40,10,10,255)); d.rectangle((hp[0],hp[1],hp[0]+50,hp[3]),fill=(190,50,40,255))
    if n in mana: d.rectangle(mp,fill=(10,20,40,255)); d.rectangle((mp[0],mp[1],mp[0]+40,mp[3]),fill=(60,120,220,255))
    a1=(x0+1,y0+56,x0+32,y0+84); a2=(x0+34,y0+56,x0+65,y0+84)
    for a in (a1,a2): panel.alpha_composite(nine(R+'ui/panel/button_9slice.png',a[2]-a[0],a[3]-a[1]),(a[0],a[1]))
    off=lambda b:[b[0],b[1]+380,b[2]-b[0],b[3]-b[1]]
    L['heroes'].append({'name':n,'portrait_opens_sheet':off(pb),'hand_main':off(a1),'hand_off':off(a2),'hpBar':off(hp),'manaBar':off(mp) if n in mana else None})
log=(4,94,266,122); well(log); L['log']=[4,474,262,28]; L['logNote']='3 lines of 5x7 font, 9px line height'
# controls row
pad={}; names_p=[['turn_left','forward','turn_right'],['strafe_left','back','strafe_right']]
for r in range(2):
    for c in range(3):
        b=(6+c*30,128+r*30,6+c*30+28,128+r*30+28)
        panel.alpha_composite(nine(R+'ui/panel/button_9slice.png',28,28),(b[0],b[1]))
        ic=Image.open(R+f'ui/panel/icon_{names_p[r][c]}.png').convert('RGBA')
        panel.alpha_composite(ic,(b[0]+14-ic.width//2,b[1]+14-ic.height//2))
        pad[names_p[r][c]]=[b[0],b[1]+380,28,28]
L['pad']=pad
cp=Image.open(R+'ui/panel/compass_N.png').convert('RGBA'); panel.alpha_composite(cp,(114,136)); L['compass']=[114,516,42,42]
right={'potion_health':(172,128,200,156),'potion_mana':(204,128,232,156),'inventory':(172,160,232,188),'menu':(236,128,264,156),'save':(236,160,264,188)}
for k,b in right.items():
    panel.alpha_composite(nine(R+'ui/panel/button_9slice.png',b[2]-b[0],b[3]-b[1]),(b[0],b[1]))
    L[k]=[b[0],b[1]+380,b[2]-b[0],b[3]-b[1]]
for k,f in (('potion_health','item_potion_red_far'),('potion_mana','item_potion_blue_far')):
    try:
        ic=Image.open(R+f'dungeon/{f}.png').convert('RGBA'); b=right[k]; panel.alpha_composite(ic,(b[0]+14-ic.width//2,b[1]+14-ic.height//2))
    except Exception as e: print(e)
panel.save('panel_585.png')
# inventory screen 270x585
inv=Image.new('RGBA',(W,H))
for y in range(0,H,36): inv.paste(stone,(0,y))
di=ImageDraw.Draw(inv); L['inventory_screen']={'slots':[],'paperdoll':{},'close':[236,8,26,26]}
inv.alpha_composite(nine(R+'ui/panel/button_9slice.png',26,26),(236,8))
for i,n in enumerate(names):
    x=4+i*67; inv.alpha_composite(Image.open(R+f'portraits/{n}_healthy.png').convert('RGBA').resize((32,32),Image.BOX),(x+17,44))
    sl=[]
    for j,s in enumerate(['main','off','armour','trinket']):
        b=(x+2+(j%2)*32,82+(j//2)*32,x+2+(j%2)*32+30,82+(j//2)*32+30); di.rectangle(b,fill=(18,22,20,255),outline=(90,70,40,255)); sl.append({s:list(b)})
    L['inventory_screen']['paperdoll'][n]=sl
for r in range(5):
    for c in range(8):
        b=(7+c*32,170+r*32,7+c*32+30,170+r*32+30); di.rectangle(b,fill=(18,22,20,255),outline=(90,70,40,255)); L['inventory_screen']['slots'].append(list(b))
L['inventory_screen']['note']='tap an item to select (glow), then tap a hero, slot, or the view (e.g. a door) to use it; long-press for its description in the log box'
di.rectangle((7,340,263,400),fill=(18,22,20,255),outline=(90,70,40,255)); L['inventory_screen']['desc']=[7,340,256,60]
inv.save('inventory_screen_mock.png')
# full mock
full=Image.new('RGBA',(W,H),(0,0,0,255))
cor=Image.open(R+'preview/v2_corridor_floor_3x.png').convert('RGBA').crop((0,0,840,600)).resize((280,200),Image.NEAREST)
v=cor.resize((532,380),Image.NEAREST).crop((131,0,401,380)); full.alpha_composite(v,(0,0))
full.alpha_composite(panel,(0,380)); full.save('layout_mock.png')
pv=Image.new('RGBA',(W*2+10,H),(0,0,0,255)); pv.alpha_composite(full,(0,0)); pv.alpha_composite(inv,(W+10,0))
pv.resize((pv.width*2,H*2),Image.NEAREST).save(R+'preview/layout585_2x.png')
json.dump(L,open('layout585.json','w'),indent=1); print('ok')
