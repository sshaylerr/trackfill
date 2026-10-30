from lib import *
def envl(a):
    from scipy.signal import hilbert; x=a.mean(0); X=np.fft.rfft(x); fr=np.fft.rfftfreq(len(x),1/SR); X[(fr<1200)|(fr>3200)]=0; x=np.fft.irfft(X,len(x)); e=np.abs(hilbert(x)); h=12; n=len(e)//h; return e[:n*h].reshape(n,h).mean(1)
q=lambda s: s**0.25
cases=[('A .5ms D 20ms S0',.0005,.02,0,.01),('A 5ms D 100ms S.5',.005,.1,.5,.05),('A 50ms D 300 S0',.05,.3,0,.05)]
for lab,A,D,S,R in cases:
    v=vital(96,.6,{'osc_1_wave_frame':0,'env_1_attack':q(A),'env_1_decay':q(D),'env_1_sustain':S,'env_1_release':q(R)},note_secs=.4)
    o=ours(96,.6,{'o1w':'Sine','o1l':.8,'flt':'Off','aa':A,'ad':D,'as':S,'ar':R,'ac':0,'ak':float(__import__('os').environ.get('AK','-.5'))})
    ev,eo=envl(v),envl(o); ev/=ev.max(); eo/=eo.max()
    ts=[.25,.5,1,2,3,5,10,20,40,80,160,300,410,450,500]
    print(lab); print('  ms    ',' '.join(f'{t:6}' for t in ts)); print('  vital ',' '.join(f'{ev[int(t*4)]:6.2f}' for t in ts)); print('  ours  ',' '.join(f'{eo[int(t*4)]:6.2f}' for t in ts))
