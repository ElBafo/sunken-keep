import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def ring(fs,dec,g,d=1.0):
    u=t(d); return sum(np.sin(2*np.pi*f*u)*a for f,a in fs)*env(len(u),0.002,dec)*g
def grind(d,lo=80,hi=1500,g=0.5):
    u=t(d); return band(noise(d),lo,hi)*(0.6+0.4*np.abs(np.sin(2*np.pi*u*7)))*np.sin(np.pi*u/d)**0.5*g
def buf(d): return np.zeros(int(SR*d))
# lever: iron creak + heavy clunk
x=buf(1.0); at(x,grind(0.35,600,3000,0.25),0); at(x,band(noise(0.2),60,600)*env(int(SR*0.2),0.001,0.05)*0.9,0.33); at(x,ring([(180,1),(410,0.5)],0.12,0.3),0.33)
save('sfx_lever',reverb(x,1.0,0.25),0.85)
# vent switch: air shuts/opens down the shaft
x=buf(2.2); u=t(2.0); at(x,band(noise(2.0),100,1200)*np.sin(np.pi*u/2.0)*0.5,0.1); at(x,band(noise(0.3),50,300)*env(int(SR*0.3),0.002,0.1)*0.7,1.6)
save('sfx_vent_switch',reverb(x,2.0,0.4),0.8)
# room drains (gurgle down) / room floods (rush in)
x=buf(3.0)
for i in range(18): at(x,gloop(0.25,500-i*18,200-i*6)*0.4*(1-i/22),i*0.14)
at(x,band(noise(2.8),80,900)*np.linspace(1,0,int(SR*2.8))*0.3,0)
save('sfx_room_drain',reverb(x,1.8,0.35),0.8)
x=buf(3.0); u=t(2.8); at(x,band(noise(2.8),60,3000)*np.minimum(1,u/0.4)*np.linspace(1,0.2,len(u))*0.6,0)
for _ in range(10): at(x,splash(rng.uniform(0.2,0.4))*0.25,rng.uniform(0,2.2))
save('sfx_room_flood',reverb(x,1.8,0.35),0.8)
# offering bowl takes the flame: whoosh in, low hum, water doorway parts
x=buf(4.0); u=t(0.8); at(x,band(noise(0.8),200,4000)*np.concatenate([np.linspace(0,1,int(SR*0.3)),np.exp(-np.arange(int(SR*0.5))/SR/0.15)])*0.6,0)
u=t(2.5); at(x,(np.sin(2*np.pi*55*u)+0.5*np.sin(2*np.pi*82.4*u))*np.sin(np.pi*u/2.5)*0.25,0.4)
u=t(2.4); at(x,band(noise(2.4),300,5000)*np.sin(np.pi*u/2.4)*0.4,1.2)
at(x,sigh(2.0,60)*0.25,1.0)
save('sfx_bowl_offering',reverb(x,2.5,0.4),0.85)
# riddle: correct = stone door grinds open + low chord; wrong = dull thunk + short sigh
x=buf(4.0); at(x,ring([(146.8,1),(220,0.7),(293.7,0.5)],1.2,0.25,2.5),0); at(x,grind(3.0,60,900,0.6),0.6); at(x,band(noise(0.3),40,300)*env(int(SR*0.3),0.002,0.12)*0.8,3.5)
save('sfx_riddle_open',reverb(x,2.5,0.35),0.85)
x=buf(1.5); at(x,band(noise(0.2),60,500)*env(int(SR*0.2),0.001,0.06)*0.8,0); at(x,ring([(110,1),(103.8,0.8)],0.6,0.2),0.05)
save('sfx_riddle_wrong',reverb(x,1.5,0.3),0.75)
# drill tiles: 4 rising steps (shield, hammer, hammer, oath), wrong = grinding sigh reset, solved = rack opens
for i,f in enumerate((220,277.2,277.2,329.6)):
    x=buf(1.0); at(x,band(noise(0.08),100,1200)*env(int(SR*0.08),0.001,0.02)*0.8,0); at(x,ring([(f,1),(f*2,0.3)],0.35,0.3),0.01)
    save(f'sfx_tile_step_{i+1}',reverb(x,1.2,0.3),0.75)
x=buf(2.0); at(x,grind(1.3,60,1000,0.6),0); at(x,sigh(1.6,48)*0.35,0.2)
save('sfx_tile_reset',reverb(x,1.5,0.3),0.8)
x=buf(2.5); at(x,grind(1.0,200,2500,0.4),0); at(x,ring([(220,1),(277.2,0.7),(329.6,0.6),(440,0.4)],0.9,0.25,1.5),0.9)
save('sfx_secret_rack',reverb(x,2.0,0.35),0.85)
# lantern-only carving revealed: soft shimmer
x=buf(2.0); u=t(1.8)
for k in range(24): at(x,np.sin(2*np.pi*rng.uniform(1500,3500)*t(0.2))*env(int(SR*0.2),0.01,0.06)*0.06,rng.uniform(0,1.6))
at(x,np.sin(2*np.pi*440*u)*np.sin(np.pi*u/1.8)*0.08,0)
save('sfx_carving_reveal',reverb(x,2.0,0.45),0.6)
m=json.load(open('audio.json'))
names=['lever','vent_switch','room_drain','room_flood','bowl_offering','riddle_open','riddle_wrong','tile_step_1','tile_step_2','tile_step_3','tile_step_4','tile_reset','secret_rack','carving_reveal']
for k in names: m['sfx'][k]='sfx_'+k
m['notes']['puzzles']=("Act 1 puzzles (Levie's floorNPuzzles). Floor 2: sfx_lever then sfx_vent_switch, then sfx_room_drain at the room that dries and sfx_room_flood at the one that floods (positional, at those rooms). "
 "Floor 3: sfx_bowl_offering when the torch goes in the bowl (doorway parts at ~1.2s); stop that mess-hall torch's loop with sfx_torch_extinguish. sfx_carving_reveal when the lantern first lights a lantern-only carving. "
 "Floor 4 riddle: sfx_riddle_open on the right answer, sfx_riddle_wrong otherwise. Drill tiles: sfx_tile_step_1..4 by step index (shield, hammer, hammer, oath; notes rise so progress is audible), sfx_tile_reset on a wrong step, sfx_secret_rack when the hammer rack opens.")
json.dump(m,open('audio.json','w'),indent=1)
