import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def buf(d): return np.zeros(int(SR*d))
# something waiting in the dark: slow wet breathing + a shuffle now and then
L=8; T=L+1; x=buf(T)
for k in range(int(T/2.6)):
    s=k*2.6+rng.uniform(0,0.3)
    for j,(d,lo,hi,g) in enumerate(((1.0,150,900,0.25),(1.2,120,700,0.2))):
        u=t(d); at(x,band(noise(d),lo,hi)*np.sin(np.pi*u/d)**2*g,s+j*1.1)
for _ in range(int(T*0.6)):
    s=rng.uniform(0,T-0.5); d=0.35; u=t(d); at(x,band(noise(d),200,2000)*np.sin(np.pi*u/d)*(0.5+0.5*np.sin(2*np.pi*u*9))*0.12,s)
x=lp(x,0.25)
n=SR*L; y=x[:n].copy(); xf=SR//2; f=np.linspace(0,1,xf); y[:xf]=y[:xf]*f+x[n:n+xf]*(1-f)
save('sfx_dark_presence_loop',reverb(y,2.0,0.45),0.45)
# glint: tiny cold shimmer when a glint first comes into view
x=buf(1.2); u=t(0.9)
for i,f0 in enumerate((2637,3136,3951)): at(x,np.sin(2*np.pi*f0*u)*env(len(u),0.002,0.18)*0.12,i*0.06)
save('sfx_glint',reverb(x,1.6,0.45),0.4)
m=json.load(open('audio.json'))
for k in ['dark_presence_loop','glint']: m['sfx'][k]='sfx_'+k
m['notes']['true_dark']=("Floor 3+ (and the deep-dark test switch). For a monster waiting outside the light (where Pixelartie's eye glints show), loop sfx_dark_presence_loop from its square, positional, quiet (0.3), stopping once light reaches it and its normal alert plays. "
 "sfx_glint once, quietly, the first time a key/lever glint comes into view in the dark. In true dark also drop the Act 1 music to ~0.15 and the halls ambience by ~3 dB, so the player hears the dark rather than the score.")
json.dump(m,open('audio.json','w'),indent=1)
