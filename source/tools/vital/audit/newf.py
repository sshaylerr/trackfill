from fresp import *
def show(lab,f,H):
    pts=[50,100,200,300,400,440,500,660,880,1320,1760,3520,7000]
    print(f'{lab:24}', ' '.join(f'{H[np.argmin(abs(f-p))]:6.1f}' for p in pts))
print(' '*24, ' '.join(f'{p:6}' for p in [50,100,200,300,400,440,500,660,880,1320,1760,3520,7000]))
for r in (0,.5,1):
    show(f'v analog24 r{r}',*vresp(0,1,r)); show(f'o clean24 r{r}',*oresp('Clean 24',r))
for b,sh in ((1,.5),(2,1)):
    show(f'v an24 blend{b}',*vresp(0,1,.3,b)); show(f'o clean24 shp{sh}',*oresp('Clean 24',.3,sh))
for r,sh in ((0,0),(.5,0),(.5,.5),(.9,1)): show(f'o notch r{r} s{sh}',*oresp('Notch',r,sh))
show('v notchblend .5',*vresp(0,2,.3,1))
for r,sh in ((0,0),(.7,0),(.7,1)): show(f'o phaser r{r} s{sh}',*oresp('Phaser',r,sh))
show('v phaser r.5',*vresp(7,0,.5))
show('o clean drv1',*oresp('Clean',0,0,1)); show('o clean drv0',*oresp('Clean',0,0,0))
