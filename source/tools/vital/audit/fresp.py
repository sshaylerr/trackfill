import numpy as np, sys, json
from lib import *
F0=32.703; CUT=69; FC=440.0
def harm(a):
    x=a.mean(0)[SR//4:SR//4+SR]; X=np.abs(np.fft.rfft(x*np.hanning(len(x))))
    ks=np.arange(1,500); idx=np.round(ks*F0*len(x)/SR).astype(int); return ks*F0, np.array([X[i-2:i+3].max() for i in idx])
_dv=None; _do=None
def vresp(model,style,res,blend=0,drive=0):
    global _dv
    if _dv is None: _dv=harm(vital(24,1.6))[1]
    c={'filter_1_on':1,'filter_1_cutoff':CUT,'filter_1_blend':blend,'filter_1_resonance':res,'filter_1_style':style,'filter_1_model':model,'filter_1_drive':drive}
    f,w=harm(vital(24,1.6,c)); return f, 20*np.log10(w/_dv+1e-9)
def oresp(flt,res,shp=0,drv=0):
    global _do
    base={'o1w':'Saw','o1l':.5,'uni':1,'aa':.001,'as':1,'ar':.01,'key':0,'gan':-6}
    if _do is None: _do=harm(ours(24,1.6,dict(base,flt='Off')))[1]
    f,w=harm(ours(24,1.6,dict(base,flt=flt,cut=FC,res=res,shp=shp,drv=drv))); return f, 20*np.log10(w/_do+1e-9)
def summ(f,H):
    g=lambda lo,hi: np.median(H[(f>=lo)&(f<hi)])
    pk=H[(f>FC*.7)&(f<FC*1.4)].max()
    return f'pass {g(60,150):6.1f}  peak {pk:6.1f}  @2x {g(FC*1.9,FC*2.1):6.1f}  @4x {g(FC*3.8,FC*4.2):6.1f}  @8x {g(FC*7.5,FC*8.5):6.1f}'
if __name__=='__main__':
    for spec in sys.argv[1:]:
        kind,args=spec.split(':'); a=args.split(',')
        for res in (0,.5,.78,1):
            if kind=='v': f,H=vresp(int(a[0]),int(a[1]),res,float(a[2]) if len(a)>2 else 0)
            else: f,H=oresp(a[0],res,float(a[1]) if len(a)>1 else 0)
            print(f'{spec:18} res {res:4}: {summ(f,H)}')
