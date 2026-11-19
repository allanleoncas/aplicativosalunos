/* Corretor de Provas – lógica do aplicativo */
'use strict';
const LAYOUTS = {
  OMR1: {"versao":"OMR1","largura":170,"altura":130,"marcador":9,"qr":{"x":128,"y":8,"lado":32},
    "bolhas":{"x0":32,"dx":13,"y0":52,"dy":7.5,"raio":2.9,"letras":"ABCDE","max_questoes":10}},
  OMR2: {"versao":"OMR2","largura":180,"altura":64,"marcador":7,"qr":{"x":149,"y":9,"lado":25},
    "bolhas":{"blocos":[{"x0":22,"y0":33},{"x0":84,"y0":33}],"porBloco":5,"dx":9,"dy":6.5,"raio":2.5,"letras":"ABCDE","max_questoes":10}}
};
const MAXQ = 10;
const LETRAS = 'ABCDE';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = x => (x == null || isNaN(x)) ? '–' : (+x).toLocaleString('pt-BR', {maximumFractionDigits: 2});
const fmtData = iso => { if(!iso) return ''; const p = iso.split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; };

// =================== armazenamento (IndexedDB) ===================
const IDB = {
  abrir(){ return new Promise((ok, err) => { const r = indexedDB.open('corretorProvas', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); }); },
  async get(k){ const d = await this.abrir(); return new Promise((ok, err) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); }); },
  async set(k, v){ const d = await this.abrir(); return new Promise((ok, err) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = () => err(t.error); }); }
};
let db = {versao: 2, avaliacoes: {}, ativa: null};
async function carregarDB(){
  try { const d = await IDB.get('db'); if(d && d.avaliacoes) db = d; } catch(e){ console.warn(e); }
  // migra a versão 1 (localStorage)
  try {
    const v1 = JSON.parse(localStorage.getItem('corretorProvas:v1') || 'null');
    if(v1 && v1.provas){
      Object.values(v1.provas).forEach(p => { if(!db.avaliacoes[p.gab.id]){ const av = deGabaritoJSON(p.gab); av.resultados = p.resultados || {}; db.avaliacoes[av.id] = av; } });
      if(!db.ativa) db.ativa = v1.ativa; localStorage.removeItem('corretorProvas:v1'); salvarDB();
    }
  } catch(e){}
}
let salvando = null;
function salvarDB(){
  clearTimeout(salvando);
  salvando = setTimeout(() => IDB.set('db', db).catch(e => { console.error(e); toast('Não foi possível salvar neste navegador'); }), 150);
}
const av = () => db.ativa ? db.avaliacoes[db.ativa] : null;
const alunosGerados = a => (a && a.gerado) ? a.gerado.alunos : [];

function novoId(){
  const s = Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
  return 'A' + s;
}
function novaAvaliacao(){
  const a = {id: novoId(), curso: '', disciplina: '', professor: db.professor || '', titulo: 'Avaliação', chamada: '', data: '', valor_total: 10,
    config: {n: 8, embaralharQuestoes: true, frenteVerso: true, mostrarTema: false, semente: 1},
    cabecalho: null, banco: [], alunos: [], gerado: null, resultados: {}, criada: new Date().toISOString()};
  db.avaliacoes[a.id] = a; db.ativa = a.id; salvarDB(); return a;
}
function deGabaritoJSON(j){
  if(!j || !j.id || !Array.isArray(j.alunos) || !j.alunos.length) throw new Error('Arquivo sem lista de alunos.');
  j.alunos.forEach(a => {
    if(!a.codigo || !a.nome || !/^[A-E]+$/.test(a.gabarito || '')) throw new Error('Aluno inválido no arquivo: ' + (a.nome || a.codigo || '?'));
    if(a.gabarito.length > MAXQ) throw new Error('Máximo de ' + MAXQ + ' questões por folha.');
  });
  if(j.formato === 'corretor-provas-avaliacao') return j.avaliacao;
  return {id: j.id, curso: j.curso || '', disciplina: j.disciplina || '', titulo: j.prova || j.titulo || j.id, data: j.data || '',
    valor_total: j.valor_total || (j.valor_questao ? j.valor_questao * j.alunos[0].gabarito.length : 10),
    config: {n: j.alunos[0].gabarito.length, embaralharQuestoes: true, frenteVerso: true, semente: 1}, cabecalho: null, banco: [],
    alunos: j.alunos.map(a => ({nome: a.nome, ra: a.ra || ''})),
    gerado: {quando: new Date().toISOString(), importado: true, layout: 'OMR1', alunos: j.alunos.map(a => ({codigo: a.codigo, nome: a.nome, ra: a.ra || '', gabarito: a.gabarito, questoes: []}))},
    resultados: {}};
}

