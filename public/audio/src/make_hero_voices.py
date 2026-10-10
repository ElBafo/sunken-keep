# Party hero voices: hurt grunts (2 variants) + downed groan for Brannoc, Wren, Ilsevar, Mags.
# Self-contained (no exec of other scripts). Source-filter synthesis: Rosenberg glottal pulse
# with jitter/shimmer/creak -> Klatt cascade formant resonators (time-varying vowels) + aspiration,
# then light room. Levelled with an own BS.1770 K-weighted meter (files < 0.4 s count as one block,
# because ffmpeg's ebur128 reports -70 for them), true peak checked by 4x oversampling.
import numpy as np, wave, os, subprocess, json, re
SR=44100; R=np.random.default_rng(20261010)
OUT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP='/tmp/hv'; os.makedirs(TMP,exist_ok=True)
PEAK_DB=-1.0

# ---------- small helpers (hv_ prefix so nothing clashes) ----------
def hv_t(d): return np.arange(int(round(SR*d)))/SR
def hv_curve(pts,n,d):
    """piecewise-linear keyframes [(sec,val),...] sampled over n samples of length d"""
    ts=np.array([p[0] for p in pts],float); vs=np.array([p[1] for p in pts],float)
    return np.interp(np.linspace(0,d,n,endpoint=False),ts,vs)
def hv_smooth_noise(n,rate_hz):
    k=max(2,int(n*rate_hz/SR)+2); pts=R.standard_normal(k)
    return np.interp(np.linspace(0,k-1,n),np.arange(k),pts)
def hv_band(x,lo,hi):
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/SR)
    H=np.ones_like(f)
    if lo>0: H*=1/np.sqrt(1+(lo/np.maximum(f,1e-3))**4)
    if hi>0: H*=1/np.sqrt(1+(f/hi)**4)
    return np.fft.irfft(X*H,len(x))
def hv_room(x,decay=0.5,wet=0.12):
    d=decay; ir=R.standard_normal(len(hv_t(d)))*np.exp(-hv_t(d)/(d/6)); ir=hv_band(ir,200,5000); ir/=np.sqrt(np.sum(ir**2))
    pad=np.concatenate([x,np.zeros(int(SR*d*0.4))]); n=len(pad)+len(ir)
    y=np.fft.irfft(np.fft.rfft(pad,n)*np.fft.rfft(ir,n),n)[:len(pad)]
    return pad*(1-wet)+y*wet

# vowel formants for an adult male tract (F1..F4); scaled per hero
VOW={'uh':(640,1190,2390,3300),'ah':(750,1150,2500,3400),'aa':(700,1650,2450,3400),
     'eh':(550,1770,2490,3400),'oh':(520,860,2400,3300),'er':(500,1450,2300,3300),
     'mm':(260,1050,2300,3200),'ng':(290,1650,2550,3300),'hh':(600,1400,2500,3400)}
BW=(80,100,140,200)

def hv_glottal(f0,oq,creak,jit,shim):
    n=len(f0)
    f=f0*(1+jit*hv_smooth_noise(n,90))
    ph=np.cumsum(f)/SR; cyc=np.floor(ph); p=ph-cyc
    tp=oq*0.80; tn=oq*0.20   # short closing phase = sharper glottal closure, more upper harmonics
    g=np.where(p<tp,0.5*(1-np.cos(np.pi*p/tp)),np.where(p<tp+tn,np.cos(0.5*np.pi*(p-tp)/tn),0.0))
    amp=1+shim*hv_smooth_noise(n,60)
    amp*=1-creak*0.55*(cyc%2)                         # period-doubling creak / fry
    flow=g*amp
    src=np.diff(flow,prepend=0)*SR/np.maximum(f,40)  # flow derivative ~ lip radiation
    return src,flow

def hv_tract(x,F,bwmul):
    """Klatt cascade of 4 resonators with per-sample formant tracks F (n x 4)"""
    T=1/SR; y=x
    for k in range(4):
        bw=BW[k]*bwmul
        C=-np.exp(-2*np.pi*bw*T)*np.ones(len(x)); B=2*np.exp(-np.pi*bw*T)*np.cos(2*np.pi*F[:,k]*T); A=1-B-C
        A=A.tolist(); B=B.tolist(); C=C.tolist(); xin=y.tolist(); out=[0.0]*len(xin); y1=y2=0.0
        for i in range(len(xin)):
            v=A[i]*xin[i]+B[i]*y1+C[i]*y2; out[i]=v; y2=y1; y1=v
        y=np.array(out)
    return y

