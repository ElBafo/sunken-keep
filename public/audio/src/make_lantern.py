import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def ring(fs,dec,g,d=0.3):
    u=t(d); return sum(np.sin(2*np.pi*f*u)*a for f,a in fs)*env(len(u),0.001,dec)*g
# small enclosed flame: softer, higher, fewer crackles than a torch, faint glass/metal creak
L=8; T=L+1; x=np.zeros(int(SR*T)); u=t(T)
x+=band(noise(T),120,900)*(0.75+0.25*np.sin(2*np.pi*u*1.3))*0.25
for _ in range(int(T*6)):
    s=rng.uniform(0,T-0.05); d=rng.uniform(0.003,0.012); at(x,band(noise(d),2000,9000)*env(int(SR*d),0.0003,d/4)*rng.uniform(0.05,0.3)**2,s)
for k in range(int(T/2.5)):  # handle creak as party walks
    s=k*2.5+rng.uniform(0,0.5); at(x,ring([(1900,1),(2650,0.5)],0.03,0.05),s)
n=SR*L; y=x[:n].copy(); xf=SR//2; f=np.linspace(0,1,xf); y[:xf]=y[:xf]*f+x[n:n+xf]*(1-f)
save('sfx_lantern_loop',reverb(y,0.4,0.1)[:n],0.45)
# gutter: drip hits glass, hiss, flame sputters and dips
g=np.zeros(int(SR*1.6))
at(g,ring([(2300,1),(3400,0.4)],0.04,0.4),0.0)
at(g,band(noise(0.5),2500,9000)*env(int(SR*0.5),0.005,0.18)*0.5,0.03)
for k in range(7):
    s=0.25+k*0.15+rng.uniform(0,0.05); d=0.03; at(g,band(noise(d),300,3000)*env(int(SR*d),0.001,0.01)*(0.8-k*0.09),s)
at(g,y[:int(SR*0.8)]*np.linspace(0.1,1,int(SR*0.8))*0.6,0.8)
save('sfx_lantern_gutter',reverb(g,0.9,0.2),0.7)
# out: last sputter, long hiss, tiny smoky exhale, then nothing
o=np.zeros(int(SR*2.2))
for k in range(3): at(o,band(noise(0.03),300,3000)*env(int(SR*0.03),0.001,0.01)*0.6,k*0.18)
at(o,band(noise(1.2),1800,8000)*env(int(SR*1.2),0.01,0.4)*0.5,0.5)
at(o,band(noise(1.0),100,500)*np.sin(np.pi*t(1.0))*0.15,0.9)
save('sfx_lantern_out',reverb(o,1.4,0.35),0.7)
m=json.load(open('audio.json'))
for k in ['lantern_loop','lantern_gutter','lantern_out']: m['sfx'][k]='sfx_'+k
m['notes']['lantern_loop']="Wren's carried lantern, always on while lit, volume ~0.35 (it's with the party, not placed in the room). Pairs with Pixelartie's bright portrait state."
m['notes']['lantern_gutter']="When the Tide or a drip dims the lantern (guttering state); also duck lantern_loop to ~0.15 while guttering. Relight uses existing sfx_torch_ignite."
m['notes']['lantern_out']="Lantern dies: play this, stop lantern_loop, and drop ambience ~2 dB for a moment so the silence lands."
json.dump(m,open('audio.json','w'),indent=1)
