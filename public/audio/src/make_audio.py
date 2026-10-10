import numpy as np, wave, os, subprocess, json
SR=44100; rng=np.random.default_rng(7)
OUT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def t(d): return np.arange(int(SR*d))/SR
def noise(d): return rng.standard_normal(int(SR*d))
def band(x,lo,hi):
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/SR)
    X[(f<lo)|(f>hi)]=0; return np.fft.irfft(X,len(x))
def lp(x,a):  # one-pole lowpass, a in (0,1)
    y=np.empty_like(x); s=0.
    for i in range(len(x)): s+=a*(x[i]-s); y[i]=s
    return y
def env(n,att,dec):
    e=np.ones(n); a=int(SR*att); 
    if a: e[:a]=np.linspace(0,1,a)
    tt=np.arange(n-a)/SR; e[a:]=np.exp(-tt/dec); return e
def norm(x,p=0.9): m=np.max(np.abs(x)); return x/m*p if m>0 else x
def pad(x,n): return np.pad(x,(0,max(0,n-len(x))))[:n]
def mix(*xs):
    n=max(len(x) for x in xs); return sum(pad(x,n) for x in xs)
def at(buf,x,sec,g=1.0):
    i=int(sec*SR); j=min(len(buf),i+len(x)); buf[i:j]+=g*x[:j-i]
def reverb(x,decay=1.5,wet=0.3):
    ir=noise(decay)*np.exp(-t(decay)/(decay/5)); ir=band(ir,80,6000); ir/=np.sqrt(np.sum(ir**2))
    y=np.fft.irfft(np.fft.rfft(x,len(x)+len(ir))*np.fft.rfft(ir,len(x)+len(ir)))
    return pad(x,len(y))*(1-wet)+y*wet
