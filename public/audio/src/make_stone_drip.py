import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
m=json.load(open('audio.json'))
for i,(lo,hi) in enumerate([(300,2200),(400,2800)]):
    d=0.2; u=t(d); x=band(noise(d),lo,hi)*env(len(u),0.0003,0.008)+np.sin(2*np.pi*(260+80*i)*u)*env(len(u),0.0005,0.012)*0.4
    save(f'sfx_drip_stone_{i+1}',reverb(reverb(x,2.8,0.7),1.5,0.3),0.5); m['sfx'][f'drip_stone_{i+1}']=f'sfx_drip_stone_{i+1}'
m['notes']['drips']+=" Over dry stone (no ripple), use sfx_drip_stone_1..2 instead."
json.dump(m,open('audio.json','w'),indent=1)
