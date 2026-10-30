from lib import *
rms=lambda a: 20*np.log10(np.sqrt((a[:,SR//4:]**2).mean()))
corr=lambda a: np.corrcoef(a[0,SR//4:],a[1,SR//4:])[0,1]
print('vital (detune 2.2, spread default)')
for u in (1,3,7,16):
    v=vital(48,1.5,{'osc_1_unison_voices':u}); print(f'  uni {u:2}: rms {rms(v):6.1f}  L/R corr {corr(v):5.2f}')
print('ours (det .25, spr .6)')
for u in (1,3,7):
    o=ours(48,1.5,{'o1w':'Saw','o1l':.8,'flt':'Off','uni':u}); print(f'  uni {u:2}: rms {rms(o):6.1f}  L/R corr {corr(o):5.2f}')
