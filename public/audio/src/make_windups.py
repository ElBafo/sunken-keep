# Monster attack wind-ups (telegraphs). Self-contained helpers; no exec of other scripts.
# Each ends abruptly at the strike moment; the game then plays <monster>_attack.
import numpy as np, wave, os, subprocess, json, re
SR=44100; R=np.random.default_rng(1010)
OUT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET=-20.0; PEAK_DB=-1.0

def tt_(d): return np.arange(int(SR*d))/SR
def wnoise(d): return R.standard_normal(int(SR*d))
def bandf(x,lo,hi):
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/SR); X[(f<lo)|(f>hi)]=0; return np.fft.irfft(X,len(x))
def decay_env(n,att,dec):
    e=np.ones(n); a=int(SR*att)
    if a: e[:a]=np.linspace(0,1,a)
    e[a:]=np.exp(-(np.arange(n-a)/SR)/dec); return e
def place(buf,x,sec,g=1.0):
    i=int(sec*SR); j=min(len(buf),i+len(x))
    if j>i: buf[i:j]+=g*x[:j-i]
def room(x,decay=0.6,wet=0.2):
    ir=wnoise(decay)*np.exp(-tt_(decay)/(decay/5)); ir=bandf(ir,150,6000); ir/=np.sqrt(np.sum(ir**2))
    n=len(x)+len(ir); y=np.fft.irfft(np.fft.rfft(x,n)*np.fft.rfft(ir,n),n)[:len(x)]
    return x*(1-wet)+y*wet          # truncated: no tail past the strike
def hard_end(x,ms=4):
    k=int(SR*ms/1000); x=x.copy(); x[-k:]*=np.linspace(1,0,k); return x
def click(f1,f2,dec=0.012,g=1.0):
    d=0.06; u=tt_(d)
    c=bandf(wnoise(d),1200,6000)*decay_env(len(u),0.0003,dec*0.4)
    c+=(np.sin(2*np.pi*f1*u)+0.6*np.sin(2*np.pi*f2*u))*decay_env(len(u),0.0005,dec)
    return c*g

