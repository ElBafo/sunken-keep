import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
from numpy.fft import rfft,irfft,rfftfreq
V={'a':(800,1200,2500),'e':(500,1800,2500),'i':(300,2200,3000),'o':(500,850,2400),'u':(350,700,2400)}
def formant(x,fs,bw=(90,110,160)):
    X=rfft(x); fr=rfftfreq(len(x),1/SR); H=np.zeros_like(fr)
    for f,b,g in zip(fs,bw,(1,0.6,0.3)): H+=g/(1+((fr-f)/b)**2)
    return irfft(X*H,len(x))
def syl(f0,d,vow,scale=1.0,breath=0.0,rough=0.0,glide=0.0):
    n=int(SR*d); u=np.arange(n)/SR
    f=f0*(1+glide*u/d)*(1+0.02*np.sin(2*np.pi*5.5*u)); ph=np.cumsum(f)/SR
    src=2*(ph%1)-1; src+=rough*rng.standard_normal(n)*np.abs(np.sin(np.pi*ph))
    src+=breath*rng.standard_normal(n)
    y=formant(src,[v*scale for v in V[vow]])
    return y*np.sin(np.pi*u/d)**0.7
def voice(name,f0,scale,n_syl,rate,breath,rough,variants,rev,wet,mood_glide=0.0,peak=0.6):
    for k in range(1,variants+1):
        parts=[]
        for i in range(rng.integers(n_syl[0],n_syl[1]+1)):
            d=rng.uniform(*rate); g=rng.uniform(-0.15,0.15)+(mood_glide if i==0 else 0)
            parts.append(syl(f0*rng.uniform(0.9,1.15),d,rng.choice(list(V)),scale,breath,rough,g))
            parts.append(np.zeros(int(SR*rng.uniform(0.02,0.07))))
        x=np.concatenate(parts); x=np.pad(x,(0,int(SR*0.4)))
        save(f'vox_{name}_{k}',reverb(x,rev,wet),peak)
voice('hobb',230,1.15,(3,6),(0.06,0.11),0.05,0.0,4,0.6,0.15,0.2)   # quick, chirpy halfling chatter
voice('tam',165,1.0,(2,4),(0.12,0.22),0.35,0.0,4,1.4,0.35,-0.2)   # weak, breathy, half-drowned
voice('dural',85,0.82,(2,4),(0.12,0.2),0.08,0.35,4,1.6,0.3,-0.1)  # deep gruff drowned captain
voice('hessa',185,0.95,(2,4),(0.14,0.24),0.15,0.0,4,2.4,0.5,0.0)  # hollow, calm, echoing smith
m=json.load(open('audio.json'))
for c in ['hobb','tam','dural','hessa']:
    for k in range(1,5): m['sfx'][f'vox_{c}_{k}']=f'vox_{c}_{k}'
m['notes']['voices']=("Wordless character voices (work in English and Greek). On each conversation line, play a random vox_<npc>_1..4 (not the same one twice in a row) when the line appears, non-positional, volume 0.7. "
 "Hobb: quick chirpy chatter. Tam: weak and breathy. Dural: deep and gruff. Hessa: hollow, calm, echoing. npc ids match Levie's npc field (e.g. npc: 'hobb').")
json.dump(m,open('audio.json','w'),indent=1)
