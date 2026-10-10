import json,os,shutil
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def buf(d): return np.zeros(int(SR*d))
def softenv(n,att,dec):
    u=np.arange(n)/SR; return np.minimum(1,u/att)*np.exp(-u/dec)
def stone(v):
    x=buf(0.35); n=int(SR*0.25); u=np.arange(n)/SR
    f=rng.uniform(85,110)
    at(x,np.sin(2*np.pi*(f-20*u/0.25)*u)*softenv(n,0.006,0.035)*0.8,0)                 # boot heel
    at(x,band(noise(0.25),180,1200)*softenv(n,0.008,0.03)*0.35,0)                         # leather on stone
    at(x,band(noise(0.12),250,1400)*softenv(int(SR*0.12),0.01,0.03)*rng.uniform(0.1,0.2),rng.uniform(0.07,0.1))  # toe scuff
    return lp(x,0.35)
def water(v,deep):
    x=buf(0.7)
    lo,hi=(90,900) if deep else (120,1400)
    d=0.45 if deep else 0.3; n=int(SR*d)
    at(x,band(noise(d),lo,hi)*softenv(n,0.02,d/3.5)*(0.6 if deep else 0.45),0)          # body of water pushed aside
    for k in range(3 if deep else 2):                                                      # low wet gloops
        f0=rng.uniform(140,220) if deep else rng.uniform(200,320)
        at(x,gloop(rng.uniform(0.08,0.14),f0,f0*0.7)*rng.uniform(0.25,0.4),rng.uniform(0.02,0.18))
    at(x,band(noise(0.25),200,1200)*softenv(int(SR*0.25),0.03,0.06)*0.15,d*0.6)           # drip back off the boot
    return lp(x,0.3)
for v in range(1,5):
    save(f'sfx_step_{v}',reverb(stone(v),0.5,0.12),0.4)
    save(f'sfx_step_water_shallow_{v}',reverb(water(v,False),0.6,0.15),0.4)
    save(f'sfx_step_water_deep_{v}',reverb(water(v,True),0.7,0.18),0.4)
# old names = variant 1, so nothing breaks
for base in ['sfx_step','sfx_step_water_shallow','sfx_step_water_deep']:
    for e in ('ogg','mp3'): shutil.copy(f'{base}_1.{e}',f'{base}.{e}')
m=json.load(open('audio.json'))
for base in ['step','step_water_shallow','step_water_deep']:
    m['sfx'][base+'_variants']=[f'sfx_{base}_{v}' for v in range(1,5)]
m['notes']['steps']=("Steps v2 (Loukas: still loud, water sounded like paper). Soft, low and dull now: no high end, soft attack. Pick a random variant _1.._4 each step, never the same twice in a row, "
 "with playbackRate 0.95-1.05. Files are made to sit at Gamie's 60%-quieter step volume (0.4); don't cut further. Shallow = short wet slosh, deep = heavier, lower wade.")
json.dump(m,open('audio.json','w'),indent=1)
