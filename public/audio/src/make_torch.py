import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
L=10; T=L+1; x=np.zeros(int(SR*T)); u=t(T)
roar=band(noise(T),60,600)*(0.7+0.3*np.sin(2*np.pi*u*0.9)*np.sin(2*np.pi*u*0.37))
x+=roar*0.5
for _ in range(int(T*14)):
    s=rng.uniform(0,T-0.05); d=rng.uniform(0.004,0.02); g=rng.uniform(0.1,0.7)**2
    at(x,band(noise(d),1200,9000)*env(int(SR*d),0.0003,d/4)*g,s)
for _ in range(int(T*1.2)):  # bigger pops
    s=rng.uniform(0,T-0.1); at(x,band(noise(0.04),400,4000)*env(int(SR*0.04),0.0005,0.008)*0.9,s)
n=SR*L; y=x[:n].copy(); xf=SR//2; f=np.linspace(0,1,xf); y[:xf]=y[:xf]*f+x[n:n+xf]*(1-f)
save('sfx_torch_loop',reverb(y,0.5,0.15)[:n],0.7)
ig=mix(whoosh:=band(noise(0.6),150,3000)*np.concatenate([np.linspace(0,1,int(SR*0.15)),np.exp(-np.arange(int(SR*0.45))/SR/0.15)]),
       np.pad(y[:SR]*np.linspace(0,1,SR)*0.6,(int(SR*0.2),0)))
save('sfx_torch_ignite',reverb(ig,0.8,0.25),0.8)
ex=mix(band(noise(0.7),2000,9000)*env(int(SR*0.7),0.01,0.2)*0.6, y[:int(SR*0.4)]*np.linspace(1,0,int(SR*0.4))*0.5)
save('sfx_torch_extinguish',reverb(ex,1.0,0.3),0.7)
m=json.load(open('audio.json'))
for k in ['torch_loop','torch_ignite','torch_extinguish']: m['sfx'][k]='sfx_'+k
m['notes']['torch_loop']="One loop per lit sconce in view/nearby; volume ~0.6 at 1 square, 0.3 at 2, 0.12 at 3, silent beyond. Start each instance at a random offset so two torches don't phase. Dead sconces are silent."
m['notes']['torch_ignite']="For Wren relighting a dead sconce later; torch_extinguish for the Tide snuffing one."
json.dump(m,open('audio.json','w'),indent=1)