// =================== sorteio das provas ===================
function rng(seed){ let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hash(str){ let h = 2166136261; for(const c of str){ h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function embaralhar(arr, r){ const a = arr.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function combinacoes(n, k){ let c = 1; for(let i = 1; i <= k; i++){ c = c * (n - k + i) / i; if(c > 1e9) return c; } return Math.round(c); }

function sortear(a){
  const banco = a.banco, n = Math.min(+a.config.n, banco.length, MAXQ);
  const r = rng(hash(a.id + ':' + a.config.semente));
  const temas = [...new Set(banco.map(q => q.tema || 'Geral'))];
  const porTema = {}; temas.forEach(t => porTema[t] = banco.filter(q => (q.tema || 'Geral') === t));
  const uso = {}; banco.forEach(q => uso[q.id] = 0);
  const assin = new Set(); let anterior = new Set();
  const T = temas.length, saida = [];
  a.alunos.forEach((al, idx) => {
    // cotas por tema: todos os temas aparecem quando n >= nº de temas; o que sobra gira entre os alunos
    const cota = {}; temas.forEach(t => cota[t] = 0);
    const base = Math.floor(n / T), extra = n - base * T;
    temas.forEach(t => cota[t] = Math.min(base, porTema[t].length));
    for(let k = 0; k < extra; k++){ const t = temas[(idx * extra + k) % T]; if(cota[t] < porTema[t].length) cota[t]++; }
    let falta = n - Object.values(cota).reduce((s, x) => s + x, 0);
    for(let k = 0; falta > 0 && k < T * 10; k++){ const t = temas[(idx + k) % T]; if(cota[t] < porTema[t].length){ cota[t]++; falta--; } }
    let escolha = null;
    for(let tent = 0; tent < 40; tent++){
      const sel = [];
      temas.forEach(t => {
        const ordem = porTema[t].map(q => ({q, k: uso[q.id] + (anterior.has(q.id) ? 0.7 : 0) + r() * (0.9 + tent * 0.15)})).sort((x, y) => x.k - y.k);
        ordem.slice(0, cota[t]).forEach(o => sel.push(o.q));
      });
      const s = sel.map(q => q.id).sort().join(',');
      escolha = sel;
      if(!assin.has(s)) break;
    }
    assin.add(escolha.map(q => q.id).sort().join(','));
    escolha.forEach(q => uso[q.id]++);
    anterior = new Set(escolha.map(q => q.id));
    const ordem = a.config.embaralharQuestoes ? embaralhar(escolha, r) : escolha;
    const questoes = ordem.map(q => ({qid: q.id, perm: embaralhar(q.alts.map((_, i) => i), r)}));
    const gabarito = questoes.map(qq => LETRAS[qq.perm.indexOf(banco.find(q => q.id === qq.qid).correta)]).join('');
    const pad = a.alunos.length >= 100 ? 3 : 2;
    saida.push({codigo: 'P' + String(idx + 1).padStart(pad, '0'), nome: al.nome, ra: al.ra || '', cpf: al.cpf || '', gabarito, questoes});
  });
  return {quando: new Date().toISOString(), layout: 'OMR2', alunos: saida, unicas: assin.size};
}

// =================== importações ===================
let libsCarregadas = {};
function carregarScript(src){
  if(libsCarregadas[src]) return libsCarregadas[src];
  return libsCarregadas[src] = new Promise((ok, err) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => err(new Error('Falha ao carregar ' + src)); document.head.appendChild(s); });
}
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function lerPlanilha(arquivo){
  await carregarScript('lib/xlsx.full.min.js');
  const buf = await arquivo.arrayBuffer();
  let wb;
  if(/\.(csv|txt)$/i.test(arquivo.name)){
    // CSV: tenta UTF-8; se não for, lê como Windows-1252 (Excel antigo)
    let txt; try { txt = new TextDecoder('utf-8', {fatal: true}).decode(buf); } catch(e){ txt = new TextDecoder('windows-1252').decode(buf); }
    wb = XLSX.read(txt.replace(/^\uFEFF/, ''), {type: 'string'});
  } else wb = XLSX.read(buf, {type: 'array'});
  const nome = wb.SheetNames.find(n => /quest|banco/i.test(n)) || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[nome], {header: 1, defval: '', raw: false});
}
function interpretarBanco(linhas){
  const iCab = linhas.findIndex(l => l.some(c => norm(c) === 'enunciado'));
  if(iCab < 0) throw new Error('Não encontrei a coluna "Enunciado". Use a planilha modelo.');
  const cab = linhas[iCab].map(norm);
  const col = nomes => cab.findIndex(c => nomes.includes(c));
  const cTema = col(['tema', 'aula', 'assunto', 'unidade', 'conteudo']), cNivel = col(['nivel', 'dificuldade']), cEnun = col(['enunciado']);
  const cAlt = ['a', 'b', 'c', 'd', 'e'].map(l => col([l, 'alternativa ' + l, 'alt ' + l, '(' + l + ')']));
  const cCor = col(['correta', 'resposta', 'gabarito', 'resposta correta']), cCom = col(['comentario', 'justificativa', 'explicacao']);
  if(cAlt[0] < 0 || cAlt[1] < 0) throw new Error('Faltam as colunas das alternativas (A, B, C, D, E).');
  if(cCor < 0) throw new Error('Falta a coluna "Correta".');
  const banco = [], erros = [];
  for(let i = iCab + 1; i < linhas.length; i++){
    const l = linhas[i], v = c => c < 0 ? '' : String(l[c] == null ? '' : l[c]).trim();
    if(!v(cEnun) && cAlt.every(c => !v(c))) continue;
    const alts = cAlt.map(c => v(c)).filter((x, k, arr) => x || arr.slice(k).some(Boolean));
    while(alts.length && !alts[alts.length - 1]) alts.pop();
    const correta = LETRAS.indexOf(v(cCor).toUpperCase().replace(/[^A-E]/g, '').slice(0, 1));
    const linha = i + 1;
    if(!v(cEnun)){ erros.push('Linha ' + linha + ': enunciado vazio.'); continue; }
    if(alts.length < 2 || alts.some(x => !x)){ erros.push('Linha ' + linha + ': alternativas incompletas.'); continue; }
    if(correta < 0 || correta >= alts.length){ erros.push('Linha ' + linha + ': a coluna "Correta" deve ter uma letra entre A e ' + LETRAS[alts.length - 1] + '.'); continue; }
    banco.push({id: 'Q' + String(banco.length + 1).padStart(3, '0'), tema: v(cTema) || 'Geral', nivel: v(cNivel), enunciado: v(cEnun), alts, correta, comentario: v(cCom)});
  }
  return {banco, erros};
}
async function baixarModeloBanco(){
  await carregarScript('lib/xlsx.full.min.js');
  const wb = XLSX.utils.book_new();
  const q = [['Tema', 'Nível', 'Enunciado', 'A', 'B', 'C', 'D', 'E', 'Correta', 'Comentário'],
    ['Aula 1 – Conceitos básicos', 'Lembrar', 'Segundo Mankiw (2013), a economia estuda:', 'Como a sociedade administra seus recursos escassos.', 'Apenas o mercado financeiro.', 'Somente as decisões do governo.', 'A contabilidade das empresas.', 'A história do dinheiro.', 'A', 'Escassez é o problema central da economia.'],
    ['Aula 2 – Oferta e demanda', 'Compreender', 'Se o preço de um bem sobe, o que acontece com a quantidade demandada (lei da demanda)?', 'Aumenta.', 'Diminui.', 'Não se altera.', 'Fica igual à oferta.', '', 'B', 'Questões com 4 alternativas: deixe a coluna E vazia.']];
  const ws = XLSX.utils.aoa_to_sheet(q);
  ws['!cols'] = [{wch: 26}, {wch: 12}, {wch: 60}, {wch: 34}, {wch: 34}, {wch: 34}, {wch: 34}, {wch: 34}, {wch: 9}, {wch: 40}];
  XLSX.utils.book_append_sheet(wb, ws, 'Questões');
  const instr = [['Como preencher o banco de questões'], [''],
    ['1. Uma questão por linha, a partir da linha 2. Não mude os nomes das colunas.'],
    ['2. Tema: aula, unidade ou assunto. O app equilibra as provas para cobrir todos os temas.'],
    ['3. Nível (opcional): Lembrar, Compreender, Aplicar, Analisar...'],
    ['4. A a E: alternativas. Para questões com 4 alternativas, deixe E vazia.'],
    ['5. Correta: a letra da alternativa certa (A, B, C, D ou E), como está na planilha. O app embaralha as alternativas em cada prova.'],
    ['6. Comentário (opcional): explicação da resposta, para uso do professor.']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instr), 'Instruções');
  XLSX.writeFile(wb, 'modelo_banco_de_questoes.xlsx');
}
// CPF: guarda só os 3 primeiros números e os 2 dígitos finais (ex.: 123.***.***-45)
function mascararCPF(v){
  const s = String(v == null ? '' : v).trim(); if(!s) return '';
  if(s.includes('*')) return s;
  const d = s.replace(/\D/g, '').padStart(11, '0');
  return d.length === 11 ? d.slice(0, 3) + '.***.***-' + d.slice(9) : '';
}
const pareceCPF = v => /^[\d.\-\s]+$/.test(String(v).trim()) && String(v).replace(/\D/g, '').length === 11;
function interpretarAlunos(linhas){
  // aceita planilha (Nome, RA, CPF) ou lista colada (nome; RA e/ou CPF)
  let iCab = linhas.findIndex(l => l.some(c => /^(nome|aluno|aluna|estudante)/.test(norm(c))));
  let cNome = 0, cRA = -2, cCPF = -2;
  if(iCab >= 0){
    const cab = linhas[iCab].map(norm);
    cNome = cab.findIndex(c => /^(nome|aluno|aluna|estudante)/.test(c));
    cRA = cab.findIndex(c => /^(ra|matricula|registro|r\.a\.)/.test(c));
    cCPF = cab.findIndex(c => /^cpf/.test(c));
  }
  const out = [];
  linhas.slice(iCab + 1).forEach(l => {
    const nome = String(l[cNome] || '').trim().replace(/\s+/g, ' ');
    if(!nome || nome.length < 3) return;
    const outros = l.filter((c, k) => k !== cNome).map(c => String(c || '').trim()).filter(Boolean);
    let cpf = cCPF >= 0 ? String(l[cCPF] || '').trim() : (outros.find(pareceCPF) || '');
    let ra = cRA >= 0 ? String(l[cRA] || '').trim() : (outros.find(c => c !== cpf) || '');
    if(cRA >= 0 && cCPF < 0 && pareceCPF(ra) && !cpf) { cpf = ra; ra = ''; }
    if(ra === cpf) ra = '';
    out.push({nome, ra, cpf: mascararCPF(cpf)});
  });
  return out;
}
function linhasDeTexto(t){
  return t.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    if(l.includes('\t')) return l.split('\t');
    if(l.includes(';')) return l.split(';');
    const m = l.match(/^(.*?)[\s,–-]+(\d[\d.\-\/]*)$/);
    return m ? [m[1], m[2]] : [l];
  });
}

