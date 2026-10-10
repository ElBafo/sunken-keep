import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def buf(d): return np.zeros(int(SR*d))
def ring(fs,dec,g,d=0.5):
    u=t(d); return sum(np.sin(2*np.pi*f*u)*a for f,a in fs)*env(len(u),0.002,dec)*g
# take from bracket: iron scrape + flame whoosh as it moves
x=buf(1.0); u=t(0.25); at(x,band(noise(0.25),1200,5000)*np.sin(np.pi*u/0.25)*0.25,0); at(x,ring([(1700,1),(2600,0.4)],0.06,0.15),0.2)
u=t(0.5); at(x,band(noise(0.5),150,2000)*np.sin(np.pi*u/0.5)**2*0.4,0.15)
save('sfx_torch_take',reverb(x,0.9,0.2),0.7)
# put back into bracket: whoosh + iron clank seat
x=buf(1.0); u=t(0.4); at(x,band(noise(0.4),150,2000)*np.sin(np.pi*u/0.4)**2*0.35,0); at(x,ring([(1500,1),(2300,0.5)],0.08,0.35),0.35); at(x,band(noise(0.05),300,3000)*env(int(SR*0.05),0.001,0.01)*0.5,0.35)
save('sfx_torch_place',reverb(x,0.9,0.2),0.75)
# swing: roaring fire whoosh, then a burning thump with crackle
x=buf(1.0); u=t(0.35); at(x,band(noise(0.35),120,2500)*np.sin(np.pi*u/0.35)**3*0.8,0)
at(x,band(noise(0.15),60,600)*env(int(SR*0.15),0.001,0.04)*0.7,0.3)
for _ in range(8): at(x,band(noise(0.01),2000,8000)*env(int(SR*0.01),0.0005,0.003)*rng.uniform(0.2,0.5),0.3+rng.uniform(0,0.4))
save('sfx_act_torch',reverb(x,0.8,0.2),0.8)
# dunk in water: splash + violent short hiss + bubbling
x=buf(1.6); at(x,splash(0.3,300,4000)*0.5,0); u=t(0.6); at(x,band(noise(0.6),2500,9000)*np.minimum(1,u/0.01)*np.exp(-u/0.18)*0.6,0.03)
for k in range(6): f0=rng.uniform(300,600); at(x,gloop(0.08,f0,f0*1.4)*0.15,0.25+k*0.09)
save('sfx_torch_dunk',reverb(x,1.2,0.25),0.75)
m=json.load(open('audio.json'))
for k in ['torch_take','torch_place','act_torch','torch_dunk']: m['sfx'][k]='sfx_'+k
m['notes']['torch_hand']=("Party panel round. Wall torch Take: sfx_torch_take (stop that bracket's torch_loop, start a quiet non-positional torch_loop at 0.2 while carried). Snuff: sfx_torch_extinguish. "
 "Torch in hand tap: sfx_act_torch, then sfx_hit or sfx_act_miss as usual. Back into an empty bracket: sfx_torch_place (positional loop resumes there). Dropped into water: sfx_torch_dunk, stop the carried loop.")
json.dump(m,open('audio.json','w'),indent=1)
