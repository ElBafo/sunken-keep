import json,sys,os
sys.argv=['x']; exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio.py')).read().split('# ---- SFX ----')[0])
def growl(d,f0,f1,rough,gain=1):
    tt=t(d); f=np.linspace(f0,f1,len(tt)); ph=2*np.pi*np.cumsum(f*(1+rough*np.sin(2*np.pi*23*tt)))/SR
    x=np.tanh(2.5*(np.sin(ph)+0.6*np.sin(2*ph)+0.3*np.sin(3.1*ph)))*np.sin(np.pi*tt/d)**0.7
    return x*gain+band(noise(d),150,1800)*np.sin(np.pi*tt/d)*0.3
def gloop(d,f0,f1):
    tt=t(d); ph=2*np.pi*np.cumsum(np.linspace(f0,f1,len(tt)))/SR
    return np.sin(ph)*env(len(tt),0.005,d/3)
def splash(d=0.5,lo=300,hi=6000):
    tt=t(d); return band(noise(d),lo,hi)*env(len(tt),0.004,d/5)
# slime
s_alert=mix(*[np.pad(gloop(0.12,f,f*2.2),(int(SR*k*0.11),0)) for k,f in enumerate((180,220,160))])
s_attack=mix(splash(0.35,200,2500),gloop(0.25,120,400)*0.8)
s_death=mix(gloop(0.6,400,60),splash(0.7,150,1800)*0.7)
# drowned dwarf: gurgling groans
d_alert=mix(growl(1.0,95,80,0.08),band(noise(1.0),300,900)*np.sin(np.pi*t(1.0))*0.3)
d_attack=mix(growl(0.45,140,90,0.15),splash(0.3,200,2500)*0.4)
d_death=mix(growl(1.4,90,45,0.12),splash(1.0,100,1500)*np.linspace(0,1,int(SR*1.0))*0.6)
# tide spawn: wet, alien, pitch-shifted sigh flavour
ts_alert=mix(growl(0.9,260,520,0.3,0.7),sigh(0.9,110)*0.6)
ts_attack=mix(growl(0.4,400,180,0.35),splash(0.4,800,7000)*0.6)
ts_death=mix(growl(1.3,300,60,0.4),sigh(1.6,70)*0.7)
for n,x in [('slime_alert',s_alert),('slime_attack',s_attack),('slime_death',s_death),
            ('drowned_dwarf_alert',d_alert),('drowned_dwarf_attack',d_attack),('drowned_dwarf_death',d_death),
            ('tide_spawn_alert',ts_alert),('tide_spawn_attack',ts_attack),('tide_spawn_death',ts_death)]:
    save('sfx_'+n,reverb(x,1.0,0.3),0.85)
# water steps and pickups
def wstep(deep):
    d=0.5 if deep else 0.3; x=splash(d,200 if deep else 500,4000 if deep else 7000)
    x=mix(x,gloop(0.15,300 if deep else 600,120 if deep else 250)*0.5)
    return reverb(x,0.8,0.3)
save('sfx_step_water_shallow',wstep(False),0.7); save('sfx_step_water_deep',wstep(True),0.8)
def chime(fs,g=0.3):
    out=np.zeros(int(SR*1.0))
    for i,f in enumerate(fs): tt=t(0.6); at(out,np.sin(2*np.pi*f*tt)*env(len(tt),0.002,0.15)*g,i*0.07)
    return reverb(out,1.0,0.3)
save('sfx_pickup',chime([880,1320,1760]),0.7)
save('sfx_potion',mix(gloop(0.3,500,1400),gloop(0.25,700,1600)*0.5),0.7)
creak=band(np.sin(2*np.pi*np.cumsum(140+40*np.sin(2*np.pi*5*t(0.8)))/SR)*np.sin(np.pi*t(0.8)/0.8),120,2000)
save('sfx_chest',reverb(mix(creak*0.6,np.pad(chime([660,990,1320],0.25),(int(SR*0.6),0))),1.0,0.3),0.8)
save('sfx_scroll',band(noise(0.45),1500,8000)*(0.5+0.5*np.sin(2*np.pi*14*t(0.45)))*np.sin(np.pi*t(0.45)/0.45),0.6)
m=json.load(open('audio.json'))
for k in ['slime','drowned_dwarf','tide_spawn']:
    for a in ['alert','attack','death']: m['sfx'][f'{k}_{a}']=f'sfx_{k}_{a}'
for k in ['step_water_shallow','step_water_deep','pickup','potion','chest','scroll']: m['sfx'][k]='sfx_'+k
m['notes']['monsters']="{monster}_alert when it notices the party, _attack when it strikes, _death on kill. Names match Pixelartie's sprite prefixes."
json.dump(m,open('audio.json','w'),indent=1); print('ok')