def save(name,x,peak=0.9,stereo=False,q=4):
    x=norm(x,peak); wav=f'/tmp/{name}.wav'
    with wave.open(wav,'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x*32767).astype('<i2').tobytes())
    for ext,args in (('ogg',['-c:a','libvorbis','-q:a',str(q)]),('mp3',['-c:a','libmp3lame','-b:a','96k'])):
        subprocess.run(['ffmpeg','-y','-loglevel','error','-i',wav,*args,f'{OUT}/{name}.{ext}'],check=True)

def drip(pitch=1400):
    d=0.18; tt=t(d); f=pitch*(1+2.5*np.exp(-tt/0.012))
    return np.sin(2*np.pi*np.cumsum(f)/SR)*env(len(tt),0.001,0.035)
def sigh(d=3.2,base=55):
    tt=t(d); e=np.sin(np.pi*np.clip(tt/d,0,1))**1.6
    f=base*(1+0.08*np.sin(2*np.pi*tt/d)) - 6*tt/d
    ph=2*np.pi*np.cumsum(f)/SR
    tone=np.sin(ph)+0.5*np.sin(2*ph+0.3)+0.25*np.sin(3*ph)
    breath=band(noise(d),120,700)*0.6
    x=(tone*0.7+breath)*e
    return reverb(x,2.5,0.45)

# ---- SFX ----
def step():
    d=0.16; x=band(noise(d),60,900)*env(int(SR*d),0.003,0.03)
    x+=0.6*np.sin(2*np.pi*90*t(d))*env(int(SR*d),0.002,0.025)
    sq=band(noise(d),900,3000)*env(int(SR*d),0.02,0.03)*0.25  # wet squelch
    return reverb(x+sq,0.6,0.25)
def bump():
    d=0.35; tt=t(d); x=np.sin(2*np.pi*(70-30*tt)*tt)*env(len(tt),0.002,0.07)
    x+=band(noise(d),40,500)*env(len(tt),0.001,0.03)*0.8
    return reverb(x,0.7,0.3)
def door():
    d=1.4; tt=t(d); creak=np.sin(2*np.pi*np.cumsum(180+60*np.sin(2*np.pi*3*tt)+rng.standard_normal(len(tt))*30)/SR)
    creak*=(0.5+0.5*np.sign(np.sin(2*np.pi*np.cumsum(28+10*tt)/SR)))*np.sin(np.pi*np.clip(tt/1.0,0,1))
    creak=band(creak,150,2500)*0.5
    thud=np.zeros(len(tt)); at(thud,bump()*1.2,1.0)
    return reverb(mix(creak,thud),1.4,0.35)
def key():
    out=np.zeros(int(SR*0.9))
    for i,(f,g) in enumerate([(2600,1),(3300,0.7),(2900,0.8)]):
        d=0.5; tt=t(d); r=sum(np.sin(2*np.pi*f*m*tt)*a for m,a in((1,1),(2.76,0.4),(5.4,0.2)))*env(len(tt),0.001,0.08)
        at(out,r*g,i*0.09)
    return reverb(out,0.8,0.3)
def hit():
    d=0.45; tt=t(d); x=band(noise(d),100,3500)*env(len(tt),0.001,0.05)
    x+=np.sin(2*np.pi*(120-60*tt)*tt)*env(len(tt),0.001,0.08)
    clang=sum(np.sin(2*np.pi*f*tt) for f in(820,1310,2170))*env(len(tt),0.001,0.12)*0.25
    return reverb(np.tanh(2*(x+clang)),0.6,0.2)
def secret_wall():
    d=2.2; tt=t(d); grind=band(noise(d),50,900)*(0.6+0.4*np.sin(2*np.pi*11*tt))*np.sin(np.pi*np.clip(tt/1.6,0,1))
    rumble=np.sin(2*np.pi*42*tt)*np.sin(np.pi*np.clip(tt/1.8,0,1))*0.6
    x=mix(grind,rumble); at(x,bump(),1.6,0.9)
    for s in (0.3,0.9,1.3): at(x,band(noise(0.08),1500,5000)*env(int(SR*0.08),0.001,0.015)*0.4,s)  # pebbles
    return reverb(x,1.8,0.4)
def bark():  # soft speech-bubble blip
    d=0.07; tt=t(d); return np.sin(2*np.pi*660*tt)*env(len(tt),0.002,0.02)*0.8+np.sin(2*np.pi*990*tt)*env(len(tt),0.002,0.012)*0.3
def hit_hurt():  # grunt-like thump for party taking damage
    d=0.3; tt=t(d); f=180-90*tt/d; ph=2*np.pi*np.cumsum(f)/SR
    return np.tanh(3*(np.sin(ph)+0.5*np.sin(3*ph)))*env(len(tt),0.005,0.07)*0.7+band(noise(d),200,1200)*env(len(tt),0.001,0.04)

for n,fn in [('sfx_step',step),('sfx_bump',bump),('sfx_door',door),('sfx_key',key),('sfx_hit',hit),
             ('sfx_hurt',hit_hurt),('sfx_secret_wall',secret_wall),('sfx_bark',bark)]:
    save(n,fn(),0.85)
save('sfx_tide_sigh',sigh(),0.9)

# ---- swamp ambience loop (24s, seamless) ----
L=24; n=int(SR*L); amb=np.zeros(n+SR*2)
amb+=lp(noise(L+2),0.02)*0.5                       # low wet air
amb+=np.sin(2*np.pi*48*t(L+2))*0.06*(1+0.5*np.sin(2*np.pi*t(L+2)/12))
pass
for _ in range(9):  # frogs
    s=rng.uniform(0,L-1); f=rng.uniform(140,260)
    for k in range(rng.integers(2,5)):
        d=0.09; tt=t(d); c=np.sign(np.sin(2*np.pi*f*tt))*np.sin(np.pi*tt/d)*0.12
        at(amb,band(c,100,1500),s+k*0.13)
for _ in range(5): # distant insects
    s=rng.uniform(0,L-3); d=rng.uniform(1.5,3); tt=t(d)
    at(amb,np.sin(2*np.pi*4200*tt)*(0.5+0.5*np.sin(2*np.pi*28*tt))*np.sin(np.pi*tt/d)*0.025,s)
at(amb,sigh(4,48)*0.12,13)   # Hollow Tide, barely audible
amb=reverb(amb,2.0,0.35)
x=amb[:n].copy(); xf=SR*2; fade=np.linspace(0,1,xf)
x[:xf]=x[:xf]*fade+amb[n:n+xf]*(1-fade)   # crossfade tail into head -> seamless
save('amb_swamp_loop',x,0.6,q=3)

# ---- intro score (35s, matches storyboard shots) ----
D=35; mus=np.zeros(int(SR*(D+3)))
def pad_chord(freqs,d,g=0.15):
    tt=t(d); e=np.minimum(1,np.minimum(tt/1.2,(d-tt)/1.5)).clip(0)
    return sum(np.sin(2*np.pi*f*tt+np.sin(2*np.pi*0.3*tt)*0.4)+0.3*np.sin(4*np.pi*f*tt) for f in freqs)*e*g
def anvil(g=0.5):
    d=1.8; tt=t(d); return sum(np.sin(2*np.pi*f*tt)*a for f,a in((1250,1),(1873,0.6),(3110,0.35),(4470,0.2)))*env(len(tt),0.001,0.35)*g
def thunder(d=3.5):
    tt=t(d); return lp(noise(d),0.01)*env(len(tt),0.02,0.9)*3
D_,A,F,C,G=73.42,110,87.31,130.81,98
# 1 keep at height 0-6: warm D minor -> F, distant anvil
at(mus,pad_chord([D_*2,F*2,A*2],6.5),0); at(mus,np.sin(2*np.pi*D_*t(6.5))*0.12*np.minimum(1,t(6.5)/1),0)
for s in(1.0,2.5,4.0): at(mus,reverb(anvil(0.25),2.5,0.6),s)
# 2 night it sank 6-12: thunder, groan, sigh
at(mus,pad_chord([D_,D_*1.5,D_*2.38],6.5,0.13),6)
at(mus,thunder()*0.6,6.2); at(mus,thunder(4)*0.8,8.4)
gt=t(3); at(mus,band(np.sin(2*np.pi*np.cumsum(38+8*np.sin(2*np.pi*0.7*gt))/SR)+0.4*noise(3),25,300)*np.sin(np.pi*gt/3)*0.6,8.5)
at(mus,sigh(3.2,52)*0.7,10.3)
# 3 drowned forge 12-18: muffled, bubbles, steam puff
seg=pad_chord([D_*2,D_*2.38,A*2],6.5,0.14); at(mus,lp(seg,0.05)*1.6,12)
for _ in range(25):
    s=rng.uniform(12,18); f=rng.uniform(300,700); d=0.06; tt=t(d)
    at(mus,np.sin(2*np.pi*np.cumsum(f*(1+3*tt/d))/SR)*env(len(tt),0.002,0.02)*0.08,s)
at(mus,band(noise(1.2),400,4000)*env(int(SR*1.2),0.05,0.25)*0.25,15.5)
# 4 those who stayed 18-24: single low note
at(mus,(np.sin(2*np.pi*36.71*t(6.5))+0.3*np.sin(2*np.pi*73.42*t(6.5)))*np.minimum(1,np.minimum(t(6.5)/0.8,(6.5-t(6.5))/1.2)).clip(0)*0.35,18)
for k in range(5): at(mus,reverb(drip(1800)*0.08,2,0.6),18.8+k*1.0)
# 5 swamp today 24-29: lift into fog, frogs
at(mus,pad_chord([D_*2,G*2,A*2],5.5,0.12),24)
for _ in range(6):
    s=rng.uniform(24,28.5); f=rng.uniform(150,240); d=0.09; tt=t(d)
    for k in range(3): at(mus,band(np.sign(np.sin(2*np.pi*f*tt))*np.sin(np.pi*tt/d)*0.08,100,1500),s+k*0.13)
# 6 party at gate 29-35: warm resolve, forge theme returns, title hit
at(mus,pad_chord([D_*2,F*2,A*2,C*2],6.5,0.13),29)
mel=[(29.3,A*4),(30.1,C*4),(30.9,D_*8),(32.0,A*4)]
for s,f in mel:
    tt=t(1.2); at(mus,(np.sin(2*np.pi*f*tt)+0.3*np.sin(4*np.pi*f*tt))*env(len(tt),0.02,0.45)*0.12,s)
at(mus,reverb(anvil(0.5),3,0.6),33.0); at(mus,np.sin(2*np.pi*D_*t(3))*env(SR*3,0.01,0.9)*0.4,33.0)
mus=reverb(mus,2.5,0.3)[:int(SR*(D+2.5))]
fo=int(SR*2); mus[-fo:]*=np.linspace(1,0,fo)
save('music_intro',mus,0.85)

json.dump({
 "sfx":{"step":"sfx_step","bump":"sfx_bump","door":"sfx_door","key":"sfx_key","hit":"sfx_hit",
        "hurt":"sfx_hurt","secret_wall":"sfx_secret_wall","bark":"sfx_bark","tide_sigh":"sfx_tide_sigh"},
 "music":{"intro":{"file":"music_intro","loop":False,"length_s":37.5,
   "cues_s":{"shot1":0,"shot2":6,"thunder":6.2,"tide_sigh":10.3,"shot3":12,"shot4":18,"shot5":24,"shot6":29,"title_hit":33.0}},
  "amb_swamp":{"file":"amb_swamp_loop","loop":True,"length_s":24,"volume":0.5}},
 "formats":["ogg","mp3"],
 "notes":{"tide_sigh":"Scale volume with depth: ~0.25 floor 1, up to 1.0 deep. Play on tapping the glowing carving.",
          "bark":"Very short blip; play once per bubble, not per letter.",
          "hurt":"Party member taking damage; 'hit' is the party striking an enemy."}
},open(f'{OUT}/audio.json','w'),indent=1)
print('ok')
