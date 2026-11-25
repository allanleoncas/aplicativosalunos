import cv2, json, random, subprocess, numpy as np, img2pdf, glob, os, sys
L=json.load(open('layouts.json'))['OMR2']
g=json.load(open('gerado.json'))['alunos']
def pos(q,j):
    B=L['bolhas']; b=B['blocos'][q//B['porBloco']]; return b['x0']+j*B['dx'], b['y0']+(q%B['porBloco'])*B['dy']
OX=(210-L['largura'])/2; OY=297-14-L['marcador']/2-L['altura']
def scan(img, rnd, dpi, girar180=False, escuro=False):
    h,w=img.shape[:2]; ang=rnd.uniform(-2.5,2.5)
    M=cv2.getRotationMatrix2D((w/2,h/2),ang,1.0); M[:,2]+=rnd.uniform(-15,15,2)
    out=cv2.warpAffine(img,M,(w,h),borderValue=(255,255,255))
    out=cv2.cvtColor(out,cv2.COLOR_BGR2GRAY)
    if escuro: out=np.clip(out*0.8+10,0,255)
    out=cv2.GaussianBlur(out.astype(np.uint8),(3,3),0.8)
    out=np.clip(out+rnd.normal(0,5,out.shape),0,255).astype(np.uint8)
    if dpi!=200: out=cv2.resize(out,None,fx=dpi/200,fy=dpi/200,interpolation=cv2.INTER_AREA)
    if girar180: out=cv2.rotate(out,cv2.ROTATE_180)
    return out
esperado={}; paginas={1:[],2:[]}
for k,al in enumerate(g):
    rnd=np.random.RandomState(k); r=random.Random(k)
    for pag in (1,2):
        p=2*k+pag
        subprocess.run(['pdftoppm','-png','-r','200','-f',str(p),'-l',str(p),'provas.pdf','pg'],check=True)
        f=sorted(glob.glob('pg-*.png'))[-1]; img=cv2.imread(f); os.remove(f)
        if pag==2:
            MM=200/25.4; marc=[]; st=[]
            for q,ch in enumerate(al['gabarito']):
                j='ABCDE'.index(ch) if r.random()<0.65 else r.randrange(5)
                if k==2 and q==3: marc.append(None); st.append('branco'); continue
                cor=(40,40,40) if k%2 else (140,60,20)
                x,y=pos(q,j); cv2.circle(img,(int((OX+x)*MM),int((OY+y)*MM)),int(L['bolhas']['raio']*MM*0.92),cor,-1,cv2.LINE_AA)
                if k==3 and q==5:
                    x,y=pos(q,(j+1)%5); cv2.circle(img,(int((OX+x)*MM),int((OY+y)*MM)),int(L['bolhas']['raio']*MM*0.92),cor,-1,cv2.LINE_AA)
                    marc.append(None); st.append('multipla'); continue
                marc.append('ABCDE'[j]); st.append('ok')
            esperado[al['codigo']]={'marc':marc,'st':st,'acertos':sum(m==c for m,c in zip(marc,al['gabarito']))}
        dpi=300 if k==1 else 150 if k==4 else 200
        out=scan(img,rnd,dpi,girar180=(k==6 and pag==2),escuro=(k==5))
        fn=f'scan_{p:02d}.jpg'; cv2.imwrite(fn,out,[cv2.IMWRITE_JPEG_QUALITY,70])
        paginas[1 if k<5 else 2].append(fn)
for i in (1,2):
    open(f'escaneado_{i}.pdf','wb').write(img2pdf.convert(paginas[i],layout_fun=img2pdf.get_layout_fun((img2pdf.mm_to_pt(210),img2pdf.mm_to_pt(297)))))
json.dump(esperado,open('esperado.json','w'),indent=0)
print({c:(''.join(m or '-' for m in e['marc']),e['acertos']) for c,e in esperado.items()})
