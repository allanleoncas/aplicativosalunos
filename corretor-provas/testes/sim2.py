import cv2, json, random, subprocess, sys, glob, numpy as np
L=json.load(open('layouts.json'))['OMR2']; DPI=200; MM=DPI/25.4
OX=(210-L['largura'])/2; OY=297-14-L['marcador']/2-L['altura']
def pos(q,j):
    B=L['bolhas']; b=B['blocos'][q//B['porBloco']]; return b['x0']+j*B['dx'], b['y0']+(q%B['porBloco'])*B['dy']
def px(x,y): return int((OX+x)*MM), int((OY+y)*MM)
def preencher(img,q,j,cor):
    x,y=pos(q,j); r=L['bolhas']['raio']*MM; cv2.circle(img,px(x,y),int(r*0.95),cor,-1,cv2.LINE_AA)
def foto(img, seed, forte=False):
    rnd=np.random.RandomState(seed)
    x0,y0=px(-22,-60); x1,y1=px(L['largura']+12,L['altura']+10)   # pega parte das questões acima, como numa foto real
    src=np.float32([[x0,y0],[x1,y0],[x1,y1],[x0,y1]]); j=(0.09 if forte else 0.04)*(x1-x0)
    dst=src+rnd.uniform(-j,j,src.shape).astype(np.float32); dst-=dst.min(0); dst+=30
    W,H=int(dst[:,0].max()+30),int(dst[:,1].max()+30)
    out=cv2.warpPerspective(img,cv2.getPerspectiveTransform(src,dst),(W,H),borderValue=(90,90,90))
    gx=np.linspace(rnd.uniform(0.6,0.85),1.05,out.shape[1]); out=np.clip(out*gx[None,:,None],0,255).astype(np.uint8)
    out=cv2.GaussianBlur(out,(5,5),1.1); out=np.clip(out+rnd.normal(0,6,out.shape),0,255).astype(np.uint8)
    s=1600/max(out.shape[:2]); out=cv2.resize(out,None,fx=s,fy=s,interpolation=cv2.INTER_AREA)
    if forte: out=cv2.rotate(out,cv2.ROTATE_90_CLOCKWISE)
    ok,buf=cv2.imencode('.jpg',out,[cv2.IMWRITE_JPEG_QUALITY,75]); return cv2.imdecode(buf,1)
g=json.load(open('gerado.json')); fotos=[]; esperado={}
npag=int([l for l in subprocess.run(['pdfinfo','provas.pdf'],capture_output=True,text=True).stdout.splitlines() if l.startswith('Pages')][0].split()[1])
folhas=[p for p in range(1,npag+1) if 'Marque suas respostas na folha abaixo' in subprocess.run(['pdftotext','-f',str(p),'-l',str(p),'provas.pdf','-'],capture_output=True,text=True).stdout]
print('paginas',npag,'folhas',folhas)
for k,al in enumerate(g[:6]):
    subprocess.run(['pdftoppm','-png','-r','200','-f',str(folhas[k]),'-l',str(folhas[k]),'provas.pdf','fl'],check=True)
    f=sorted(glob.glob('fl-*.png'))[-1]; img=cv2.imread(f)
    r=random.Random(k); marc=[]
    for q,ch in enumerate(al['gabarito']):
        j='ABCDE'.index(ch) if r.random()<0.7 else r.randrange(5)
        preencher(img,q,j,(30,30,30) if k%2 else (150,70,25)); marc.append('ABCDE'[j])
    out=foto(img,100+k,forte=(k==5)); fn=f'foto_{al["codigo"]}.png'; cv2.imwrite(fn,out); fotos.append(fn)
    if k==0: cv2.imwrite('foto_exemplo.jpg',cv2.resize(out,None,fx=0.5,fy=0.5))
    ac=sum(m==c for m,c in zip(marc,al['gabarito'])); esperado[al['codigo']]=(''.join(marc),ac,ac*1.0)
    subprocess.run(['rm',f])
json.dump(esperado,open('esperado.json','w')); print(esperado); open('fotos.txt','w').write(' '.join(fotos))
