# aliasing: a high note's energy that isn't on a harmonic (folded back) vs the harmonic energy, below 18 kHz
import numpy as np
from lib import *
def alias(a, f0):
    x=a.mean(0)[SR//10:SR//10+SR]; x=x-x.mean(); X=np.abs(np.fft.rfft(x*np.blackman(len(x))))**2; fr=np.fft.rfftfreq(len(x),1/SR)
    m=(fr<18000)&(fr>20); h=np.zeros_like(fr,bool)
    for k in range(1,int(18000/f0)+1): h|=np.abs(fr-k*f0)<6
    return 10*np.log10(X[m&~h].sum()/X[m&h].sum())
for midi in (48,72,84,96,108):
    f0=440*2**((midi-69)/12)
    v=vital(midi,1.3); print(f'note {midi} ({f0:.0f} Hz)  Vital saw: aliasing {alias(v,f0):6.1f} dB', end='')
    for w in ('Saw','Square','Pulse','Triangle'):
        o=ours(midi,1.3,{'o1w':w,'flt':'Off','o1p':.25}); print(f'   ours {w}: {alias(o,f0):6.1f} dB', end='')
    print()
