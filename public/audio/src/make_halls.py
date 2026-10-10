import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
L=32; T=L+3; n=int(SR*L); amb=np.zeros(int(SR*T))
tt=t(T)
amb+=lp(noise(T),0.006)*0.9                                   # still, heavy air
lap=band(noise(T),120,900)*(0.5+0.5*np.sin(2*np.pi*tt/2.7))**3*(0.6+0.4*np.sin(2*np.pi*tt/7.1))
amb+=lap*0.25                                                  # slow lapping
amb+=np.sin(2*np.pi*41*tt)*0.05*(1+0.4*np.sin(2*np.pi*tt/11))  # deep drone
pass  # drips now separate sfx_drip_1..4, triggered with visuals
for _ in range(4):                                              # stone creaks / settling
    s=rng.uniform(1,L-3); d=rng.uniform(0.8,1.6); u=t(d)
    c=band(np.sin(2*np.pi*np.cumsum(rng.uniform(60,110)+15*np.sin(2*np.pi*2*u))/SR)+0.5*noise(d),40,500)*np.sin(np.pi*u/d)*0.35
    at(amb,c,s)
for _ in range(3):                                              # distant pebbles falling into water
    s=rng.uniform(0,L-1); at(amb,band(noise(0.25),300,2500)*env(int(SR*0.25),0.002,0.05)*0.15,s)
at(amb,sigh(4.5,46)*0.14,19)
amb=reverb(amb,3.5,0.55)
x=amb[:n].copy(); xf=SR*3; f_=np.linspace(0,1,xf); x[:xf]=x[:xf]*f_+amb[n:n+xf]*(1-f_)
save('amb_flooded_halls_loop',x,0.6,q=3)
m=json.load(open('audio.json'))
m['music']['amb_flooded_halls']={"file":"amb_flooded_halls_loop","loop":True,"length_s":L,"volume":0.5}
m['notes']['ambience']="amb_flooded_halls for all indoor floors; amb_swamp only for outdoor scenes (intro shot 5)."
json.dump(m,open('audio.json','w'),indent=1); print('ok')
