import numpy as np, vita, subprocess, json, os, wave, struct
SR=48000; HERE=os.path.dirname(os.path.abspath(__file__))
def vital(midi, secs, ctl={}, note_secs=None, vel=1.0):
    s=vita.Synth(); s.set_sample_rate(SR); s.set_bpm(120); s.load_init_preset(); c=s.get_controls()
    for k,v in ctl.items(): c[k].set(v)
    return np.array(s.render(midi, vel, note_secs or secs, secs))
def ours(midi, secs, p={}, eng='analog'):
    out=os.path.join(HERE,'_o.wav'); subprocess.run(['node',os.path.join(HERE,'ours.cjs'),out,str(midi),str(secs),json.dumps(p),eng],check=True)
    raw=open(out,'rb').read(); n=(len(raw)-44)//8; a=np.frombuffer(raw[44:44+n*8],dtype='<f4').reshape(-1,2).T; return a[:, :int(secs*SR)]
def db(x): return 20*np.log10(np.maximum(x,1e-12))
