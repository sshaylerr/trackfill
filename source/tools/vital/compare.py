# compare reference vs ours: python3 compare.py refdir ourdir name...  → prints band diffs and writes side-by-side spectrogram pngs
import numpy as np, wave, sys, os
from PIL import Image, ImageDraw
SR=48000
def load(p):
    w=wave.open(p); a=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2).T/32768; return a
EDGES=[25*2**(k/3) for k in range(0,31)]   # third octaves 25 Hz .. ~25 kHz
def stft(x,N=4096,hop=1024):
    w=np.hanning(N); fr=np.fft.rfftfreq(N,1/SR); frames=[]
    for i in range(0,len(x)-N,hop): frames.append(np.abs(np.fft.rfft(x[i:i+N]*w))**2)
    return np.array(frames),fr
def bands(S,fr): return np.array([[S[t][(fr>=EDGES[k])&(fr<EDGES[k+1])].sum() for k in range(len(EDGES)-1)] for t in range(len(S))])
GROUPS=[('sub <100',25,100),('low 100-300',100,300),('mid 300-1k',300,1000),('hi-mid 1-4k',1000,4000),('top >4k',4000,20000)]
def grp(S,fr,a,b): return S[:,(fr>=a)&(fr<b)].sum(1)
def db(x): return 10*np.log10(x+1e-12)
def spec_img(S,fr,w=700,h=260):
    # log-frequency spectrogram 25 Hz..16 kHz
    ys=np.geomspace(25,16000,h); idx=np.searchsorted(fr,ys).clip(0,len(fr)-1); Z=db(S[:,idx]).T[::-1]; Z=np.clip((Z-Z.max()+80)/80,0,1)
    im=Image.fromarray((np.stack([Z**.7*255,Z**1.5*200,Z**3*120],-1)).astype('uint8')).resize((w,h)); return im
rows=[]; names=sys.argv[3:]
for nm in names:
    a=load(os.path.join(sys.argv[1],nm+'.wav')); b=load(os.path.join(sys.argv[2],nm+'.wav')); n=min(a.shape[1],b.shape[1]); a=a[:,:n]; b=b[:,:n]
    Sa,fr=stft(a.mean(0)); Sb,_=stft(b.mean(0))
    # loudness-match ours to the reference over the whole clip so the comparison is about shape
    g=np.sqrt(Sa.sum()/max(Sb.sum(),1e-12)); Sb=Sb*g*g
    print(f'== {nm}   level difference (ours vs Vital) {db(1/(g*g)):+.1f} dB')
    for lab,lo,hi in GROUPS:
        ea,eb=grp(Sa,fr,lo,hi),grp(Sb,fr,lo,hi); tot=Sa.sum(1)
        share_a=100*ea.sum()/Sa.sum(); share_b=100*eb.sum()/Sb.sum()
        # movement: correlation of the band's envelope over time
        c=np.corrcoef(db(ea),db(eb))[0,1] if ea.std()>0 and eb.std()>0 else float('nan')
        print(f'   {lab:12s} Vital {share_a:5.1f}%  ours {share_b:5.1f}%   diff {db(eb.sum())-db(ea.sum()):+6.1f} dB   envelope match {c:+.2f}')
    ia,ib=spec_img(Sa,fr),spec_img(Sb,fr); im=Image.new('RGB',(ia.width,ia.height*2+40),'black'); im.paste(ia,(0,20)); im.paste(ib,(0,ia.height+40)); d=ImageDraw.Draw(im); d.text((4,4),nm+'  — Vital',fill='white'); d.text((4,ia.height+24),'Trackfill',fill='white'); rows.append(im)
W=rows[0].width; sheet=Image.new('RGB',(W*min(3,len(rows)),rows[0].height*((len(rows)+2)//3)),'black')
for i,r in enumerate(rows): sheet.paste(r,((i%3)*W,(i//3)*r.height))
sheet.save(os.path.join(sys.argv[2],'compare.png'))
