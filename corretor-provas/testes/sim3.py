import cv2, json, random, subprocess, sys, glob, numpy as np
TAM=sys.argv[1]; NF=int(sys.argv[2]) if len(sys.argv)>2 else 30
L={"largura":180,"altura":126,"marcador":8,"bolhas":{"blocos":[{"x0":13,"y0":56},{"x0":57,"y0":56},{"x0":101,"y0":56},{"x0":145,"y0":56}],"porBloco":10,"dx":7.5,"dy":6.6,"raio":2.4}}
DPI=200; MM=DPI/25.4; OX=15; OY=24
def pos(q,j):
    B=L['bolhas']; b=B['blocos'][q//B['porBloco']]; return b['x0']+j*B['dx'], b['y0']+(q%B['porBloco'])*B['dy']
def px(x,y): return int((OX+x)*MM), int((OY+y)*MM)
def preencher(img,q,j,cor,estilo='cheio'):
    x,y=pos(q,j); r=L['bolhas']['raio']*MM; c=px(x,y)
    if estilo=='cheio': cv2.circle(img,c,int(r*0.95),cor,-1,cv2.LINE_AA)
    elif estilo=='parcial': cv2.ellipse(img,c,(int(r*0.85),int(r*0.6)),20,0,360,cor,-1)
    elif estilo=='x':
        d=int(r*0.9); cv2.line(img,(c[0]-d,c[1]-d),(c[0]+d,c[1]+d),cor,3); cv2.line(img,(c[0]-d,c[1]+d),(c[0]+d,c[1]-d),cor,3)
def foto(img, seed, modo):
    rnd=np.random.RandomState(seed)
    x0,y0=px(-12,-20); x1,y1=px(L['largura']+12,L['altura']+60)
    src=np.float32([[x0,y0],[x1,y0],[x1,y1],[x0,y1]]); j=(0.08 if modo else 0.04)*(x1-x0)
    dst=src+rnd.uniform(-j,j,src.shape).astype(np.float32); dst-=dst.min(0); dst+=30
    W,H=int(dst[:,0].max()+30),int(dst[:,1].max()+30)
    out=cv2.warpPerspective(img,cv2.getPerspectiveTransform(src,dst),(W,H),borderValue=(90,90,90))
    gx=np.linspace(rnd.uniform(0.55,0.85),1.05,out.shape[1]); gy=np.linspace(1.0,rnd.uniform(0.7,1.0),out.shape[0])
    out=np.clip(out*(gy[:,None,None]*gx[None,:,None]),0,255).astype(np.uint8)
    out=cv2.GaussianBlur(out,(5,5),1.1); out=np.clip(out+rnd.normal(0,6,out.shape),0,255).astype(np.uint8)
    s=1600/max(out.shape[:2]); out=cv2.resize(out,None,fx=s,fy=s,interpolation=cv2.INTER_AREA)
    if modo==1: out=cv2.rotate(out,cv2.ROTATE_90_CLOCKWISE)
    if modo==2: out=cv2.rotate(out,cv2.ROTATE_180)
    ok,buf=cv2.imencode('.jpg',out,[cv2.IMWRITE_JPEG_QUALITY,75]); return cv2.imdecode(buf,1)
g=json.load(open(f'gerado{TAM}.json'))['alunos']
npag=int([l for l in subprocess.run(['pdfinfo',f'sim{TAM}.pdf'],capture_output=True,text=True).stdout.splitlines() if l.startswith('Pages')][0].split()[1])
cart=[p for p in range(1,npag+1) if 'Preencha totalmente' in subprocess.run(['pdftotext','-f',str(p),'-l',str(p),f'sim{TAM}.pdf','-'],capture_output=True,text=True).stdout]
print('cartoes',cart)
bases={}
casos=[]
for k in range(NF):
    ai=k%len(g); al=g[ai]
    if ai not in bases:
        subprocess.run(['pdftoppm','-png','-r',str(DPI),'-f',str(cart[ai]),'-l',str(cart[ai]),f'sim{TAM}.pdf','cb'],check=True)
        f=sorted(glob.glob('cb-*.png'))[-1]; bases[ai]=cv2.imread(f); subprocess.run(['rm',f])
    img=bases[ai].copy(); r=random.Random(k); esp=[]
    for q,ch in enumerate(al['gabarito']):
        j='ABCDE'.index(ch) if r.random()<0.65 else r.randrange(5)
        t=r.random(); cor=(30,30,30) if t<0.4 else (150,70,25)
        if q==3 and k%4==1: esp.append('branco'); continue
        if q==20 and k%4==2: preencher(img,q,j,cor); preencher(img,q,(j+2)%5,cor); esp.append('multipla'); continue
        if q==30 and k%4==3: preencher(img,q,j,cor,'x'); esp.append('duvida|branco'); continue
        preencher(img,q,j,cor,'cheio' if t<0.85 else 'parcial'); esp.append('ABCDE'[j])
    if k<len(g): cv2.imwrite(f'pre_{al["codigo"]}.png',img)
    modo=0 if k%3==0 else (1 if k%3==1 else 2) if k%2 else 0
    out=foto(img,500+k,modo); fn=f'f3_{TAM}_{k:02d}.png'; cv2.imwrite(fn,out)
    casos.append({'arquivo':fn,'codigo':al['codigo'],'esperado':esp})
json.dump(casos,open(f'casos{TAM}.json','w'))
print(len(casos),'fotos')
