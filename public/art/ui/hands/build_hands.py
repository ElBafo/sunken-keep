from PIL import Image
import numpy as np, json
src=Image.open('/home/box/agent-data/agents/886e9186-eb6c-4545-8ca0-bfda02eef844/assets/68d63780ba94983a1c0b9ae38cde00a773fb00d22ebe7ccfcc04c908bffa2e23.jpg').convert('RGB').resize((1024,576))
names=[['fist_brannoc','fist_wren','fist_ilsevar','fist_mags'],['axe','shield','mace','prayer_lantern'],['wand','scroll','dagger','tricks_pouch']]
xs=[120,330,530,730,930]; ys=[10,190,370,560]
S=24; out={}
for r in range(3):
    for c in range(4):
        cell=np.asarray(src.crop((xs[c],ys[r],xs[c+1],ys[r+1])),int)
        R,G,B=cell[...,0],cell[...,1],cell[...,2]
        bgm=(R-G>55)&(B-G>15)&(R>110)
        a=np.where(bgm,0,255).astype('uint8')
        im=Image.fromarray(np.dstack([cell.astype('uint8'),a]),'RGBA')
        bb=im.getchannel('A').point(lambda v:255 if v>0 else 0).getbbox(); im=im.crop(bb)
        k=S/max(im.size); w,h=max(1,round(im.width*k)),max(1,round(im.height*k))
        sm=im.resize((w,h),Image.BOX)
        al=np.asarray(sm.getchannel('A'))
        rgb=sm.convert('RGB').quantize(24,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('RGB')
        ic=Image.new('RGBA',(S,S)); ic.paste(Image.fromarray(np.dstack([np.asarray(rgb),np.where(al>140,255,0).astype('uint8')]),'RGBA'),((S-w)//2,(S-h)//2))
        n=names[r][c]; ic.save(f'hand_{n}.png'); out[n]=f'hand_{n}.png'
json.dump({'size':[S,S],'note':'centre in the 31x28 hand button; dim in code (e.g. 50% dark overlay) while the hero recovers. Empty hand shows that hero\'s fist (punch 1-2 dmg).','defaults':{'brannoc':['axe','shield'],'wren':['mace','prayer_lantern'],'ilsevar':['wand','scroll'],'mags':['dagger','tricks_pouch']},'icons':out},open('hands.json','w'),indent=1)
pv=Image.new('RGBA',(4*30,3*30),(30,34,32,255))
for r in range(3):
    for c in range(4): pv.alpha_composite(Image.open(f'hand_{names[r][c]}.png'),(c*30+3,r*30+3))
pv.resize((pv.width*5,pv.height*5),Image.NEAREST).save('../../preview/hand_icons_5x.png')
