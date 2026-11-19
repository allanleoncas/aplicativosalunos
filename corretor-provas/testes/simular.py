import cv2, numpy as np, json, sys, random
L=json.load(open('layout.json'))
DPI=200; MM=DPI/25.4
# posição do quadro na página (folha.py: topo_mm=60, centralizado em A4 210mm)
OX=(210-L['largura'])/2; OY=60
def mm2px(x,y): return ((OX+x)*MM,(OY+y)*MM)
def preencher(img, q, j, estilo='cheio', cor=(140,60,20)):
    b=L['bolhas']; x,y=mm2px(b['x0']+j*b['dx'], b['y0']+q*b['dy']); r=b['raio']*MM
    if estilo=='cheio': cv2.circle(img,(int(x),int(y)),int(r*0.95),cor,-1,cv2.LINE_AA)
    elif estilo=='parcial': cv2.ellipse(img,(int(x),int(y)),(int(r*0.85),int(r*0.6)),20,0,360,cor,-1)
    elif estilo=='x':
        d=int(r*0.9); cv2.line(img,(int(x-d),int(y-d)),(int(x+d),int(y+d)),cor,3); cv2.line(img,(int(x-d),int(y+d)),(int(x+d),int(y-d)),cor,3)
def foto(img, seed, forte=False):
    rnd=np.random.RandomState(seed); h,w=img.shape[:2]
    # recorta perto do quadro com margem
    x0,y0=mm2px(-25,-25); x1,y1=mm2px(L['largura']+25,L['altura']+25)
    src=np.float32([[x0,y0],[x1,y0],[x1,y1],[x0,y1]])
    j=(0.10 if forte else 0.05)*(x1-x0)
    dst=src+rnd.uniform(-j,j,src.shape).astype(np.float32)
    dst-=dst.min(0); dst+=40
    W,H=int(dst[:,0].max()+40),int(dst[:,1].max()+40)
    M=cv2.getPerspectiveTransform(src,dst)
    out=cv2.warpPerspective(img,M,(W,H),borderValue=(90,90,90))
    if forte and rnd.rand()<0.5: out=cv2.rotate(out, cv2.ROTATE_180)
    # iluminação irregular
    gx=np.linspace(rnd.uniform(0.55,0.8),1.05,out.shape[1]); gy=np.linspace(1.0,rnd.uniform(0.7,1.0),out.shape[0])
    out=np.clip(out*(gy[:,None,None]*gx[None,:,None]),0,255).astype(np.uint8)
    out=cv2.GaussianBlur(out,(5,5),1.2)
    out=np.clip(out+rnd.normal(0,6,out.shape),0,255).astype(np.uint8)
    # escala típica de câmera: 1600 px no lado maior
    s=1600/max(out.shape[:2]); out=cv2.resize(out,None,fx=s,fy=s,interpolation=cv2.INTER_AREA)
    ok,buf=cv2.imencode('.jpg',out,[cv2.IMWRITE_JPEG_QUALITY,75]); return cv2.imdecode(buf,1)
casos=[]
demo=json.load(open('demo.json'))
for pi,al in enumerate(demo['alunos']):
    for k in range(int(sys.argv[1]) if len(sys.argv)>1 else 4):
        img=cv2.imread(f'base-{pi+1}.png'); seed=pi*10+k; rnd=random.Random(seed)
        esperado=[]
        for q,ch in enumerate(al['gabarito']):
            jc='ABCDE'.index(ch); sorteio=rnd.random()
            if sorteio<0.65: j=jc
            else: j=rnd.randrange(5)
            tipo=rnd.random()
            if q==7 and k%4==1: esperado.append('branco'); continue
            if q==6 and k%4==2:
                preencher(img,q,j); preencher(img,q,(j+2)%5); esperado.append('multipla'); continue
            if q==5 and k%4==3:
                preencher(img,q,j,'x'); esperado.append('duvida|branco'); continue
            preencher(img,q,j,'cheio' if tipo<0.8 else 'parcial', (30,30,30) if tipo<0.4 else (150,70,25))
            esperado.append('ABCDE'[j])
        out=foto(img,seed,forte=(k%3==0))
        nome=f'teste_{al["codigo"]}_{k}.png'; cv2.imwrite(nome,out)
        casos.append({'arquivo':nome,'codigo':al['codigo'],'esperado':esperado})
json.dump(casos,open('casos.json','w'),indent=1)
print(len(casos),'fotos')
