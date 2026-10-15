import json,random,statistics as st,collections,sys
from f1v2 import *
from check import bfs
import os
A=json.load(open(next(p for p in ('../actions.json','../../../public/levels/actions.json') if os.path.exists(p))))
# proposed stats
M={'bog_leeches':dict(hp=12,ac=8,dmg=(1,3),iv=2.0,latch=.25),
   'keep_rat':dict(hp=14,ac=10,dmg=(3,5),iv=1.8,dart=True),
   'rust_crab':dict(hp=24,ac=15,dmg=(3,6),iv=2.5,pinch=(6,9)),
   'slime':dict(hp=70,ac=11,dmg=(4,8),iv=2.5,spit=(3,6),blade=.5)}
ORDER=[(7,5),(7,9),(5,11),(7,13),(3,2),(5,3),(9,4),(10,1),(12,3),(19,7)]
WAY=[START,(7,5),(7,9),(4,10),(5,11),(7,13),(4,13),(6,6),(5,7),(7,7),(2,5),(3,2),(6,3),(5,3),(9,4),(10,1),(12,3),(12,8),(13,9),(19,4),(19,7),(16,10)]
steps=0;blk=set('#FP')
for a,b in zip(WAY,WAY[1:]): steps+=bfs(a,blk)[b]
POT_BEFORE={0:0,4:3,7:4}  # red potions found by fight index: cellar potion + pantry chest + floor red... cumulative count
def d(a,b): return random.randint(a,b)
def roll(th,ac):
    r=d(1,20)
    if r==1: return 0
    if r==20: return 2
    return 1 if r+th>=ac else 0