// cabeçalho: imagem ou PDF, recortando as margens brancas
async function lerCabecalho(arquivo){
  let canvas;
  if(/pdf$/i.test(arquivo.type) || /\.pdf$/i.test(arquivo.name)){
    await carregarScript('lib/pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({data: await arquivo.arrayBuffer()}).promise;
    const pg = await pdf.getPage(1), vp = pg.getViewport({scale: 3});
    canvas = document.createElement('canvas'); canvas.width = vp.width; canvas.height = vp.height;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({canvasContext: ctx, viewport: vp}).promise;
  } else {
    const url = URL.createObjectURL(arquivo), im = new Image();
    await new Promise((ok, err) => { im.onload = ok; im.onerror = () => err(new Error('Imagem inválida')); im.src = url; });
    canvas = document.createElement('canvas'); canvas.width = im.naturalWidth; canvas.height = im.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(im, 0, 0);
    URL.revokeObjectURL(url);
  }
  // recorte das margens brancas
  const ctx = canvas.getContext('2d'), {width: w, height: h} = canvas, d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
    const i = (y * w + x) * 4;
    if(d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235){ if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y; }
  }
  if(x1 < 0) throw new Error('O arquivo parece estar em branco.');
  const mg = Math.round(Math.max(w, h) * 0.004);
  x0 = Math.max(0, x0 - mg); y0 = Math.max(0, y0 - mg); x1 = Math.min(w - 1, x1 + mg); y1 = Math.min(h - 1, y1 + mg);
  let cw = x1 - x0 + 1, ch = y1 - y0 + 1, esc = Math.min(1, 2200 / cw);
  const out = document.createElement('canvas'); out.width = Math.round(cw * esc); out.height = Math.round(ch * esc);
  const o = out.getContext('2d'); o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
  o.drawImage(canvas, x0, y0, cw, ch, 0, 0, out.width, out.height);
  let dataUrl = out.toDataURL('image/png'), tipo = 'PNG';
  if(dataUrl.length > 900000){ dataUrl = out.toDataURL('image/jpeg', 0.9); tipo = 'JPEG'; }
  return {dataUrl, tipo, w: out.width, h: out.height};
}

// =================== notas ===================
function calcular(a, aluno, marcadas){
  const n = aluno.gabarito.length, vq = (+a.valor_total || 10) / n;
  let ac = 0; for(let i = 0; i < n; i++) if(marcadas[i] && marcadas[i] === aluno.gabarito[i]) ac++;
  return {acertos: ac, n, nota: Math.round(ac * vq * 100) / 100};
}

// =================== downloads ===================
function baixarBlob(blob, nome){
  const url = URL.createObjectURL(blob), aEl = document.createElement('a');
  aEl.href = url; aEl.download = nome; document.body.appendChild(aEl); aEl.click(); aEl.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const nomeArq = s => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'avaliacao';
async function pdfLibs(){ await carregarScript('lib/jspdf.umd.min.js'); await carregarScript('logo.js'); await carregarScript('lib/qrcode.js'); await carregarScript('pdfgen.js'); }
