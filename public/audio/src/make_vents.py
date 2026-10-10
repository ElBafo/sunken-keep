import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def loopify(x,L,xf=1.0):
    n=int(SR*L); y=x[:n].copy(); k=int(SR*xf); f=np.linspace(0,1,k); y[:k]=y[:k]*f+x[n:n+k]*(1-f); return y
# air vent: bellows breath, 6s cycle (in/out), metallic hum
L=12; T=L+1.5; u=t(T)
cyc=(0.5+0.5*np.sin(2*np.pi*u/6))**1.5
air=band(noise(T),200,2500)*cyc*0.6+band(noise(T),60,300)*cyc*0.4
hum=(np.sin(2*np.pi*55*u)+0.4*np.sin(2*np.pi*110*u)+0.15*np.sin(2*np.pi*165.5*u))*0.08
clank=np.zeros(len(u))
for s in (2.9,8.9): at(clank,band(noise(0.06),300,3000)*env(int(SR*0.06),0.001,0.015)*0.25,s)
save('sfx_vent_loop',loopify(reverb(air+hum+clank,1.2,0.3),L),0.6)
# glass-water wall: muffled pressure hum, slow shimmer, occasional muffled bubbles
L=10; T=L+1.5; u=t(T)
w=lp(noise(T),0.01)*0.8+np.sin(2*np.pi*70*u+0.6*np.sin(2*np.pi*0.25*u))*0.15
sh=sum(np.sin(2*np.pi*f*u)*(0.5+0.5*np.sin(2*np.pi*u/r)) for f,r in((523,5),(784,3.3),(1046,2.5)))*0.015
for _ in range(10):
    s=rng.uniform(0,T-0.2); d=0.12; v=t(d); at(w,lp(np.sin(2*np.pi*np.cumsum(rng.uniform(200,400)*(1+2*v/d))/SR)*env(len(v),0.003,0.03),0.08)*0.5,s)
save('sfx_water_wall_loop',loopify(reverb(w+sh,2.0,0.4),L),0.6)
m=json.load(open('audio.json'))
m['sfx']['vent_loop']='sfx_vent_loop'; m['sfx']['water_wall_loop']='sfx_water_wall_loop'
m['notes']['vent_loop']="Per visible air vent, distance-based like torches. Raise volume and playbackRate slightly the deeper you go (1.0 on L2 up to ~1.25 near the Great Engine): the keep breathes harder."
m['notes']['water_wall_loop']="Per glass-water doorway, distance-based; loudest when facing it at 1 square."
json.dump(m,open('audio.json','w'),indent=1)
