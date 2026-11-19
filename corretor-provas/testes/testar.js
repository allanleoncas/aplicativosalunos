const fs=require('fs'), {PNG}=require('pngjs'), OMR=require('../omr.js');
const L=JSON.parse(fs.readFileSync('layouts.json'));
const casos=JSON.parse(fs.readFileSync('casos.json'));
let erros=0;
for(const c of casos){
  const png=PNG.sync.read(fs.readFileSync(c.arquivo));
  const r=OMR.analisar({data:png.data,width:png.width,height:png.height},L,{inverter:true});
  if(!r.ok){console.log('FALHA',c.arquivo,r.erro,r.qual??'');erros++;continue;}
  const lido=r.respostas.map(x=>x.status==='ok'?x.letra:x.status);
  const ok=c.esperado.every((e,i)=>e.split('|').includes(lido[i])||(e.includes('duvida')&&r.respostas[i].status==='duvida'));
  if(!ok)erros++;
  if(!ok)console.log('ERRO',c.arquivo,'lido',lido.join(','),'| esperado',c.esperado.join(','));
  if(!ok) console.log('   ',r.respostas.map(x=>x.scores.join('/')).join('  '));
}
console.log('erros',erros);
