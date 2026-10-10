import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def ring(fs,dec,g,d=1.0):
    u=t(d); return sum(np.sin(2*np.pi*f*u)*a for f,a in fs)*env(len(u),0.002,dec)*g
def buf(d): return np.zeros(int(SR*d))
def chain(d,rate=14,g=0.25):
    x=buf(d)
    for k in range(int(d*rate)):
        s=k/rate+rng.uniform(0,0.02); at(x,ring([(rng.uniform(1800,2600),1),(rng.uniform(3200,4200),0.5)],0.03,g,0.1),s)
    return x
# open: latch clack, chain ratchet + wooden panel grinding up in stone, thunk at top
x=buf(2.2); at(x,band(noise(0.06),300,3000)*env(int(SR*0.06),0.001,0.015)*0.8,0)
u=t(1.3); at(x,band(noise(1.3),120,1400)*np.sin(np.pi*u/1.3)**0.6*0.45,0.12); at(x,chain(1.3),0.12)
at(x,band(noise(0.2),50,400)*env(int(SR*0.2),0.002,0.06)*0.7,1.45)
save('sfx_door_open',reverb(x,1.4,0.3),0.85)
# close: quick slide down, heavy wooden slam
x=buf(2.0); u=t(0.6); at(x,band(noise(0.6),150,1800)*np.linspace(0.3,1,len(u))*0.4,0); at(x,chain(0.6,20,0.18),0)
at(x,band(noise(0.35),40,500)*env(int(SR*0.35),0.001,0.09)*1.0,0.6); at(x,ring([(95,1),(140,0.5)],0.25,0.4),0.6)
save('sfx_door_close',reverb(x,1.6,0.35),0.9)
# locked: handle rattle, won't budge
x=buf(1.0)
for k in range(4): at(x,band(noise(0.05),400,4000)*env(int(SR*0.05),0.001,0.015)*0.6,k*0.09); at(x,ring([(1300,1),(2100,0.4)],0.03,0.15,0.1),k*0.09)
at(x,band(noise(0.15),60,500)*env(int(SR*0.15),0.001,0.04)*0.5,0.4)
save('sfx_door_locked',reverb(x,1.0,0.25),0.75)
# unlock: key turn
x=buf(1.0); at(x,grind:=band(noise(0.25),800,5000)*np.sin(np.pi*t(0.25)/0.25)*0.3,0); at(x,ring([(900,1),(1500,0.5)],0.05,0.5,0.2),0.25); at(x,band(noise(0.05),200,2000)*env(int(SR*0.05),0.001,0.01)*0.6,0.27)
save('sfx_door_unlock',reverb(x,1.0,0.25),0.8)
# far atmosphere one-shots
x=buf(5); at(x,lp(band(noise(4),30,250),0.08)*np.sin(np.pi*t(4)/4)*2.0,0.2)            # stone settles, far rumble
save('sfx_far_rumble',reverb(x,3.0,0.5),0.5)
x=buf(5); at(x,growl(2.5,70,55,0.2,0.4),0.3); x=lp(x,0.15)                                  # distant groan through walls
save('sfx_far_groan',reverb(x,3.0,0.55),0.45)
x=buf(4); [at(x,band(noise(0.04),200,1500)*env(int(SR*0.04),0.001,0.01)*rng.uniform(0.3,0.8),0.2+i*0.12+rng.uniform(0,0.08)) for i in range(9)]
save('sfx_far_pebbles',reverb(lp(x,0.3),2.5,0.5),0.4)
x=buf(6); u=t(4.5); at(x,band(noise(4.5),150,700)*np.sin(np.pi*u/4.5)**2*0.6,0.3)  # wind moaning through a vent
for f in (196,233): at(x,np.sin(2*np.pi*(f+4*np.sin(2*np.pi*0.4*u))*u)*np.sin(np.pi*u/4.5)**2*0.05,0.3)
save('sfx_far_draught',reverb(x,3.0,0.5),0.45)
m=json.load(open('audio.json'))
for k in ['door_open','door_close','door_locked','door_unlock','far_rumble','far_groan','far_pebbles','far_draught']: m['sfx'][k]='sfx_'+k
m['notes']['doors_3d']="Tap-to-open doors (Pixelartie's door_panel slides up): sfx_door_open (panel reaches the top at ~1.45s, match the slide to it), sfx_door_close (slam at 0.6s), sfx_door_locked when tapped without the key, sfx_door_unlock when the key is used (then door_open). Positional at the door. Old sfx_door stays as a fallback."
m['notes']['atmosphere']="Under amb_flooded_halls, every 20-45s play one random sfx_far_* (rumble, groan, pebbles, draught) at volume 0.25-0.45, positional from a random direction 4-8 squares away, never the same one twice in a row. Floors 3+: favour groan; floors with vents: favour draught."
json.dump(m,open('audio.json','w'),indent=1)
