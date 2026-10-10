import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
L=10; T=L+1; x=band(noise(T),100,600)*0.04
for _ in range(int(T*2.5)):  # soft laps against stone
    s=rng.uniform(0,T-0.8); d=rng.uniform(0.3,0.6); u=t(d)
    at(x,band(noise(d),250,2200)*np.sin(np.pi*u/d)**2*rng.uniform(0.12,0.3),s)
for _ in range(int(T*2)):  # tiny plinks and bubbles
    s=rng.uniform(0,T-0.3); f0=rng.uniform(600,1100); at(x,gloop(0.08,f0,f0*1.5)*rng.uniform(0.05,0.12),s)
n=SR*L; y=x[:n].copy(); xf=SR//2; f=np.linspace(0,1,xf); y[:xf]=y[:xf]*f+x[n:n+xf]*(1-f)
save('sfx_water_lap_loop',reverb(y,1.6,0.35),0.45)
m=json.load(open('audio.json')); m['sfx']['water_lap_loop']='sfx_water_lap_loop'
m['notes']['water_lap_loop']="Positional loop on flooded squares (one per pool, at its centre), ~2 square range, volume 0.35. Footsteps on water squares already exist: sfx_step_water_shallow / sfx_step_water_deep instead of sfx_step."
json.dump(m,open('audio.json','w'),indent=1)
