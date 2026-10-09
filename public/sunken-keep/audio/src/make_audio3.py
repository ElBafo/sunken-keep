import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
save('sfx_slime_hurt',reverb(mix(gloop(0.18,300,700),splash(0.2,300,3000)*0.5),0.6,0.3),0.8)
save('sfx_drowned_dwarf_hurt',reverb(mix(growl(0.3,150,110,0.2),splash(0.25,200,2000)*0.3),0.6,0.3),0.8)
save('sfx_tide_spawn_hurt',reverb(mix(growl(0.3,500,300,0.4,0.7),splash(0.25,800,6000)*0.4),0.6,0.3),0.8)
# tide spawn song: eerie wordless loop, seamless 8s
L=8; tt=t(L+1); x=np.zeros(len(tt))
notes=[(0,293.7),(2,277.2),(4,246.9),(6,261.6)]
for s,f in notes+[(8,293.7)]:
    d=2.6; u=t(d); vib=1+0.012*np.sin(2*np.pi*5.2*u)
    v=sum(np.sin(2*np.pi*np.cumsum(f*k*vib)/SR)*a for k,a in((1,1),(2,0.35),(3,0.15)))*np.sin(np.pi*u/d)**2*0.25
    at(x,v,s)
x+=band(noise(L+1),400,1400)*0.03
x=reverb(x,3,0.6); n=SR*L; y=x[:n].copy(); xf=SR; f_=np.linspace(0,1,xf); y[:xf]=y[:xf]*f_+x[n:n+xf]*(1-f_)
save('sfx_tide_spawn_song_loop',y,0.5)
m=json.load(open('audio.json'))
for k in ['slime','drowned_dwarf','tide_spawn']: m['sfx'][f'{k}_hurt']=f'sfx_{k}_hurt'
m['sfx']['tide_spawn_song_loop']='sfx_tide_spawn_song_loop'
m['notes']['tide_spawn_song_loop']="Loop quietly while a tide spawn is within ~3 squares, louder when closer. Goes with Ilsevar's 'It's singing' line."
json.dump(m,open('audio.json','w'),indent=1); print('ok')
