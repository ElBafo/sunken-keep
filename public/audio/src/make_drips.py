import json,os
src=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_halls.py')).read()
pre=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0]
exec(pre)
def cave_drip(p):
    d=0.35; u=t(d)
    f=p*(1+0.6*(1-np.exp(-u/0.03)))           # gentle upward bubble, not a downward chirp
    bub=np.sin(2*np.pi*np.cumsum(f)/SR)*env(len(u),0.002,0.05)
    tap=band(noise(d),200,1800)*env(len(u),0.0005,0.006)*0.6
    return band(bub*0.7+tap,120,2500)
def cave_verb(x): return reverb(reverb(x,2.8,0.7),1.5,0.3)
m=json.load(open('audio.json'))
for i,p in enumerate([380,460,540,620]):
    save(f'sfx_drip_{i+1}',cave_verb(cave_drip(p)),0.6); m['sfx'][f'drip_{i+1}']=f'sfx_drip_{i+1}'
json.dump(m,open('audio.json','w'),indent=1)
