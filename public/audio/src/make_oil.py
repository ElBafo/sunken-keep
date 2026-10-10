import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def buf(d): return np.zeros(int(SR*d))
def clay(g=0.6):  # dull clay knock
    u=t(0.25); return (np.sin(2*np.pi*420*u)+0.5*np.sin(2*np.pi*730*u))*env(len(u),0.001,0.04)*g+band(noise(0.25),300,2500)*env(len(u),0.001,0.015)*g*0.5
def slosh(d=0.5,g=0.4):
    x=buf(d)
    for k in range(5): f0=rng.uniform(250,450); at(x,gloop(0.12,f0,f0*0.7)*g*(1-k*0.15),k*d/6)
    return x
x=buf(1.2); at(x,clay(),0); at(x,slosh(0.6,0.35),0.08)
save('sfx_oil_pickup',reverb(x,0.8,0.2),0.75)
# refill: cork pop, glug glug, flame swells
x=buf(2.4); at(x,band(noise(0.03),500,4000)*env(int(SR*0.03),0.0005,0.008)*0.8,0)
for k in range(4): f0=220-k*15; at(x,gloop(0.18,f0,f0*1.6)*0.5,0.15+k*0.2)
u=t(1.2); at(x,band(noise(1.2),150,2500)*np.concatenate([np.linspace(0,1,int(SR*0.4)),np.exp(-np.arange(int(SR*0.8))/SR/0.3)])*0.45,1.0)
save('sfx_lantern_refill',reverb(x,1.0,0.25),0.8)
# ember-only loop: small cold blue glow, faint glassy hum, almost no crackle
L=8; T=L+1; u=t(T)
y=(np.sin(2*np.pi*392*u)+0.5*np.sin(2*np.pi*588*u+0.3)+0.3*np.sin(2*np.pi*784.6*u))*(0.6+0.4*np.sin(2*np.pi*u*0.25))*0.04
y+=band(noise(T),80,500)*0.03
for _ in range(int(T*1.5)):
    s=rng.uniform(0,T-0.05); d=0.008; at(y,band(noise(d),3000,9000)*env(int(SR*d),0.0003,0.002)*0.08,s)
n=SR*L; z=y[:n].copy(); xf=SR//2; f=np.linspace(0,1,xf); z[:xf]=z[:xf]*f+y[n:n+xf]*(1-f)
save('sfx_lantern_ember_loop',reverb(z,1.5,0.4),0.35)
# oil runs dry: last sputter drops down to ember
x=buf(2.0)
for k in range(3): at(x,band(noise(0.03),300,3000)*env(int(SR*0.03),0.001,0.01)*(0.6-k*0.15),k*0.2)
at(x,band(noise(0.8),1500,7000)*env(int(SR*0.8),0.01,0.25)*0.35,0.5)
u=t(1.2); at(x,np.sin(2*np.pi*392*u)*np.minimum(1,u/0.5)*np.exp(-u/0.8)*0.12,0.7)
save('sfx_oil_empty',reverb(x,1.4,0.35),0.7)
m=json.load(open('audio.json'))
for k in ['oil_pickup','lantern_refill','lantern_ember_loop','oil_empty']: m['sfx'][k]='sfx_'+k
m['notes']['oil']=("Oil and torch lighting. Flask pickup: sfx_oil_pickup (clay, not glass, unlike sfx_potion); when it tops up the lantern, sfx_lantern_refill. "
 "Lighting a dead torch: sfx_torch_ignite then that torch's sfx_torch_loop for good. Tapping a capped torch: sfx_door_locked. "
 "Oil hits zero: sfx_oil_empty, then swap sfx_lantern_loop for sfx_lantern_ember_loop (quiet, 0.3) until refilled. "
 "Floor 5+: when a lit torch draws a creature, play sfx_tide_sigh quietly from that torch's direction.")
json.dump(m,open('audio.json','w'),indent=1)
