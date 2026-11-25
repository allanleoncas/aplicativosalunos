const fs=require('fs'), {PNG}=require('pngjs'), OMR=require('../omr.js');
const src=fs.readFileSync('../app.js','utf8');
const L=eval('('+src.slice(src.indexOf('const LAYOUTS = ')+16, src.indexOf('};\nconst MAXQ')+1)+')');
const casos=JSON.parse(fs.readFileSync(process.argv[2]));
let erros=0;
for(const c of casos){
  const png=PNG.sync.read(fs.readFileSync(c.arquivo));
  const r=OMR.analisar({data:png.data,width:png.width,height:png.height},L,{inverter:true});
  if(!r.ok){console.log('FALHA',c.arquivo,r.erro,r.qual??'');erros++;continue;}
  const lido=r.respostas.map(x=>x.status==='ok'?x.letra:x.status);
  const ok=lido.length===c.esperado.length && c.esperado.every((e,i)=>e.split('|').includes(lido[i]));
  if(!ok){erros++;console.log('ERRO',c.arquivo,c.esperado.map((e,i)=>e.split('|').includes(lido[i])?'':i+1+':'+e+'/'+lido[i]+' '+r.respostas[i].scores.join('/')).filter(Boolean).join('  '));}
}
console.log(casos.length,'fotos, erros',erros);
