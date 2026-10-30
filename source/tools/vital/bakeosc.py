# capture each oscillator's wavetable from Vital itself (spectral morph and distortion included): python3 bakeosc.py outdir file.vital...
import vita, json, sys, os, numpy as np
out=sys.argv[1]; os.makedirs(out,exist_ok=True)
SR=48000; N=2048; F=64; f0=SR/N; note=18; tune=12*np.log2(f0/440)+69-note   # one cycle = 2048 samples
FX=['chorus_on','compressor_on','delay_on','distortion_on','eq_on','flanger_on','phaser_on','reverb_on','filter_fx_on','filter_1_on','filter_2_on','sample_on']
for f in sys.argv[2:]:
    base=json.load(open(f)); name=os.path.basename(f)[:-6]
    for o in (1,2,3):
        s0=base['settings']
        if not s0.get('osc_%d_on'%o): continue
        d=json.loads(json.dumps(base)); s=d['settings']
        for k in FX: s[k]=0
        for k in (1,2,3): s['osc_%d_on'%k]=1 if k==o else 0
        # keep a cross-modulation source running silently? Vital needs it on; turn it on at level 0
        dt=s0.get('osc_%d_distortion_type'%o,0)
        moved=lambda dst: any(m.get('source') and m.get('destination')==dst for m in s0.get('modulations',[]))
        live=dt in (7,8,9,10,11,12) or moved('osc_%d_distortion_amount'%o)   # cross-mod and moving distortion stay live in Trackfill
        if live: s['osc_%d_distortion_amount'%o]=0.0 if dt in (7,8,9,10,11,12) else s0.get('osc_%d_distortion_amount'%o,0); s['osc_%d_distortion_type'%o]=0 if dt in (7,8,9,10,11,12) else dt
        if dt in (7,8,10,11):
            others=[k for k in (1,2,3) if k!=o]; srco=others[0 if dt in (7,10) else 1]; s['osc_%d_on'%srco]=1; s['osc_%d_level'%srco]=0.0
        s['osc_%d_level'%o]=1.0; s['osc_%d_destination'%o]=4; s['osc_%d_unison_voices'%o]=1; s['osc_%d_transpose'%o]=0; s['osc_%d_tune'%o]=tune
        s['osc_%d_random_phase'%o]=0.0; s['osc_%d_phase'%o]=0.0; s['osc_%d_stereo_spread'%o]=0.0
        s['env_1_attack']=0.0; s['env_1_sustain']=1.0; s['volume']=5473.0; s['voice_transpose']=0; s['portamento_time']=-10
        s['modulations']=[{'source':'','destination':''} for _ in s.get('modulations',[])]
        for i in range(1,65): s['modulation_%d_amount'%i]=0.0
        raw=np.zeros(F*N,dtype=np.float32)
        syn=vita.Synth(); syn.set_sample_rate(SR)
        for k in range(F):
            s['osc_%d_wave_frame'%o]=k*256/(F-1)
            tmp='/tmp/_bake.vital'; json.dump(d,open(tmp,'w')); syn.load_preset(tmp)
            a=np.array(syn.render(note,1.0,0.3,0.3)).mean(0)
            start=N*4; raw[k*N:(k+1)*N]=a[start:start+N]
        raw-=0
        raw.tofile(os.path.join(out,'%s_osc%d.f32'%(name,o)))
        print(name,'osc',o,'peak',round(float(np.abs(raw).max()),3))
