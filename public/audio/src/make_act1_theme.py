import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def pluck(f,d=3.0,g=0.3):
    N=int(SR/f); b=rng.uniform(-1,1,N); n=int(SR*d); out=np.empty(n)
    for i in range(n):
        out[i]=b[i%N]; b[i%N]=0.997*0.5*(b[i%N]+b[(i+1)%N])
    return band(out,50,3000)*g
def bell(f,d=4.0,g=0.12):  # cold glassy bell, slightly inharmonic
    u=t(d); return sum(np.sin(2*np.pi*f*r*u)*a*np.exp(-u/(1.6/r**0.5)) for r,a in ((1,1),(2.76,0.35),(5.4,0.12)))*np.minimum(1,u/0.003)*g
def drone(fs,d,g):
    u=t(d); return sum(np.sin(2*np.pi*f*u+0.6*np.sin(2*np.pi*0.07*u+i))*(0.6+0.4*np.sin(2*np.pi*u/16+i)) for i,f in enumerate(fs))*g
n2f=lambda m:440*2**((m-69)/12)
BPM=60; beat=1.0; L=64.0; T=L+6
mus=np.zeros(int(SR*T)); u=t(T)
# low cold drone: D2/A2, swelling every 16s; air band like breath in a tomb
mus+=drone([n2f(38),n2f(45),n2f(50)*1.002],T,0.06)
mus+=band(noise(T),200,1200)*(0.5+0.5*np.sin(2*np.pi*u/16))*0.015
# harmony shifts every 16 bars: Dm -> Bb -> Gm -> A (unresolved, cold)
chords=[(50,53,57),(46,50,53),(43,46,50),(45,49,52)]
for i,c in enumerate(chords):
    u2=t(18); e=np.minimum(1,np.minimum(u2/5,(18-u2)/5)).clip(0)
    at(mus,sum(np.sin(2*np.pi*n2f(m+12)*u2) for m in c)*e*0.025,i*16)
# sparse bell motif (D F E A ... ), lots of space
motif=[(0,74),(3,77),(5,76),(9,69),(16,74),(19,77),(21,79),(24,76),(32,72),(35,74),(37,70),(41,69),(48,74),(51,77),(53,76),(57,73)]
for b_,m in motif: at(mus,bell(n2f(m),4.0,0.1),b_*beat)
# echo bells an octave up, very quiet, off-beat
for b_,m in motif[::3]: at(mus,bell(n2f(m+12),3.0,0.03),b_*beat+1.5)
# low pluck heartbeat on chord roots
for i,c in enumerate(chords):
    for k in (0,6,12): at(mus,pluck(n2f(c[0]-12),3.0,0.18),i*16+k)
mus=reverb(mus,4.0,0.5)
n=int(SR*L); y=mus[:n].copy(); xf=int(SR*4); f=np.linspace(0,1,xf); y[:xf]=y[:xf]*f+mus[n:n+xf]*(1-f)
save('music_act1_loop',y,0.6,stereo=True)
m=json.load(open('audio.json'))
m['music']['music_act1']={'file':'music_act1_loop','loop':True,'length_s':64,'volume':0.3}
m['notes']['music_act1']=("Act 1 (floors 1-4) theme: cold, sparse D minor bells over a low drone; loops seamlessly at 64s. Play at ~0.3 under amb_flooded_halls, fade in over 4s after the intro/floor load. "
 "Duck to 0.12 during fights and conversations; stop (2s fade) when sfx_flood_start plays on floor 4. Non-positional.")
json.dump(m,open('audio.json','w'),indent=1)