def utter(d,f0,vow,voice,breath,scale,oq=0.55,creak=None,rattle=None,jit=0.012,shim=0.08,bwmul=1.0,tilt=0.0):
    """d sec; f0/vow/voice/breath/creak/rattle are keyframe lists"""
    n=int(round(SR*d))
    F0=hv_curve(f0,n,d)
    names=[v for _,v in vow]; tv=[s for s,_ in vow]
    F=np.stack([hv_curve(list(zip(tv,[VOW[v][k]*scale for v in names])),n,d) for k in range(4)],1)
    cr=hv_curve(creak,n,d) if creak else np.zeros(n)
    src,flow=hv_glottal(F0,oq,cr,jit,shim)
    if tilt>0:                                         # softer, warmer source (one-pole LP blend)
        lp=hv_band(src,0,900); src=src*(1-tilt)+lp*tilt*1.6
    va=hv_curve(voice,n,d); ba=hv_curve(breath,n,d)
    if rattle:                                         # throat rattle: irregular ~28 Hz flutter
        ra=hv_curve(rattle,n,d)
        rate=28*(1+0.25*hv_smooth_noise(n,8)); rp=np.cumsum(rate)/SR
        flut=0.5+0.5*np.sign(np.sin(2*np.pi*rp))*np.abs(np.sin(2*np.pi*rp))**0.3
        va=va*(1-ra+ra*flut)
    asp=R.standard_normal(n)*(0.35+0.65*flow/ (np.max(flow)+1e-9))   # pulsed aspiration
    asp=hv_band(asp,300,0)
    exc=src*va*0.02+asp*ba*0.05
    y=hv_tract(exc,F,bwmul)
    return y

def hv_hiss(d,pts,centre=4800,width=2600):
    n=int(round(SR*d)); x=hv_band(R.standard_normal(n),centre-width/2,centre+width/2)
    return x*hv_curve(pts,n,d)

def hv_presence(x,g=7.0,fc=1800):
    # restores the mouth/presence region the glottal tilt rolls off (helps phone speakers)
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/SR)
    return np.fft.irfft(X*(1+(g-1)/(1+(fc/np.maximum(f,1))**2)),len(x))
def hv_finish(x,hp=70,lp=7500,room=(0.35,0.10)):
    x=hv_presence(hv_band(x,hp,lp))
    k=int(SR*0.004); x[:k]*=np.linspace(0,1,k)
    x=hv_room(x,*room)
    k=int(SR*0.03); x[-k:]*=np.linspace(1,0,k)**2
    # trim the room tail once it is 40 dB under the peak
    thr=np.max(np.abs(x))*1e-2; idx=np.nonzero(np.abs(x)>thr)[0]
    x=x[:idx[-1]+int(SR*0.02)]
    k=int(SR*0.02); x[-k:]*=np.linspace(1,0,k)
    return x

# ---------- loudness ----------
def hv_biquad(x,b,a):
    b=[c/a[0] for c in b]; a=[c/a[0] for c in a]; xs=x.tolist(); out=[0.0]*len(xs); x1=x2=y1=y2=0.0
    for i,v in enumerate(xs):
        y=b[0]*v+b[1]*x1+b[2]*x2-a[1]*y1-a[2]*y2; out[i]=y; x2=x1; x1=v; y2=y1; y1=y
    return np.array(out)
def hv_kweight(x):
    G,Q,fc=4.0,0.7071752369554193,1681.974450955533
    A=10**(G/40); w=2*np.pi*fc/SR; al=np.sin(w)/(2*Q); c=np.cos(w); s=2*np.sqrt(A)*al
    b=[A*((A+1)+(A-1)*c+s),-2*A*((A-1)+(A+1)*c),A*((A+1)+(A-1)*c-s)]
    a=[(A+1)-(A-1)*c+s,2*((A-1)-(A+1)*c),(A+1)-(A-1)*c-s]
    x=hv_biquad(x,b,a)
    fc,Q=38.13547087613982,0.5003270373253953; w=2*np.pi*fc/SR; al=np.sin(w)/(2*Q); c=np.cos(w)
    return hv_biquad(x,[(1+c)/2,-(1+c),(1+c)/2],[1+al,-2*c,1-al])
