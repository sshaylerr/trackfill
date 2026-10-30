import vita, numpy as np, json
SR=48000; base=json.load(open('baked/TSP_VDBE_Bass_keyboardwobbler.vital'))
FX=['chorus_on','compressor_on','delay_on','distortion_on','eq_on','flanger_on','phaser_on','reverb_on','filter_fx_on','filter_1_on','filter_2_on','sample_on','osc_3_on']
def vharm(a):
    d=json.loads(json.dumps(base)); s=d['settings']
    for k in FX: s[k]=0
    s.update({'osc_1_on':1,'osc_1_wave_frame':0,'osc_1_transpose':0,'osc_1_tune':0,'osc_1_level':1,'osc_1_unison_voices':1,'osc_1_distortion_type':7,'osc_1_distortion_amount':a,'osc_1_spectral_morph_type':0,
      'osc_2_on':1,'osc_2_level':0,'osc_2_wave_frame':0,'osc_2_transpose':0,'osc_2_tune':0,'osc_2_unison_voices':1,'osc_2_distortion_type':0,'osc_2_spectral_morph_type':0,'env_1_attack':0,'env_1_sustain':1,'osc_1_destination':4})
    s['modulations']=[{'source':'','destination':''} for _ in s['modulations']]
    json.dump(d,open('/tmp/_fm.vital','w')); y=vita.Synth(); y.set_sample_rate(SR); y.load_preset('/tmp/_fm.vital')
    x=np.array(y.render(48,1,1.0,1.0)).mean(0)[SR//4:SR//4+SR//2]; X=np.abs(np.fft.rfft(x*np.hanning(len(x)))); f0=130.81
    return [X[int(round(k*f0*len(x)/SR))-2:int(round(k*f0*len(x)/SR))+3].max() for k in range(1,9)]
out={}
for a in (0,.05,.1,.2,.3,.5,.7,1.0):
    h=vharm(a); out[a]=[float(20*np.log10(v/max(h)+1e-9)) for v in h]; print('vital FM', a, [round(v,1) for v in out[a][:7]])
json.dump(out,open('fm_vital.json','w'))
