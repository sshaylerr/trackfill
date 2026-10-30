# measure Vital's analog 12 dB filter (saw at C1 through it, divided by the dry saw) and fit Trackfill's clean filter (shape, resonance) to it
import vita, numpy as np, json
SR=48000; CUT=69  # A4 = 440 Hz
def harm(a, f0=32.703):
    x=a.mean(0)[SR//4:SR//4+SR]; X=np.abs(np.fft.rfft(x*np.hanning(len(x)))); fr=np.fft.rfftfreq(len(x),1/SR)
    ks=np.arange(1,400); idx=np.round(ks*f0*len(x)/SR).astype(int); return ks*f0, np.array([X[i-2:i+3].max() for i in idx])
def vital(blend,res,style=0,model=0):
    s=vita.Synth(); s.set_sample_rate(SR); s.load_init_preset(); c=s.get_controls()
    if blend is not None: c['filter_1_on'].set(1); c['filter_1_cutoff'].set(CUT); c['filter_1_blend'].set(blend); c['filter_1_resonance'].set(res); c['filter_1_style'].set(style); c['filter_1_model'].set(model)
    return harm(np.array(s.render(24,.8,1.6,1.6)))
f,dry=vital(None,0)
def ours(fr,shp,res,fc=440.0):
    s=1j*fr/fc; k=2-1.96*res; den=s*s+k*s+1; lp=1/den; bp=s/den; hp=s*s/den
    H= lp+(2*bp-lp)*shp*2 if shp<.5 else 2*bp*(1-(shp-.5)*2)+hp*(shp-.5)*2
    return np.abs(H)
w=(f<12000)
table={}
for blend in (0,.5,1,1.5,2):
    for res in (0,.25,.5,.78,1):
        _,wet=vital(blend,res); Hv=wet/dry; Hv/=np.median(Hv[(f>100)&(f<300)]) if blend<.3 else 1
        Hv=20*np.log10(Hv+1e-9); best=None
        for shp in np.linspace(0,1,41):
            for r2 in np.linspace(0,1,41):
                Ho=20*np.log10(ours(f,shp,r2)+1e-9)
                off=np.median((Hv-Ho)[w]); e=np.mean(np.abs(Hv-Ho-off)[w & (Hv>Hv.max()-40)])
                if best is None or e<best[0]: best=(e,shp,r2,off)
        table[f'{blend},{res}']=[round(best[1],3),round(best[2],3)]
        print(f'blend {blend:4} res {res:4}: ours shape {best[1]:.3f} res {best[2]:.3f}   avg error {best[0]:.1f} dB')
json.dump(table,open('filterfit.json','w'))
