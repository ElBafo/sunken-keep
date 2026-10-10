import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def ring(fs,dec,g,d=0.6):
    u=t(d); return sum(np.sin(2*np.pi*f*u)*a for f,a in fs)*env(len(u),0.001,dec)*g
L=12; T=L+1; x=band(noise(T),300,1200)*0.012*(0.5+0.5*np.sin(2*np.pi*t(T)*0.15))
hooks=[(1480,2310),(1660,2590),(1390,2170),(1820,2840),(1550,2420)]  # five empty iron hooks
s=0.3
while s<T-0.6:
    gust=rng.uniform(0,1)<0.3
    for _ in range(rng.integers(2,5) if gust else 1):
        a,b=hooks[rng.integers(len(hooks))]; j=rng.uniform(0.98,1.02)
        at(x,ring([(a*j,1),(b*j,0.45),(a*2.9*j,0.15)],rng.uniform(0.08,0.18),rng.uniform(0.06,0.14)),s); s+=rng.uniform(0.05,0.18)
    s+=rng.uniform(0.6,2.2)
n=int(SR*L); y=x[:n].copy(); xf=SR//2; f=np.linspace(0,1,xf); y[:xf]=y[:xf]*f+x[n:n+xf]*(1-f)
save('sfx_lamp_hooks_loop',reverb(y,1.8,0.45),0.5)
m=json.load(open('audio.json')); m['sfx']['lamp_hooks_loop']='sfx_lamp_hooks_loop'
m['notes']['lamp_hooks_loop']=("Floor 1 lamp-keeper's room: loop from the hook rail, positional, audible ~4 squares away so it carries down the black corridor (volume 0.5). "
 "Fire Storie's lampkeeper_hooks_heard on the first square where it becomes audible. Pell's note: reuse sfx_scroll on tap. Guard hall sunbeam: sfx_crack_wind_loop; fallen beams: one sfx_far_pebbles when first entering.")
json.dump(m,open('audio.json','w'),indent=1)
