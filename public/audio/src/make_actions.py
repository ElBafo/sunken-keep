import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def swish(d,lo,hi,g=0.6):
    u=t(d); return band(noise(d),lo,hi)*np.sin(np.pi*u/d)**3*g
def ring(fs,dec,g,d=1.0):
    u=t(d); return sum(np.sin(2*np.pi*f*u)*a for f,a in fs)*env(len(u),0.001,dec)*g
def thump(f=90,g=0.7): u=t(0.25); return np.sin(2*np.pi*(f-40*u)*u)*env(len(u),0.001,0.05)*g+band(noise(0.25),80,800)*env(len(u),0.001,0.02)*g*0.6
def sparkle(d,g):
    out=np.zeros(int(SR*d))
    for _ in range(int(d*30)):
        f=rng.uniform(2000,5000); u=t(0.15); at(out,np.sin(2*np.pi*f*u)*env(len(u),0.001,0.03)*g,rng.uniform(0,d-0.15))
    return out
def dly(x,s): return np.pad(x,(int(SR*s),0))
S={
 'act_axe':mix(swish(0.32,200,1800,0.8),dly(thump(80),0.24)),
 'act_shield':mix(thump(110,0.9),ring([(320,1),(510,0.6),(870,0.3)],0.1,0.4)),
 'act_mace':mix(swish(0.25,150,1200,0.7),dly(thump(70,1.0),0.18),dly(ring([(600,1),(940,0.4)],0.08,0.25),0.18)),
 'act_prayer':mix(*[dly(np.sin(2*np.pi*f*t(1.4))*np.sin(np.pi*t(1.4)/1.4)*0.15,k*0.12) for k,f in enumerate((440,554,659,880))],sparkle(1.3,0.06),band(noise(1.4),150,900)*np.sin(np.pi*t(1.4)/1.4)*0.2),
 'act_wand':mix(np.sin(2*np.pi*np.cumsum(np.linspace(1800,300,int(SR*0.4)))/SR)*env(int(SR*0.4),0.005,0.12)*0.5,band(noise(0.4),2000,8000)*env(int(SR*0.4),0.002,0.08)*0.3,dly(thump(100,0.4),0.3)),
 'act_scroll':mix(band(noise(0.3),1500,8000)*(0.5+0.5*np.sin(2*np.pi*14*t(0.3)))*np.sin(np.pi*t(0.3)/0.3)*0.4,dly(mix(sigh(1.0,90)*0.3,sparkle(0.9,0.07)),0.2)),
 'act_dagger':mix(swish(0.14,1500,7000,0.6),dly(band(noise(0.05),800,4000)*env(int(SR*0.05),0.001,0.01)*0.8,0.11)),
 'act_tricks':mix(band(noise(0.08),1000,6000)*env(int(SR*0.08),0.001,0.015)*0.8,dly(band(noise(0.9),200,3000)*env(int(SR*0.9),0.02,0.3)*0.5,0.05)),
 'act_miss':swish(0.28,400,3000,0.45),
 'act_ready':ring([(1320,1),(1980,0.3)],0.05,0.15,0.3),
 'sheet_open':mix(band(noise(0.3),400,5000)*np.sin(np.pi*t(0.3)/0.3)*0.4,dly(ring([(500,1),(750,0.4)],0.05,0.2),0.15)),
 'level_up':mix(*[dly(ring([(f,1),(f*2,0.3)],0.5,0.25,1.5),k*0.12) for k,f in enumerate((293.7,370,440,587.3))],sparkle(1.5,0.05)),
 'act_punch':mix(swish(0.2,300,2000,0.5),dly(thump(120,0.6),0.15)),
 'mana_empty':mix(np.sin(2*np.pi*np.cumsum(np.linspace(600,200,int(SR*0.35)))/SR)*env(int(SR*0.35),0.005,0.1)*0.4,band(noise(0.3),200,1000)*env(int(SR*0.3),0.005,0.06)*0.2),
}
m=json.load(open('audio.json'))
for k,x in S.items(): save('sfx_'+k,reverb(x,0.8,0.25),0.75 if k not in('act_ready','sheet_open') else 0.5); m['sfx'][k]='sfx_'+k
m['notes']['actions']="Hand buttons: Brannoc act_axe/act_shield, Wren act_mace/act_prayer, Ilsevar act_wand/act_scroll, Mags act_dagger/act_tricks. Empty hand: act_punch. Play the act sound on tap, then sfx_hit on a landed blow or act_miss on a miss (d20). act_ready very quietly when a dimmed button recovers. mana_empty when Wren/Ilsevar lack mana. sheet_open for the portrait tap. level_up on hero level-up."
json.dump(m,open('audio.json','w'),indent=1)
files=sorted(f for f in os.listdir('.') if f.endswith(('.ogg','.mp3')))
json.dump({"files":files,"count":len(files)},open('manifest_audio.json','w'),indent=1); print(len(files))