FROST={'slime':0.5}  # frost does half damage to slimes (Gamie, 2026-10-13)
SPLIT=dict(on=True,dmg=(2,5),iv=2.5)
def run(mode='good',potions=True):
    hp={'brannoc':45,'mags':28,'wren':32,'ilsevar':24}; mx=dict(hp)
    front=['brannoc','mags']; mana={'wren':12,'ilsevar':16}; xp=0; lvl=1; reds=0; T=0; lost=0; plog=[]
    gotred={1:1,3:1,5:1}; SL=dict(t=0,lost=0)  # red potion picked up before fight i (cellar, chest, floor)
    for i,p in enumerate(ORDER):
        reds+=gotred.get(i,0) if potions else 0
        mana['ilsevar']=min(16+3*(lvl-1),mana['ilsevar']+3); mana['wren']=min(12+2*(lvl-1),mana['wren']+3)
        name=MON[p]; mo=M[name]; mhp=mo['hp']; t=0.0; mul=1+0.1*(lvl-1)
        ready={'f0':1.0,'f1':1.4,'i':1.8,'w':2.2}; mnext=0.8; cnt=0; latch=0; blockon=0; pools=None; pnext=[]; lost0=lost; split=name=='slime' and SPLIT['on']
        while mhp>0 and t<240:
            t=round(t+0.1,1); alive=[h for h in hp if hp[h]>0]
            if not alive: return dict(wipe=True,t=T+t,lost=lost,at=i,reds=reds,down=4)
            front=[h for h in ['brannoc','mags','wren','ilsevar'] if hp[h]>0][:2]
            for k,h in (('f0',front[0] if front else None),('f1',front[1] if len(front)>1 else None)):
                if h and t>=ready[k]:
                    g={'brannoc':(4,(4,9),3.0),'mags':(5,(2,6),2.0),'wren':(3,(3,7),3.0),'ilsevar':(5,(3,6),3.0)}[h]
                    r=roll(g[0],mo['ac']); dm=d(*g[1])*r*mul
                    if name=='slime' and h in('brannoc','mags'): dm*=mo['blade']
                    mhp-=dm; ready[k]=t+g[2]
            if hp['ilsevar']>0 and 'ilsevar' not in front and t>=ready['i'] and (mode=='good'):
                if (name=='rust_crab' or (name=='slime' and FROST['slime']>=1)) and mana['ilsevar']>=5: mana['ilsevar']-=5; mhp-=d(8,14)*mul*(FROST['slime'] if name=='slime' else 1); ready['i']=t+6
                else:
                    r=roll(5,mo['ac']); mhp-=d(3,6)*r*mul; ready['i']=t+3
            if mode=='good' and hp['wren']>0 and t>=ready['w'] and mana['wren']>=4:
                h=min(alive,key=lambda h:hp[h]/mx[h])
                if hp[h]/mx[h]<.5: mana['wren']-=4; hp[h]=min(mx[h],hp[h]+d(6,10)); ready['w']=t+5
            if potions and reds:
                for h in alive:
                    if hp[h]/mx[h]<.3 and reds: reds-=1; hp[h]=min(mx[h],hp[h]+15)
            if split and pools is None and mhp<=mo['hp']/2:
                pools=[mhp/2,mhp/2]; pnext=[t+SPLIT['iv']/2,t+SPLIT['iv']]; prev=mhp
            if pools is not None:
                pools[0]-=prev-mhp
                if pools[0]<=0: pools.pop(0); pnext.pop(0)
                mhp=sum(pools) if pools else 0; prev=mhp
                for j in range(len(pools)):
                    if t>=pnext[j]:
                        tgt=random.choice(front) if front else None
                        if tgt and roll(4,A[tgt]['ac']):
                            dm=d(*SPLIT['dmg']); hp[tgt]-=dm; lost+=dm
                        pnext[j]=t+SPLIT['iv']
            if pools is None and mhp>0 and t>=mnext:
                cnt+=1; dmg=mo['dmg']; tgt=random.choice(front) if front else None; special=False
                if mo.get('dart') and cnt%3==0: back=[h for h in hp if hp[h]>0 and h not in front]; tgt=random.choice(back) if back else tgt
                if mo.get('pinch') and cnt%3==0: dmg=mo['pinch']; special=True
                if mo.get('spit') and cnt%3==0: back=[h for h in hp if hp[h]>0 and h not in front]; tgt=random.choice(back) if back else tgt; dmg=mo['spit']
                if tgt:
                    ac=A[tgt]['ac']; r=roll(4,ac)
                    if r:
                        dm=d(*dmg)*r
                        if special and mode=='good' and random.random()<.6: dm//=2
                        hp[tgt]-=dm; lost+=dm
                        if mo.get('latch') and random.random()<mo['latch']: latch+=3
                mnext=t+mo['iv']+(1.0 if (mo.get('pinch') or mo.get('spit')) and cnt%3==2 else 0)
                if latch>0 and front: hp[front[0]]-=1; lost+=1; latch-=1
            for h in hp: hp[h]=max(hp[h],0) if hp[h]<=0 else hp[h]
        if name=='slime': SL=dict(t=t,lost=lost-lost0)
        T+=t; xp+=mo['hp']
        if i==len(ORDER)-1: pass
        if xp>=100 and lvl==1:
            lvl=2
            for h,g in (('brannoc',6),('mags',5),('wren',5),('ilsevar',4)): mx[h]+=g; hp[h]+=g if hp[h]>0 else 0
        if i==len(ORDER)-2: plog=reds
    return dict(wipe=False,t=T,lost=lost,reds_left=reds,reds_at_lair=plog,down=sum(hp[h]<=0 for h in hp),sl=SL)

def table(N=500,gaps=(2.5,3.0,3.5,4.0,4.5),hps=(70,)):
    for H in hps:
     M['slime']['hp']=H
     for g in gaps:
        SPLIT['iv']=g; random.seed(1)
        G=[run('good') for _ in range(N)]; W=[run('front') for _ in range(N)]
        ok=[r for r in G if not r['wipe']]
        print(f"hp{H} gap{g} N{N} | good: lost {st.mean(r['lost'] for r in ok):.1f} slime {st.mean(r['sl']['lost'] for r in ok):.1f} t {st.mean(r['sl']['t'] for r in ok):.1f}s pots {st.mean(3-r['reds_left'] for r in ok):.2f} lose1+ {100*sum(r['down']>=1 for r in G)/N:.1f}% wipe {sum(r['wipe'] for r in G)} | weak: wipes {sum(r['wipe'] for r in W)} ({100*sum(r['wipe'] for r in W)/N:.2f}%) lose1 {100*sum(r['down']==1 for r in W)/N:.1f}% lose2 {100*sum(r['down']==2 for r in W)/N:.1f}% lose3 {100*sum(r['down']==3 for r in W)/N:.1f}%")
if __name__=='__main__':
    import sys; print('steps',steps); table(int(sys.argv[1]) if len(sys.argv)>1 else 500)
