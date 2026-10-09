import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def squeak(d,f0,f1,g=0.6):
    u=t(d); ph=2*np.pi*np.cumsum(np.linspace(f0,f1,len(u))*(1+0.04*np.sin(2*np.pi*40*u)))/SR
    return (np.sin(ph)+0.3*np.sin(2*ph))*np.sin(np.pi*u/d)**0.6*g
def seq(parts):
    out=np.zeros(int(SR*3))
    for s,x in parts: at(out,x,s)
    nz=np.nonzero(np.abs(out)>1e-4)[0]; return out[:nz[-1]+1]
def scratch(d): u=t(d); return band(noise(d),2000,8000)*(0.5+0.5*np.sign(np.sin(2*np.pi*18*u)))*np.sin(np.pi*u/d)*0.4
def click(g=0.5): u=t(0.03); return band(noise(0.03),1500,6000)*env(len(u),0.0005,0.004)*g+np.sin(2*np.pi*2400*u)*env(len(u),0.0005,0.006)*g*0.6
def clank(g=0.4): u=t(0.5); return sum(np.sin(2*np.pi*f*u)*a for f,a in((610,1),(980,0.6),(1530,0.4)))*env(len(u),0.001,0.09)*g
def suck(d,f0,f1): return mix(gloop(d,f0,f1),band(noise(d),300,2500)*np.sin(np.pi*t(d)/d)*0.3)
S={}
S['keep_rat_alert']=seq([(0,squeak(0.12,2200,2800)),(0.16,squeak(0.1,2600,2300)),(0.05,scratch(0.4))])
S['keep_rat_attack']=seq([(0,squeak(0.18,1800,3200,0.8)),(0.12,click(0.6)),(0.16,click(0.5))])
S['keep_rat_hurt']=squeak(0.15,3400,2400,0.8)
S['keep_rat_death']=seq([(0,squeak(0.35,3000,1200)),(0.3,splash(0.35,400,4000)*0.5)])
S['rust_crab_alert']=seq([(k*0.07,click(0.5)) for k in range(5)]+[(0.1,clank(0.2))])
S['rust_crab_attack']=seq([(0,click(0.7)),(0.06,click(0.8)),(0.08,clank(0.5)),(0.1,hit_snap:=band(noise(0.08),800,5000)*env(int(SR*0.08),0.001,0.02)*0.6)])
S['rust_crab_hurt']=seq([(0,clank(0.6)),(0.02,click(0.5))])
S['rust_crab_death']=seq([(0,clank(0.5)),(0.15,clank(0.35)),(0.35,splash(0.4,300,4000)*0.5)]+[(0.2+k*0.08,click(0.3)) for k in range(3)])
S['bog_leeches_alert']=seq([(k*0.11+rng.uniform(0,0.04),suck(0.12,rng.uniform(250,400),rng.uniform(500,800))*0.6) for k in range(6)])
S['bog_leeches_attack']=seq([(0,suck(0.35,200,700)),(0.25,suck(0.2,500,250)*0.7)])
S['bog_leeches_hurt']=seq([(0,splash(0.2,400,3500)*0.6),(0.02,gloop(0.12,600,300)*0.6)])
S['bog_leeches_death']=seq([(0,gloop(0.5,500,80)),(0.1,splash(0.6,200,2500)*0.6)]+[(0.3+k*0.1,gloop(0.08,700,1200)*0.2) for k in range(4)])
m=json.load(open('audio.json'))
for k,x in S.items(): save('sfx_'+k,reverb(x,0.8,0.25),0.8); m['sfx'][k]='sfx_'+k
m['notes']['leech_latch']="For a latched leech draining health, repeat bog_leeches_attack at low volume each drain tick."
json.dump(m,open('audio.json','w'),indent=1); print(len(S))
