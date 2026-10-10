import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def ring(fs,dec,g,d=1.0):
    u=t(d); return sum(np.sin(2*np.pi*f*u)*a for f,a in fs)*env(len(u),0.002,dec)*g
def buf(d): return np.zeros(int(SR*d))
def loopify(x,L):
    n=int(SR*L); y=x[:n].copy(); xf=SR//2; f=np.linspace(0,1,xf); y[:xf]=y[:xf]*f+x[n:n+xf]*(1-f); return y
# hanging chain: slow sway, a few links clink and a creak
for v in (1,2):
    x=buf(2.5); u=t(1.2); at(x,band(noise(1.2),900,2400)*(0.5+0.5*np.sin(2*np.pi*u*3.1))*np.sin(np.pi*u/1.2)*0.12,0.1)
    for k in range(rng.integers(3,6)): at(x,ring([(rng.uniform(2200,3400),1),(rng.uniform(4000,5200),0.4)],0.05,0.18,0.2),0.2+k*rng.uniform(0.18,0.35))
    save(f'sfx_chain_sway_{v}',reverb(x,1.6,0.35),0.6)
# light-crack loop: thin wind from above, very faint far rain hiss, no birds
L=12; T=L+1; u=t(T)
x=band(noise(T),300,1500)*(0.5+0.5*np.sin(2*np.pi*u*0.21)*np.sin(2*np.pi*u*0.13))*0.35
x+=band(noise(T),3000,9000)*0.05
for f in (523,659): x+=np.sin(2*np.pi*(f+6*np.sin(2*np.pi*0.17*u))*u)*(0.5+0.5*np.sin(2*np.pi*u*0.21))**3*0.02
save('sfx_crack_wind_loop',reverb(loopify(x,L),2.0,0.4),0.5)
# torn banner flutter in the draught
x=buf(2.0)
for k in range(10): d=rng.uniform(0.05,0.12); at(x,band(noise(d),400,4000)*env(int(SR*d),0.005,d/3)*rng.uniform(0.2,0.5),0.2+k*rng.uniform(0.08,0.16))
save('sfx_banner_flutter',reverb(x,1.4,0.3),0.5)
# bones settle / skitter when you step next to them
x=buf(1.2)
for k in range(5): at(x,ring([(rng.uniform(900,1600),1),(rng.uniform(2200,3000),0.5)],0.02,0.3,0.08)+0,0.05+k*rng.uniform(0.05,0.12))
save('sfx_bones_settle',reverb(x,1.2,0.3),0.6)
m=json.load(open('audio.json'))
for k in ['chain_sway_1','chain_sway_2','crack_wind_loop','banner_flutter','bones_settle']: m['sfx'][k]='sfx_'+k
m['notes']['wall_dressing']=("Positional sounds for Pixelartie's wall dressing. Hanging chains: random sfx_chain_sway_1/2 every 8-20s, louder when sfx_far_draught plays. "
 "Sunbeam ceiling cracks (floors 1-2): sfx_crack_wind_loop at the crack, ~1.5 square range, so you hear a thin draught from above as you walk under the light. "
 "Torn banner: sfx_banner_flutter every 10-25s. Bone piles: sfx_bones_settle once when the party first steps next to them. Cobwebs, ash bowls, water lines and tallies stay silent on purpose.")
json.dump(m,open('audio.json','w'),indent=1)
