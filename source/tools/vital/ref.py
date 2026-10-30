# reference renders from Vital itself: python3 ref.py outdir preset.vital...
import vita, numpy as np, sys, os, wave, json
out=sys.argv[1]; os.makedirs(out, exist_ok=True)
SR=48000; BPM=174; bar=60/BPM*4
def save(path,a):
    a=np.clip(a,-1,1); w=wave.open(path,'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((a.T*32767).astype('<i2').tobytes()); w.close()
def bassfund(a):
    x=a.mean(0); X=np.abs(np.fft.rfft(x*np.hanning(len(x)))); fr=np.fft.rfftfreq(len(x),1/SR)
    m=(fr>25)&(fr<400); return fr[m][np.argmax(X[m])]
res={}
for f in sys.argv[2:]:
    s=vita.Synth(); s.set_sample_rate(SR); s.set_bpm(BPM); s.load_preset(f)
    name=os.path.basename(f)[:-6]
    # basses: pick the played note that puts the lowest strong partial nearest F1 (43.65 Hz)
    best=None
    for m in (41,53,65,77):
        a=np.array(s.render(m,.8,2*bar,2*bar+.6)); fq=bassfund(a)
        if np.abs(a).max()<1e-4: continue
        err=abs(np.log2(fq/43.65))
        if best is None or err<best[0]: best=(err,m,fq,a)
    err,m,fq,a=best
    save(os.path.join(out,name+'.wav'),a); res[name]={'note':m,'fund':round(float(fq),1),'peak':float(np.abs(a).max())}
    print(name,'note',m,'lowest strong partial',round(fq,1),'Hz','peak',round(float(np.abs(a).max()),3))
json.dump(res,open(os.path.join(out,'ref.json'),'w'),indent=1)
