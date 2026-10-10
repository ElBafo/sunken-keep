import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def pluck(f,d=2.5,g=0.3):
    N=int(SR/f); buf=rng.uniform(-1,1,N); n=int(SR*d); out=np.empty(n)
    for i in range(n):
        out[i]=buf[i%N]; buf[i%N]=0.996*0.5*(buf[i%N]+buf[(i+1)%N])
    return band(out,60,5000)*g
def padc(freqs,d,g=0.1):
    u=t(d); e=np.minimum(1,np.minimum(u/2,(d-u)/2)).clip(0)
    return sum(np.sin(2*np.pi*f*u+0.5*np.sin(2*np.pi*0.2*u))+0.25*np.sin(4*np.pi*f*u) for f in freqs)*e*g
BPM=66; beat=60/BPM; bars=8; L=bars*4*beat; T=L+4
mus=np.zeros(int(SR*T))
D,E,F,G,A,Bb,C=146.83,164.81,174.61,196.0,220.0,233.08,261.63
prog=[([D,F,A],D/2),([Bb/2*2,D,F],Bb/2),([F,A,C],F/2),([C,E,G],C/2),
      ([D,F,A],D/2),([G/1,Bb,D*2],G/2),([A/1,C*1.0,E*2/1],A/2),([D,F,A],D/2)]
for b,(ch,root) in enumerate(prog):
    s=b*4*beat
    at(mus,padc([c*0.5 for c in ch],4*beat+2,0.07),s)
    at(mus,np.sin(2*np.pi*root*t(4*beat))*np.minimum(1,t(4*beat)/0.5)*np.exp(-t(4*beat)/3)*0.18,s)
    arp=[ch[0],ch[1],ch[2],ch[1]*2 if b%2 else ch[2]*2/1.5*1.0, ch[2],ch[1]]
    for k,f in enumerate(arp): at(mus,pluck(f*2,2.2,0.22),s+k*(4*beat/6))
# melody in bars 5-8
mel=[(16,A*2,2),(18,G*2,1),(19,F*2,1),(20,G*2,3),(23,D*2,1),(24,E*2,2),(26,C*2,2),(28,D*2,4)]
for bt,f,dur in mel:
    d=dur*beat+0.6; u=t(d); vib=1+0.006*np.sin(2*np.pi*5*u)*np.minimum(1,u/0.4)
    v=(np.sin(2*np.pi*np.cumsum(f*vib)/SR)+0.35*np.sin(4*np.pi*np.cumsum(f*vib)/SR)+0.1*np.sin(6*np.pi*np.cumsum(f*vib)/SR))
    at(mus,v*np.minimum(1,np.minimum(u/0.15,(d-u)/0.5)).clip(0)*0.09,bt*beat)
for _ in range(14): at(mus,drip(rng.uniform(900,1600))*0.06,rng.uniform(0,L))
at(mus,sigh(4,50)*0.12,L-5)
mus=reverb(mus,3.0,0.45)
n=int(SR*L); y=mus[:n].copy(); xf=int(SR*3); f_=np.linspace(0,1,xf); y[:xf]=y[:xf]*f_+mus[n:n+xf]*(1-f_)
save('music_menu_loop',y,0.8)
# save chime
c=np.zeros(int(SR*1.5))
for k,f in enumerate([D*2,A*2,D*4]): at(c,pluck(f,1.2,0.4),k*0.08)
save('sfx_save',reverb(c,1.2,0.35),0.6)
m=json.load(open('audio.json'))
m['music']['menu']={"file":"music_menu_loop","loop":True,"length_s":round(L,2),"volume":0.7}
m['sfx']['save']='sfx_save'
m['notes']['menu']="music_menu_loop on the title/load screens; crossfade ~1s into music_intro on New Game. sfx_save on manual save and autosave (autosave at ~50% volume)."
json.dump(m,open('audio.json','w'),indent=1); print(L)
