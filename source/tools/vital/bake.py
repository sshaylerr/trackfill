# fold macro modulations into the settings they move (macros are fixed knob positions): python3 bake.py outdir file.vital...
import vita, json, sys, os
out=sys.argv[1]; os.makedirs(out,exist_ok=True)
syn=vita.Synth(); info={}
def det(k):
    if k not in info:
        try: info[k]=syn.get_control_details(k)
        except Exception: info[k]=None
    return info[k]
for f in sys.argv[2:]:
    d=json.load(open(f)); s=d['settings']; mods=s.get('modulations',[]); folded=0
    for i,m in enumerate(mods):
        src=m.get('source',''); dst=m.get('destination','')
        if not src.startswith('macro_control_') or not dst: continue
        mv=s.get(src,0.0); amt=s.get('modulation_%d_amount'%(i+1),0.0); bip=s.get('modulation_%d_bipolar'%(i+1),0.0)
        x=(2*mv-1) if bip else mv
        dd=det(dst)
        if dd is None or dst not in s: continue
        lo,hi=dd.min,dd.max; v=s[dst]; n=(v-lo)/(hi-lo) if hi>lo else 0; n=min(1,max(0,n+amt*x)); s[dst]=lo+n*(hi-lo)
        if dd.is_discrete: s[dst]=round(s[dst])
        m['source']=''; m['destination']=''; folded+=1
    json.dump(d,open(os.path.join(out,os.path.basename(f)),'w'))
    print(os.path.basename(f),'folded',folded,'macro routes')
