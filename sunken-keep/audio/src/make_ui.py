import json,os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'make_audio2.py')).read().split('# slime')[0])
def stone_click(f=180,g=1):
    u=t(0.12); return (band(noise(0.12),300,3500)*env(len(u),0.0005,0.012)+np.sin(2*np.pi*f*u)*env(len(u),0.001,0.03)*0.7)*g
def tick(f): u=t(0.15); return np.sin(2*np.pi*f*u)*env(len(u),0.001,0.04)
def whoosh(d=0.28): u=t(d); return band(noise(d),250,2000)*np.sin(np.pi*u/d)**2*0.5
S={'ui_button':stone_click(),
   'ui_button_denied':mix(stone_click(140),np.pad(stone_click(110,0.8),(int(SR*0.09),0))),
   'ui_menu_open':mix(whoosh(0.3),np.pad(tick(660)*0.4,(int(SR*0.18),0))),
   'ui_menu_close':mix(whoosh(0.25),tick(440)*0.35),
   'ui_turn':whoosh(0.22),
   'ui_inventory_move':mix(stone_click(220,0.6),np.pad(band(noise(0.15),800,5000)*env(int(SR*0.15),0.005,0.04)*0.3,(int(SR*0.03),0))),
   'ui_log_line':tick(880)*0.4}
m=json.load(open('audio.json'))
for k,x in S.items(): save('sfx_'+k,reverb(x,0.4,0.15),0.6); m['sfx'][k]='sfx_'+k
m['notes']['ui']="ui_button for any panel press (incl. attack before the hit sound), ui_button_denied for a hero who can't act yet, ui_turn on turning left/right, ui_log_line very quietly when a new log line appears."
json.dump(m,open('audio.json','w'),indent=1)
