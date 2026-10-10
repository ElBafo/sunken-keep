import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def loopify(x,L):
    n=int(SR*L); y=x[:n].copy(); xf=SR//2; f=np.linspace(0,1,xf); y[:xf]=y[:xf]*f+x[n:n+xf]*(1-f); return y
# 4 intensity loops: level 1 = water 4 squares behind (ankle) ... level 4 = 1 square behind (over head)
L=8; T=L+1
for lvl in range(1,5):
    u=t(T); k=lvl/4
    x=band(noise(T),30,180+120*lvl)*(0.6+0.4*np.sin(2*np.pi*u*(0.3+0.2*lvl)))*(0.5+0.5*k)   # deep rumble
    x+=band(noise(T),400,2500+1500*lvl)*(0.15+0.35*k)*(0.7+0.3*np.sin(2*np.pi*u*1.7))      # rushing surface
    for _ in range(int(T*(2+4*lvl))):  # sloshes and debris knocks
        s=rng.uniform(0,T-0.6); at(x,splash(rng.uniform(0.2,0.5),200,3000+800*lvl)*rng.uniform(0.1,0.3)*k,s)
    for _ in range(lvl):  # stone groan
        s=rng.uniform(0,T-2); at(x,growl(1.6,45+rng.uniform(-5,5),38,0.3,0.25*k),s)
    save(f'amb_flood_rush_{lvl}_loop',reverb(loopify(x,L),1.2+0.3*lvl,0.25),0.5+0.1*lvl)
def thunder(d=3.5):
    tt=t(d); return lp(noise(d),0.01)*env(len(tt),0.02,0.9)*3
# start sting: Tide sigh, deep boom, rising swell
s_=np.zeros(int(SR*6))
at(s_,sigh(3.0,50)*0.6,0.0)
at(s_,thunder(3.0)*0.5,0.8)
u=t(4.5); sw=band(noise(4.5),60,1200)*(u/4.5)**2*0.7; at(s_,sw,1.4)
for i,f in enumerate((73.4,87.3,110.0,103.8)):  # dissonant low brass-ish swell D F A Ab
    at(s_,(np.sin(2*np.pi*f*u)+0.4*np.sin(4*np.pi*f*u))*np.sin(np.pi*u/4.5)**2*0.12,1.4)
save('sfx_flood_start',reverb(s_,2.5,0.35),0.9)
# checkpoint: relieved splash onto dry step + bright low chime
c=np.zeros(int(SR*1.5)); at(c,splash(0.4,300,5000)*0.5,0); u=t(1.2)
at(c,sum(np.sin(2*np.pi*f*u)*a for f,a in ((293.7,1),(440,0.6),(587.3,0.4)))*env(len(u),0.005,0.35)*0.25,0.15)
save('sfx_flood_checkpoint',reverb(c,1.5,0.3),0.7)
# caught: water slams over, muffled, heartbeat-ish thuds, silence
g=np.zeros(int(SR*3.5)); at(g,splash(0.8,100,6000)*0.9,0)
mu=lp(band(noise(2.6),40,400),0.05)*np.linspace(1,0,int(SR*2.6))*0.6; at(g,mu,0.5)
for i in range(3): at(g,band(noise(0.15),40,150)*env(int(SR*0.15),0.005,0.05)*(0.8-0.2*i),0.8+i*0.75)
save('sfx_flood_caught',reverb(g,2.0,0.3),0.85)
m=json.load(open('audio.json'))
for k in ['flood_rush_1','flood_rush_2','flood_rush_3','flood_rush_4']: m['music']['amb_'+k]={'file':'amb_'+k+'_loop','loop':True,'length_s':8,'volume':0.7}
for k in ['flood_start','flood_checkpoint','flood_caught']: m['sfx'][k]='sfx_'+k
m['notes']['flood_rush']="Floor 4 escape run. Level matches Pixelartie's rising.json: rush_1 = water 4 squares behind (ankle) ... rush_4 = 1 behind (over head). Run all four looped from the start and crossfade (~0.5s) to the current level; stop floor ambience/drips while running."
m['notes']['flood_start']="Plays once when the Tide speaks and the water starts rising (end of Act 1 cliffhanger), then rush_1 fades in."
m['notes']['flood_checkpoint']="Each of the 2 checkpoints. flood_caught on failure, before reloading the checkpoint."
json.dump(m,open('audio.json','w'),indent=1)
