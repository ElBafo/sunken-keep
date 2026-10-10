import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def buf(d): return np.zeros(int(SR*d))
def ring(fs,dec,g,d=1.0):
    u=t(d); return sum(np.sin(2*np.pi*f*u)*a for f,a in fs)*env(len(u),0.002,dec)*g
# critical: heavy crunch + bright metallic ring
x=buf(1.2); at(x,band(noise(0.12),80,3000)*env(int(SR*0.12),0.0005,0.03)*1.0,0); u=t(0.3); at(x,np.sin(2*np.pi*(90-50*u)*u)*env(len(u),0.001,0.07)*0.9,0)
at(x,ring([(1320,1),(1980,0.6),(2970,0.3)],0.25,0.35),0.01)
save('sfx_hit_crit',reverb(x,1.0,0.25),0.9)
# hero down: body hits wet stone, heavy splash, low falling tone
x=buf(2.0); at(x,band(noise(0.25),50,600)*env(int(SR*0.25),0.002,0.08)*0.9,0); at(x,splash(0.6,150,3000)*0.5,0.05)
u=t(1.4); at(x,np.sin(2*np.pi*(220*np.exp(-u*0.8))*u)*np.exp(-u/0.6)*0.18,0.1)
save('sfx_hero_down',reverb(x,1.6,0.35),0.85)
# revive / staggers up: breath in, small warm chord
x=buf(1.8); u=t(0.6); at(x,band(noise(0.6),400,2500)*np.sin(np.pi*u/0.6)**2*0.25,0)
u=t(1.2); at(x,sum(np.sin(2*np.pi*f*u) for f in (293.7,370,440))*np.minimum(1,u/0.15)*np.exp(-u/0.5)*0.12,0.45)
save('sfx_hero_revive',reverb(x,1.4,0.3),0.7)
# game over: water closes over, muffled, low D minor dissolving
x=buf(6.0); at(x,splash(1.0,80,4000)*0.8,0)
mu=lp(band(noise(4.5),40,300),0.04)*np.linspace(1,0,int(SR*4.5))*0.6; at(x,mu,0.6)
u=t(5.0); at(x,sum(np.sin(2*np.pi*f*u)*a for f,a in ((73.4,1),(87.3,0.7),(110,0.6),(146.8,0.3)))*np.minimum(1,u/1.0)*np.exp(-u/2.2)*0.18,0.8)
at(x,sigh(3.0,48)*0.35,1.5)
save('sfx_game_over',reverb(x,3.0,0.4),0.85)
m=json.load(open('audio.json'))
for k in ['hit_crit','hero_down','hero_revive','game_over']: m['sfx'][k]='sfx_'+k
m['notes']['downed']=("Levie's progression rules. Natural 20: sfx_hit_crit instead of sfx_hit. Hero hits 0 HP: sfx_hero_down. Revived by heal/potion or staggering up after a fight: sfx_hero_revive. "
 "All four down: stop music and loops, play sfx_game_over with Pixelartie's sinking screen, then silence until the button. Level up keeps sfx_level_up.")
json.dump(m,open('audio.json','w'),indent=1)
