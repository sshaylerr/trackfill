from lib import *
L=lambda a: 20*np.log10(np.sqrt((a[:,SR//10:]**2).mean())+1e-9)
P=lambda a: 20*np.log10(np.abs(a).max()+1e-9)
print('filter      drive:  0      .5      1     (rms dB; peak dB at drive 1, res .7)')
for f in ('Off','Clean','Ladder','Diode','Screamer','Formant','Comb','Clean 24','Notch','Phaser'):
    r=[L(ours(36,.8,{'o1w':'Saw','o1l':.8,'flt':f,'cut':2000,'res':.3,'drv':d})) for d in (0,.5,1)]
    pk=P(ours(36,.8,{'o1w':'Saw','o1l':.8,'flt':f,'cut':500,'res':1,'drv':1}))
    print(f'{f:12}', ' '.join(f'{x:6.1f}' for x in r), f'   res1 peak {pk:5.1f}')
