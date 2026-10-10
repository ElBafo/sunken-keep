import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def ring(fs,dec,g):
    u=t(0.8); return sum(np.sin(2*np.pi*f*u)*a for f,a in fs)*env(len(u),0.001,dec)*g
def rustle(d,lo,hi,g): u=t(d); return band(noise(d),lo,hi)*np.sin(np.pi*u/d)*(0.6+0.4*np.sin(2*np.pi*20*u))*g
S={'equip_metal':mix(ring([(1180,1),(1870,0.5),(2950,0.3)],0.12,0.5),np.pad(ring([(990,1),(1560,0.5)],0.08,0.3),(int(SR*0.07),0)),rustle(0.15,1500,6000,0.2)),
   'equip_leather':mix(rustle(0.3,300,3000,0.6),np.pad(band(noise(0.04),200,1500)*env(int(SR*0.04),0.001,0.01)*0.6,(int(SR*0.22),0))),
   'equip_wood':mix(ring([(420,1),(690,0.5),(1130,0.2)],0.05,0.6),band(noise(0.06),300,2500)*env(int(SR*0.06),0.001,0.01)*0.5),
   'equip_cloth':rustle(0.35,800,7000,0.4),
   'item_use_fail':mix(band(noise(0.08),150,900)*env(int(SR*0.08),0.001,0.02)*0.7,np.sin(2*np.pi*110*t(0.15))*env(int(SR*0.15),0.002,0.05)*0.5),
   'inventory_open':mix(rustle(0.4,250,3500,0.5),np.pad(ring([(700,1),(1050,0.4)],0.06,0.2),(int(SR*0.25),0))),
   'inventory_close':rustle(0.25,250,3000,0.45)}
m=json.load(open('audio.json'))
for k,x in S.items(): save('sfx_'+k,reverb(x,0.5,0.15),0.6); m['sfx'][k]='sfx_'+k
m['notes']['inventory']="Equip sound by item material: metal (weapons, mail, helms), leather (armour, belts, pouches), wood (shields, staves, wands), cloth (robes, scrolls, trinkets). item_use_fail when an item is tapped on a target it can't be used on."
json.dump(m,open('audio.json','w'),indent=1)
files=sorted(f for f in os.listdir('.') if f.endswith(('.ogg','.mp3')))
json.dump({"files":files,"count":len(files)},open('manifest_audio.json','w'),indent=1); print(len(files))