def hv_lufs(x):
    y=hv_kweight(x); B=int(0.4*SR); S=int(0.1*SR)
    if len(y)<int(0.6*SR):   # short one-shots: one ungated block over the whole file
        return -0.691+10*np.log10(np.mean(y**2)+1e-20)
    ms=np.array([np.mean(y[i:i+B]**2) for i in range(0,len(y)-B+1,S)])
    l=-0.691+10*np.log10(ms+1e-20); ms=ms[l>-70]
    rel=-0.691+10*np.log10(np.mean(ms))-10; l=-0.691+10*np.log10(ms)
    return -0.691+10*np.log10(np.mean(ms[l>rel]))
def hv_truepeak(x):
    n=len(x); X=np.fft.rfft(x); up=np.fft.irfft(np.concatenate([X,np.zeros(3*n//2)]),4*n)*4
    return 20*np.log10(np.max(np.abs(up))+1e-12)
def hv_write(path,x):
    with wave.open(path,'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x,-1,1)*32767).astype('<i2').tobytes())
def hv_read(path):
    raw=subprocess.run(['ffmpeg','-loglevel','error','-i',path,'-f','s16le','-ac','1','-ar',str(SR),'-'],capture_output=True,timeout=60).stdout
    return np.frombuffer(raw,'<i2').astype(float)/32768
def hv_level(name,x,target):
    cap=int(SR*(0.48 if 'hurt' in name else 1.28))     # hard length cap, tail faded
    if len(x)>cap: x=x[:cap].copy(); k=int(SR*0.04); x[-k:]*=np.linspace(1,0,k)**2
    x=x/np.max(np.abs(x))*0.3
    lim=10**((PEAK_DB-1.0)/20); knee=lim*0.6
    for _ in range(8):
        x=x*10**((target-hv_lufs(x))/20)
        a=np.abs(x); x=np.where(a>knee,np.sign(x)*(knee+(lim-knee)*np.tanh((a-knee)/(lim-knee))),x)
        if abs(hv_lufs(x)-target)<0.15 and hv_truepeak(x)<PEAK_DB-0.5: break
    wav=f'{TMP}/{name}.wav'; hv_write(wav,x)
    for ext,args in (('ogg',['-c:a','libvorbis','-q:a','5']),('mp3',['-c:a','libmp3lame','-b:a','112k'])):
        subprocess.run(['ffmpeg','-y','-loglevel','error','-i',wav,*args,f'{OUT}/{name}.{ext}'],check=True,timeout=60)
    res={}
    for ext in ('ogg','mp3'):
        y=hv_read(f'{OUT}/{name}.{ext}'); res[ext]=(round(len(x)/SR,3),round(hv_lufs(y),1),round(hv_truepeak(y),1))
    return res

# ---------- the heroes ----------
# Brannoc: dwarf fighter, he/him. Gruff, proud. Low f0 ~95-135 Hz, short broad tract (x0.88), pressed + creaky.
def brannoc_hurt_1():   # clipped "HUH-ngh" through the teeth
    d=0.36; return hv_finish(utter(d,[(0,128),(0.06,134),(0.36,98)],[(0,'uh'),(0.18,'uh'),(0.36,'ng')],
        [(0,0),(0.012,1),(0.16,0.9),(0.36,0)],[(0,0.5),(0.05,0.12),(0.36,0.2)],0.88,oq=0.42,
        creak=[(0,0.1),(0.2,0.35),(0.36,0.6)],jit=0.02,shim=0.12),hp=60)
def brannoc_hurt_2():   # chesty "ARGH" with a growl
    d=0.42; return hv_finish(utter(d,[(0,118),(0.08,136),(0.42,100)],[(0,'ah'),(0.25,'ah'),(0.42,'uh')],
        [(0,0),(0.02,1),(0.22,0.95),(0.42,0)],[(0,0.2),(0.42,0.3)],0.88,oq=0.40,
        creak=[(0,0.45),(0.42,0.5)],jit=0.03,shim=0.15),hp=60)
def brannoc_down():     # heavy falling groan into fry, then an exhale
    d=1.1; return hv_finish(utter(d,[(0,124),(0.12,128),(0.65,92),(1.1,72)],[(0,'ah'),(0.4,'uh'),(0.75,'oh'),(1.1,'hh')],
        [(0,0),(0.03,1),(0.45,0.8),(0.8,0.35),(0.93,0.0),(1.1,0)],[(0,0.15),(0.65,0.3),(0.9,0.8),(1.1,0)],0.88,oq=0.45,
        creak=[(0,0.2),(0.5,0.4),(0.85,0.9),(1.1,1)],jit=0.025,shim=0.14),hp=60)

# Wren: human cleric of the Ember, she/her. Warm, dry wit, the conscience. f0 ~170-280 Hz, tract x1.14, soft/warm source.
def wren_hurt_1():      # sharp, controlled "ah!"
    d=0.30; return hv_finish(utter(d,[(0,262),(0.05,276),(0.30,212)],[(0,'ah'),(0.3,'uh')],
        [(0,0),(0.012,1),(0.12,0.8),(0.30,0)],[(0,0.4),(0.3,0.5)],1.14,oq=0.62,tilt=0.35,jit=0.01,shim=0.06))
def wren_hurt_2():      # stifled "mm-hn!", closed then opens on the breath
    d=0.38; return hv_finish(utter(d,[(0,238),(0.1,252),(0.38,206)],[(0,'mm'),(0.13,'mm'),(0.2,'eh'),(0.38,'uh')],
        [(0,0),(0.015,0.7),(0.13,0.8),(0.2,1),(0.38,0)],[(0,0.1),(0.13,0.2),(0.18,1.0),(0.38,0.3)],1.14,oq=0.6,tilt=0.35,jit=0.01,shim=0.06))
def wren_down():        # falling breathy "ahh..." that thins to an exhale
    d=1.05; return hv_finish(utter(d,[(0,252),(0.1,258),(0.75,186),(1.05,165)],[(0,'ah'),(0.5,'uh'),(1.05,'hh')],
        [(0,0),(0.03,1),(0.45,0.75),(0.8,0.25),(0.95,0),(1.05,0)],[(0,0.35),(0.6,0.6),(0.85,1.0),(1.05,0)],1.14,oq=0.66,tilt=0.4,
        creak=[(0,0),(0.7,0),(0.9,0.4)],jit=0.012,shim=0.08))

# Ilsevar: lizardfolk mage, he/him. Calm, unsettling. f0 ~105-160 Hz but nearly flat (calm), longer narrow tract (x0.94, narrow
# bandwidths), throat rattle + a dry hiss through the teeth. Voiced enough to read as a person, not a monster.
def ilsevar_hurt_1():   # "hss-HNH": hiss intake, then a contained voiced grunt with a rattle
    d=0.38; v=utter(d,[(0,150),(0.1,156),(0.38,142)],[(0,'hh'),(0.09,'er'),(0.38,'uh')],
        [(0,0),(0.08,0),(0.10,1),(0.27,0.8),(0.38,0)],[(0,0.5),(0.08,0.3),(0.38,0.2)],0.94,oq=0.5,
        rattle=[(0,0.3),(0.38,0.6)],jit=0.008,shim=0.06,bwmul=0.75)
    v+=hv_hiss(d,[(0,0),(0.01,1),(0.08,0.8),(0.11,0.1),(0.38,0)])*np.max(np.abs(v))*0.16
    return hv_finish(v,hp=80)
def ilsevar_hurt_2():   # "nnhh-sss": closed rattled grunt that leaks out as a hiss
    d=0.42; v=utter(d,[(0,146),(0.06,152),(0.42,138)],[(0,'ng'),(0.15,'er'),(0.42,'er')],
        [(0,0),(0.015,1),(0.23,0.8),(0.32,0),(0.42,0)],[(0,0.1),(0.28,0.3),(0.42,0)],0.94,oq=0.5,
        rattle=[(0,0.7),(0.42,0.8)],creak=[(0,0.2),(0.42,0.3)],jit=0.008,shim=0.06,bwmul=0.75)
    v+=hv_hiss(d,[(0,0),(0.22,0),(0.30,0.9),(0.42,0)])*np.max(np.abs(v))*0.15
    return hv_finish(v,hp=80)
def ilsevar_down():     # slow rattling "haaah" sinking, ending in a long dry hiss
    d=1.15; v=utter(d,[(0,150),(0.12,152),(0.65,120),(0.9,106)],[(0,'ah'),(0.5,'er'),(0.9,'hh'),(1.15,'hh')],
        [(0,0),(0.04,1),(0.5,0.75),(0.8,0.2),(0.9,0),(1.15,0)],[(0,0.2),(0.75,0.4),(1.15,0)],0.94,oq=0.5,
        rattle=[(0,0.35),(0.5,0.6),(0.9,0.9)],creak=[(0,0.1),(0.75,0.5)],jit=0.01,shim=0.07,bwmul=0.75)
    v+=hv_hiss(d,[(0,0),(0.65,0),(0.85,0.7),(1.02,0.45),(1.15,0)],centre=4300,width=3000)*np.max(np.abs(v))*0.16
    return hv_finish(v,hp=80)

# Mags: halfling rogue, she/her. Mouthy, quick. f0 ~220-410 Hz, small tract x1.27, bright and pressed, fast.
def mags_hurt_1():      # quick bright "AH!" with an upward flick
    d=0.26; return hv_finish(utter(d,[(0,340),(0.04,400),(0.26,318)],[(0,'aa'),(0.26,'ah')],
        [(0,0),(0.008,1),(0.1,0.85),(0.26,0)],[(0,0.25),(0.26,0.4)],1.27,oq=0.5,jit=0.012,shim=0.07))
def mags_hurt_2():      # indignant two-beat "eh-uh!"
    d=0.34; return hv_finish(utter(d,[(0,372),(0.05,388),(0.13,330),(0.16,360),(0.34,292)],[(0,'eh'),(0.12,'eh'),(0.17,'uh'),(0.34,'uh')],
        [(0,0),(0.01,1),(0.11,0.9),(0.135,0.25),(0.16,1),(0.34,0)],[(0,0.2),(0.34,0.4)],1.27,oq=0.5,jit=0.012,shim=0.07))
def mags_down():        # "ohhh..." groan dropping, ending in a short breath
    d=0.95; return hv_finish(utter(d,[(0,360),(0.08,372),(0.6,250),(0.95,220)],[(0,'aa'),(0.3,'oh'),(0.8,'uh'),(0.95,'hh')],
        [(0,0),(0.02,1),(0.4,0.8),(0.7,0.3),(0.82,0),(0.95,0)],[(0,0.3),(0.6,0.5),(0.78,1.0),(0.95,0)],1.27,oq=0.55,
        creak=[(0,0),(0.55,0),(0.75,0.4)],jit=0.014,shim=0.08))

HEROES={'brannoc':(brannoc_hurt_1,brannoc_hurt_2,brannoc_down,'95-136 Hz hurts, down 136->72 Hz'),
        'wren':(wren_hurt_1,wren_hurt_2,wren_down,'206-276 Hz hurts, down 258->165 Hz'),
        'ilsevar':(ilsevar_hurt_1,ilsevar_hurt_2,ilsevar_down,'138-156 Hz hurts (near-flat), down 152->106 Hz'),
        'mags':(mags_hurt_1,mags_hurt_2,mags_down,'292-400 Hz hurts, down 372->220 Hz')}
report={}
for h,(a,b,c,_) in HEROES.items():
    for name,fn,tgt in ((f'vox_{h}_hurt_1',a,-20.0),(f'vox_{h}_hurt_2',b,-20.0),(f'vox_{h}_down',c,-19.0)):
        report[name]=hv_level(name,fn(),tgt); print(name,report[name],flush=True)
json.dump(report,open(f'{TMP}/report.json','w'),indent=1)

# ---------- audio.json / manifest ----------
m=json.load(open(f'{OUT}/audio.json'))
for h in HEROES:
    for s in ('hurt_1','hurt_2','down'): m['sfx'][f'vox_{h}_{s}']=f'vox_{h}_{s}'
    m['sfx'][f'vox_{h}_hurt_variants']=[f'vox_{h}_hurt_1',f'vox_{h}_hurt_2']
m['notes']['hero_voices']=("Wordless party hero voices (work in English and Greek). Not positional (party sounds), Effects bus, combat priority. "
 "Hero takes damage: play a random vox_<hero>_hurt_variants entry, never the same one twice in a row for that hero, alongside the usual sfx_hurt; "
 "at most one hero hurt voice every 0.6 s across the whole party (drop extras, don't queue); optional: skip it for chip damage under 2 HP. "
 "Hero hits 0 HP: play vox_<hero>_down layered with sfx_hero_down (start together; the down voice is never skipped by the 0.6 s limit). "
 "Brannoc: low, gruff, creaky. Wren: warm mid voice. Ilsevar: calm, dry, with a throat rattle and a hiss. Mags: high, quick, bright. "
 "Hurts about -20 LUFS, downs about -19 LUFS, play at 1.0. hero ids match names.json (brannoc, wren, ilsevar, mags).")
json.dump(m,open(f'{OUT}/audio.json','w'),indent=1)
man=json.load(open(f'{OUT}/manifest_audio.json'))
for h in HEROES:
    for s in ('hurt_1','hurt_2','down'):
        for ext in ('mp3','ogg'):
            f=f'vox_{h}_{s}.{ext}'
            if f not in man: man.append(f)
man=sorted(man); json.dump(man,open(f'{OUT}/manifest_audio.json','w'),indent=1)
print('done')
