import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
L=6; T=L+1; x=np.zeros(int(SR*T))
for _ in range(int(T*5)):  # wet squelches and slithers
    s=rng.uniform(0,T-0.5); f0=rng.uniform(250,500); at(x,gloop(rng.uniform(0.12,0.3),f0,f0*0.6)*rng.uniform(0.1,0.3),s)
for _ in range(int(T*3)):
    s=rng.uniform(0,T-0.6); d=rng.uniform(0.3,0.5); u=t(d); at(x,band(noise(d),600,3000)*np.sin(np.pi*u/d)**2*(0.5+0.5*np.sin(2*np.pi*u*11))*0.12,s)
for _ in range(int(T*1)):  # tiny suckers popping
    s=rng.uniform(0,T-0.1); at(x,band(noise(0.02),1500,6000)*env(int(SR*0.02),0.0005,0.004)*0.4,s)
n=SR*L; y=x[:n].copy(); xf=SR//2; f=np.linspace(0,1,xf); y[:xf]=y[:xf]*f+x[n:n+xf]*(1-f)
save('sfx_bog_leeches_idle_loop',reverb(y,0.8,0.2),0.5)
m=json.load(open('audio.json')); m['sfx']['bog_leeches_idle_loop']='sfx_bog_leeches_idle_loop'
m['notes']['monster_idle']="sfx_bog_leeches_idle_loop: positional, looped on the leeches' square, ~2 square range, quiet (0.4). Lets the player hear wet writhing before they can make out the sprite."
json.dump(m,open('audio.json','w'),indent=1)