def write_wav(path,x):
    with wave.open(path,'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x,-1,1)*32767).astype('<i2').tobytes())
def lufs(path):
    o=subprocess.run(['ffmpeg','-nostats','-i',path,'-af','ebur128=peak=true','-f','null','-'],capture_output=True,text=True,timeout=60).stderr
    I=float(re.findall(r'I:\s+(-?[\d.]+) LUFS',o)[-1]); P=float(re.findall(r'Peak:\s+(-?[\d.inf]+) dBFS',o)[-1]); return I,P
def level(name,x):
    x=x/np.max(np.abs(x))*0.5; wav=f'/tmp/wu/{name}.wav'
    for _ in range(8):
        write_wav(wav,x); I,_p=lufs(wav)
        if abs(I-TARGET)<0.15: break
        x=x*10**((TARGET-I)/20)
        lim=10**((PEAK_DB-0.6)/20)                       # soft limiter keeps true peak under -1
        x=np.where(np.abs(x)>lim*0.7, np.sign(x)*(lim*0.7+lim*0.3*np.tanh((np.abs(x)-lim*0.7)/(lim*0.3))), x)
    write_wav(wav,x)
    for ext,args in (('ogg',['-c:a','libvorbis','-q:a','4']),('mp3',['-c:a','libmp3lame','-b:a','96k'])):
        subprocess.run(['ffmpeg','-y','-loglevel','error','-i',wav,*args,f'{OUT}/{name}.{ext}'],check=True,timeout=60)
    return lufs(f'{OUT}/{name}.ogg')

# ---- rust crab: rasp + clicks accelerating, open-claw click at the end (1.0 s)
def crab():
    D=1.0; u=tt_(D); x=np.zeros(len(u))
    s=0.02; gap=0.16; k=0
    while s<0.88:
        g=0.35+0.5*s/D; f=R.uniform(1500,2100)*(1+0.3*s)
        place(x,click(f,f*1.73,0.010,g),s); s+=gap; gap=max(0.028,gap*0.82); k+=1
    rate=18+50*(u/D)**1.5                               # rasp grain speeds up
    saw=(np.cumsum(rate)/SR)%1
    rasp=bandf(wnoise(D),700,3800)*(saw**3)*(0.15+0.85*(u/D)**1.3)*0.55
    x+=rasp
    place(x,click(1250,2600,0.03,1.6),0.93)             # claws snap open
    place(x,bandf(wnoise(0.07),300,1500)*decay_env(int(SR*0.07),0.001,0.02)*0.6,0.93)
    return hard_end(room(x,0.5,0.18))

# ---- drowned dwarf: wet gurgling inhale + armour/chain creak rising (1.0 s)
def dwarf():
    D=1.0; u=tt_(D); x=np.zeros(len(u)); rise=(u/D)**1.2
    breath=bandf(wnoise(D),350,2600)*(0.15+0.85*rise)*0.5
    breath*=1+0.6*np.sin(2*np.pi*np.cumsum(9+14*u)/SR)  # wet flutter
    f0=70+55*rise; ph=2*np.pi*np.cumsum(f0*(1+0.04*R.standard_normal(len(u)).cumsum()/300))/SR
    throat=np.tanh(2.2*(np.sin(ph)+0.7*np.sin(2*ph)+0.5*np.sin(3*ph)+0.3*np.sin(5*ph)))
    throat=bandf(throat,200,3000)*(0.1+0.6*rise)*0.6
    x+=breath+throat
    for _ in range(26):                                # bubbles, denser toward the end
        s=D*np.sqrt(R.uniform(0.02,0.95)); f=R.uniform(320,900); d=0.05; w=tt_(d)
        place(x,np.sin(2*np.pi*np.cumsum(f*(1+2.5*w/d))/SR)*decay_env(len(w),0.002,0.015)*0.35,s)
    cr_rate=12+30*rise                                 # stick-slip leather/armour creak
    pulses=(np.sin(2*np.pi*np.cumsum(cr_rate)/SR)>0.6).astype(float)
    creak=np.sin(2*np.pi*np.cumsum(260+180*rise+40*R.standard_normal(len(u)))/SR)*pulses
    x+=bandf(creak,250,2500)*(0.1+0.6*rise)*0.5
    for s in np.sort(R.uniform(0.35,0.95,9)):          # chain links
        f=R.uniform(2200,3400); place(x,click(f,f*1.41,0.03,0.25+0.35*s),s)
    return hard_end(room(x,0.7,0.25))

# ---- Captain Dural: deep roar building, axe dragging on stone, rising metal scrape (1.3 s)
def dural():
    D=1.3; u=tt_(D); x=np.zeros(len(u)); rise=(u/D)**1.4
    f0=55+60*rise; ph=2*np.pi*np.cumsum(f0*(1+0.03*np.sin(2*np.pi*27*u)))/SR
    roar=np.tanh(3.0*(np.sin(ph)+0.8*np.sin(2*ph)+0.6*np.sin(3*ph)+0.4*np.sin(4*ph)+0.3*np.sin(6*ph)))
    roar=roar*(0.6+0.4*bandf(wnoise(D),20,60)*8).clip(0.2,1.5)
    x+=(bandf(roar,220,3200)*0.75+bandf(roar,60,220)*0.25)*(0.15+0.85*rise)*0.8
    x+=bandf(wnoise(D),400,1600)*(0.1+0.6*rise)*0.25    # roar breath
    grit=np.abs(bandf(wnoise(D),5,60))*6                # axe dragging on stone, grainy
    drag=bandf(wnoise(D),250,3500)*grit.clip(0,2)*np.minimum(1,u/0.15)*(0.5+0.3*rise)*0.35
    x+=drag
    for s in np.sort(R.uniform(0.05,1.1,10)):          # stone chips
        place(x,bandf(wnoise(0.03),1500,5000)*decay_env(int(SR*0.03),0.0005,0.006)*0.3,s)
    fs=900+1700*rise**1.3                               # metal scrape rising
    sc=sum(a*np.sin(2*np.pi*np.cumsum(fs*m)/SR) for m,a in ((1,1),(1.47,0.5),(2.09,0.35)))
    sc*=(0.6+0.4*np.abs(np.sin(2*np.pi*np.cumsum(30+40*rise)/SR)))
    x+=sc*np.clip((u-0.3)/(D-0.3),0,1)**1.8*0.35
    place(x,click(1400,2300,0.02,1.1),D-0.05)            # axe lifts free at the top
    return hard_end(room(x,0.9,0.28))

res={}
for name,fn in (('sfx_rust_crab_windup',crab),('sfx_drowned_dwarf_windup',dwarf),('sfx_dural_windup',dural)):
    res[name]=level(name,fn()); print(name,res[name])

m=json.load(open(f'{OUT}/audio.json'))
for k in ('rust_crab','drowned_dwarf','dural'): m['sfx'][f'{k}_windup']=f'sfx_{k}_windup'
m['notes']['windups']=("Monster attack telegraphs. Play <monster>_windup when the visual tell starts (crab claw-raise, dwarf overhead wind-up, Dural's flash); "
 "the attack lands at its end: rust_crab and drowned_dwarf 1.0 s, dural 1.3 s, then play the attack sound (dural uses drowned_dwarf_attack until it has its own). "
 "Positional from the monster, combat priority, never ducked or voice-stolen. If the monster is interrupted or dies, stop the wind-up at once.")
json.dump(m,open(f'{OUT}/audio.json','w'),indent=1)
