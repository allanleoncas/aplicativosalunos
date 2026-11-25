/* SimulaPro (antigo Corretor de Provas) – lógica do aplicativo */
'use strict';
const LAYOUTS = {
  OMR1: {"versao":"OMR1","largura":170,"altura":130,"marcador":9,"qr":{"x":128,"y":8,"lado":32},
    "bolhas":{"x0":32,"dx":13,"y0":52,"dy":7.5,"raio":2.9,"letras":"ABCDE","max_questoes":10}},
  OMR2: {"versao":"OMR2","largura":180,"altura":64,"marcador":7,"qr":{"x":149,"y":9,"lado":25},
    "bolhas":{"blocos":[{"x0":22,"y0":33},{"x0":84,"y0":33}],"porBloco":5,"dx":9,"dy":6.5,"raio":2.5,"letras":"ABCDE","max_questoes":10}},
  // cartão-resposta do simulado ENADE: página inteira, até 40 objetivas em 4 colunas de 10
  OMR3: {"versao":"OMR3","largura":180,"altura":126,"marcador":8,"qr":{"x":146,"y":6,"lado":28},
    "bolhas":{"blocos":[{"x0":13,"y0":56},{"x0":57,"y0":56},{"x0":101,"y0":56},{"x0":145,"y0":56}],"porBloco":10,"dx":7.5,"dy":6.6,"raio":2.4,"letras":"ABCDE","max_questoes":40}}
};
const MAXQ = 10;
const MAXQ_FOLHA = 40; // maior folha (OMR3)

// =================== simulado ENADE ===================
// estrutura da prova do ENADE: Formação Geral (FG) e Componente Específico (CE), objetivas e discursivas.
// O professor escolhe a prova inteira (100%) ou metade (50%, proporcional em cada parte).
const ENADE_ESTR = {
  100: {FG: {o: 8, d: 2}, CE: {o: 27, d: 3}},
  50:  {FG: {o: 4, d: 1}, CE: {o: 13, d: 2}}
};
// pesos oficiais: nota geral = 25% FG + 75% CE; FG = 60% objetivas + 40% discursivas; CE = 85% objetivas + 15% discursivas
const ENADE_PESO = {FG: {parte: 0.25, o: 0.60, d: 0.40}, CE: {parte: 0.75, o: 0.85, d: 0.15}};
const NOME_PARTE = {FG: 'Formação Geral', CE: 'Componente Específico'};
const ehEnade = a => !!(a && a.modelo === 'enade');
const tamEnade = a => (a && +a.config.enade === 50) ? 50 : 100;
const parteQ = q => q.parte === 'FG' ? 'FG' : 'CE';
// quantas questões de cada tipo o simulado vai ter (limitado pelo banco)
function estruturaEnade(a){
  const E = ENADE_ESTR[tamEnade(a)], out = {};
  ['FG', 'CE'].forEach(p => {
    const bo = objetivas(a).filter(q => parteQ(q) === p).length, bd = discursivas(a).filter(q => parteQ(q) === p).length;
    out[p] = {o: Math.min(E[p].o, bo), d: Math.min(E[p].d, bd), pedidoO: E[p].o, pedidoD: E[p].d, bancoO: bo, bancoD: bd};
  });
  return out;
}
const VERSAO_APP = '20261125j'; // mude a cada publicação para o navegador não usar arquivos antigos
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
let DB_CHAVE = 'db'; // com login: 'db:<id do professor>' (cada professor tem seus dados no aparelho)
async function carregarDB(){
  try { const d = await IDB.get(DB_CHAVE); if(d && d.avaliacoes) db = d; } catch(e){ console.warn(e); }
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
  salvando = setTimeout(() => IDB.set(DB_CHAVE, db).catch(e => { console.error(e); toast('Não foi possível salvar neste navegador'); }), 150);
  if(typeof agendarSync === 'function') agendarSync();
}
const av = () => db.ativa ? db.avaliacoes[db.ativa] : null;
// provas geradas; a prova extra em branco só entra nas contas depois de corrigida
const alunosGerados = a => (a && a.gerado) ? a.gerado.alunos.filter(x => !x.extra || (a.resultados || {})[x.codigo]) : [];
const todosGerados = a => (a && a.gerado) ? a.gerado.alunos : [];
// provas impressas (inclui as sem nome do exame, mesmo antes de corrigidas)
const exameGerado = a => !!(a && a.gerado && a.gerado.semNome);
const totalProvas = a => exameGerado(a) ? a.gerado.alunos.length : alunosGerados(a).length;

function novoId(){
  const s = Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
  return 'A' + s;
}
function novaAvaliacao(){
  const a = {id: novoId(), curso: '', disciplina: '', professor: db.professor || '', titulo: 'Avaliação', chamada: '', data: '', valor_total: 8,
    config: {n: 8, nd: 0, vObj: 1, vDisc: 1, linhas: 6, embaralharQuestoes: true, frenteVerso: true, mostrarTema: false, semente: 1},
    cabecalho: null, banco: [], alunos: [], gerado: null, resultados: {}, criada: new Date().toISOString()};
  db.avaliacoes[a.id] = a; db.ativa = a.id; salvarDB(); return a;
}
function deGabaritoJSON(j){
  if(!j || !j.id || !Array.isArray(j.alunos) || !j.alunos.length) throw new Error('Arquivo sem lista de alunos.');
  j.alunos.forEach(a => {
    if(!a.codigo || !a.nome || !/^[A-E]+$/.test(a.gabarito || '')) throw new Error('Aluno inválido no arquivo: ' + (a.nome || a.codigo || '?'));
    if(a.gabarito.length > MAXQ_FOLHA) throw new Error('Máximo de ' + MAXQ_FOLHA + ' questões por folha.');
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

// tipos de questão: objetiva (A a E, lida pela câmera) e discursiva (D, nota lançada pelo professor)
const objetivas = a => (a.banco || []).filter(q => q.tipo !== 'D');
const discursivas = a => (a.banco || []).filter(q => q.tipo === 'D');
// valor de cada objetiva e de cada discursiva (definidos pelo professor; o total da prova é calculado)
const r2 = x => Math.round(x * 100) / 100;
function valores(a, al){
  if(ehEnade(a)){
    const E = estruturaEnade(a), nObj = al ? al.gabarito.length : E.FG.o + E.CE.o, nd = al ? (al.disc || []).length : E.FG.d + E.CE.d;
    return {vq: 0, vdq: 10, nObj, nd, totalObj: null, totalDisc: null, total: 100, enade: true};
  }
  const c = a.config, nObjB = objetivas(a).length, nDB = discursivas(a).length;
  const nObj = al ? al.gabarito.length : Math.min(+c.n, MAXQ, nObjB || MAXQ);
  const nd = al ? (al.disc || []).length : Math.min(+c.nd || 0, nDB || +c.nd || 0);
  let vq, vdq;
  if(c.vObj != null){ vq = +c.vObj || 0; vdq = +c.vDisc || 0; }
  else { // avaliações antigas: valor total dividido
    const total = +a.valor_total || 10, vd = nd ? Math.min(+c.valorDisc || 0, total) : 0;
    vq = nObj ? (total - vd) / nObj : 0; vdq = nd ? vd / nd : 0;
  }
  return {vq, vdq, nObj, nd, totalObj: r2(nObj * vq), totalDisc: r2(nd * vdq), total: r2(nObj * vq + nd * vdq)};
}
// passa avaliações antigas para valores por questão e mantém o total atualizado
function atualizarValores(a){
  if(!a || !a.config) return;
  if(ehEnade(a)){ a.valor_total = 100; return; }
  if(a.config.vObj == null && !(a.gerado && a.gerado.importado)){
    const V = valores(a); a.config.vObj = r2(V.vq); a.config.vDisc = r2(V.vdq || 1);
  }
  if(a.config.vObj != null && !isFinite(+a.config.vObj)) a.config.vObj = 1;
  if(a.config.vDisc != null && !isFinite(+a.config.vDisc)) a.config.vDisc = 1;
  if(a.config.vObj != null){ const al = (a.gerado && a.gerado.alunos[0]) || null, t = valores(a, al).total; if(isFinite(t)) a.valor_total = t; }
}
function sortear(a){
  if(ehEnade(a)) return sortearEnade(a);
  const banco = objetivas(a), n = Math.min(+a.config.n, banco.length, MAXQ);
  const bancoD = discursivas(a), nd = Math.min(+a.config.nd || 0, bancoD.length), usoD = {}; bancoD.forEach(q => usoD[q.id] = 0);
  let anteriorD = new Set();
  const r = rng(hash(a.id + ':' + a.config.semente));
  const temas = [...new Set(banco.map(q => q.tema || 'Geral'))];
  const porTema = {}; temas.forEach(t => porTema[t] = banco.filter(q => (q.tema || 'Geral') === t));
  const uso = {}; banco.forEach(q => uso[q.id] = 0);
  const assin = new Set(); let anterior = new Set();
  const T = temas.length, saida = [];
  // sempre uma prova extra em branco no final, para aluno que não está na lista
  // exame sem nome: só a quantidade de provas, todas em branco (o nome é digitado na correção)
  const sn = semNome(a);
  const lista = sn ? Array.from({length: qtdProvas(a)}, () => ({nome: 'ALUNO(A) NÃO LISTADO(A)', ra: '', cpf: '', extra: true, semNome: true}))
                   : a.alunos.concat([{nome: 'ALUNO(A) NÃO LISTADO(A)', ra: '', cpf: '', extra: true}]);
  lista.forEach((al, idx) => {
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
    const pad = lista.length >= 100 ? 3 : 2;
    const p = {codigo: 'P' + String(idx + 1).padStart(pad, '0'), nome: al.nome, ra: al.ra || '', cpf: al.cpf || '', gabarito, questoes};
    if(nd){
      const ds = bancoD.map(q => ({q, k: usoD[q.id] + (anteriorD.has(q.id) ? 0.7 : 0) + r() * 0.9})).sort((x, y) => x.k - y.k).slice(0, nd).map(o => o.q);
      ds.forEach(q => usoD[q.id]++); anteriorD = new Set(ds.map(q => q.id));
      p.disc = bancoD.filter(q => ds.includes(q)).map(q => q.id);
    }
    if(al.extra) p.extra = true;
    if(al.semNome) p.semNome = true;
    saida.push(p);
  });
  return {quando: new Date().toISOString(), layout: 'OMR2', alunos: saida, unicas: assin.size, ...(sn ? {semNome: true} : {})};
}
// sorteador de uma parte do banco (mesma regra das provas: cotas por tema, menos usadas, diferente do vizinho)
function sorteadorParte(banco, n, r){
  const temas = [...new Set(banco.map(q => q.tema || 'Geral'))], T = temas.length;
  const porTema = {}; temas.forEach(t => porTema[t] = banco.filter(q => (q.tema || 'Geral') === t));
  const uso = {}; banco.forEach(q => uso[q.id] = 0);
  const assin = new Set(); let anterior = new Set();
  return idx => {
    if(!n || !T) return [];
    const cota = {}; const base = Math.floor(n / T), extra = n - base * T;
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
      escolha = sel;
      if(!assin.has(sel.map(q => q.id).sort().join(','))) break;
    }
    assin.add(escolha.map(q => q.id).sort().join(','));
    escolha.forEach(q => uso[q.id]++);
    anterior = new Set(escolha.map(q => q.id));
    return escolha;
  };
}
// simulado ENADE: objetivas da Formação Geral primeiro (1 a 8), depois as do Componente Específico (9 a 35),
// como no ENADE; discursivas também FG primeiro. Cartão-resposta OMR3.
function sortearEnade(a){
  const E = estruturaEnade(a), r = rng(hash(a.id + ':enade:' + a.config.semente)), todas = objetivas(a);
  const sel = {}, selD = {};
  ['FG', 'CE'].forEach(p => {
    sel[p] = sorteadorParte(objetivas(a).filter(q => parteQ(q) === p), E[p].o, r);
    selD[p] = sorteadorParte(discursivas(a).filter(q => parteQ(q) === p), E[p].d, r);
  });
  const sn = semNome(a);
  const lista = sn ? Array.from({length: qtdProvas(a)}, () => ({nome: 'ALUNO(A) NÃO LISTADO(A)', ra: '', cpf: '', extra: true, semNome: true}))
                   : a.alunos.concat([{nome: 'ALUNO(A) NÃO LISTADO(A)', ra: '', cpf: '', extra: true}]);
  const pad = lista.length >= 100 ? 3 : 2, assin = new Set();
  const saida = lista.map((al, idx) => {
    let questoes = [], disc = [];
    ['FG', 'CE'].forEach(p => {
      const esc = sel[p](idx), ordem = a.config.embaralharQuestoes ? embaralhar(esc, r) : esc;
      ordem.forEach(q => questoes.push({qid: q.id, perm: embaralhar(q.alts.map((_, i) => i), r)}));
      disc = disc.concat(selD[p](idx).map(q => q.id));
    });
    assin.add(questoes.map(x => x.qid).sort().join(','));
    const gabarito = questoes.map(qq => LETRAS[qq.perm.indexOf(todas.find(q => q.id === qq.qid).correta)]).join('');
    const p = {codigo: 'P' + String(idx + 1).padStart(pad, '0'), nome: al.nome, ra: al.ra || '', cpf: al.cpf || '', gabarito, questoes,
      disc, nFG: E.FG.o, ndFG: E.FG.d};
    if(al.extra) p.extra = true;
    if(al.semNome) p.semNome = true;
    return p;
  });
  return {quando: new Date().toISOString(), layout: 'OMR3', enade: tamEnade(a), alunos: saida, unicas: assin.size, ...(sn ? {semNome: true} : {})};
}

// =================== importações ===================
let libsCarregadas = {};
function carregarScript(src){
  if(libsCarregadas[src]) return libsCarregadas[src];
  return libsCarregadas[src] = new Promise((ok, err) => { const s = document.createElement('script'); s.src = /^lib\//.test(src) ? src : src + '?v=' + VERSAO_APP; s.onload = ok; s.onerror = () => err(new Error('Falha ao carregar ' + src)); document.head.appendChild(s); });
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
  const cTipo = iCab < 0 ? -1 : linhas[iCab].map(norm).findIndex(c => ['tipo', 'tipo de questao', 'formato'].includes(c));
  if(iCab < 0) throw new Error('Não encontrei a coluna "Enunciado". Use a planilha modelo.');
  const cab = linhas[iCab].map(norm);
  const col = nomes => cab.findIndex(c => nomes.includes(c));
  const cTema = col(['tema', 'aula', 'assunto', 'unidade', 'conteudo']), cNivel = col(['nivel', 'dificuldade']), cEnun = col(['enunciado']);
  const cAlt = ['a', 'b', 'c', 'd', 'e'].map(l => col([l, 'alternativa ' + l, 'alt ' + l, '(' + l + ')']));
  const cCor = col(['correta', 'resposta', 'gabarito', 'resposta correta']), cCom = col(['comentario', 'justificativa', 'explicacao']);
  const cImg = col(['imagem', 'figura', 'arquivo da imagem', 'imagem (arquivo)', 'grafico']);
  // simulado ENADE: parte da prova (Formação Geral ou Componente Específico) e competência avaliada
  const cParte = col(['parte', 'componente', 'bloco', 'parte da prova', 'area']), cComp = col(['competencia', 'competencias', 'habilidade', 'competencia/habilidade', 'competencia/conteudo', 'competencia / conteudo']);
  const comParte = (q, l) => {
    const pv = norm(cParte < 0 ? '' : l[cParte]);
    if(pv) q.parte = /^(fg|formacao|geral)/.test(pv) ? 'FG' : 'CE';
    const cp = cComp < 0 ? '' : String(l[cComp] == null ? '' : l[cComp]).trim(); if(cp) q.comp = cp;
    return q;
  };
  const banco = [], erros = []; let nO = 0, nD = 0;
  for(let i = iCab + 1; i < linhas.length; i++){
    const l = linhas[i], v = c => c < 0 ? '' : String(l[c] == null ? '' : l[c]).trim();
    if(!v(cEnun) && cAlt.every(c => !v(c))) continue;
    const alts = cAlt.map(c => v(c)).filter((x, k, arr) => x || arr.slice(k).some(Boolean));
    while(alts.length && !alts[alts.length - 1]) alts.pop();
    const correta = LETRAS.indexOf(v(cCor).toUpperCase().replace(/[^A-E]/g, '').slice(0, 1));
    const linha = i + 1, imgNome = v(cImg);
    if(!v(cEnun)){ erros.push('Linha ' + linha + ': enunciado vazio.'); continue; }
    // discursiva: tipo "Discursiva" ou sem nenhuma alternativa
    if(/^disc|^dissert|^aberta/.test(norm(v(cTipo))) || !alts.length){
      banco.push(comParte(comImagem({id: 'D' + String(++nD).padStart(2, '0'), tipo: 'D', tema: v(cTema) || 'Geral', nivel: v(cNivel), enunciado: v(cEnun), alts: [], correta: -1, comentario: v(cCom)}, imgNome), l));
      continue;
    }
    if(alts.length < 2 || alts.some(x => !x)){ erros.push('Linha ' + linha + ': alternativas incompletas.'); continue; }
    if(correta < 0 || correta >= alts.length){ erros.push('Linha ' + linha + ': a coluna "Correta" deve ter uma letra entre A e ' + LETRAS[alts.length - 1] + '.'); continue; }
    banco.push(comParte(comImagem({id: 'Q' + String(++nO).padStart(3, '0'), tema: v(cTema) || 'Geral', nivel: v(cNivel), enunciado: v(cEnun), alts, correta, comentario: v(cCom)}, imgNome), l));
  }
  return {banco, erros};
}
// =================== imagens das questões ===================
// q.imgNome: nome do arquivo indicado na coluna "Imagem" da planilha; q.img: {dataUrl, tipo, w, h, nome} (fica no aparelho)
function comImagem(q, nome){ if(nome) q.imgNome = nome; return q; }
const nomeImg = s => norm(String(s || '').split(/[\\/]/).pop()).replace(/\.(png|jpe?g|gif|webp|bmp|svg|pdf|heic)$/i, '').replace(/\s+/g, ' ').trim();
const faltaImagem = a => (a.banco || []).filter(q => q.imgNome && !q.img);
// ao substituir o banco, mantém as imagens já enviadas das questões com o mesmo enunciado (e mesmo arquivo, se houver)
function manterImagens(antigo, novo){
  const porEnun = {}; (antigo || []).forEach(q => { if(q.img) porEnun[norm(q.enunciado)] = q.img; });
  let n = 0;
  novo.forEach(q => { const im = porEnun[norm(q.enunciado)]; if(im && (!q.imgNome || nomeImg(q.imgNome) === nomeImg(im.nome))){ q.img = im; n++; } });
  return n;
}
// liga cada arquivo à questão cuja coluna "Imagem" tem o mesmo nome (com ou sem extensão)
async function ligarImagens(a, arquivos){
  const ok = [], semUso = [];
  for(const f of arquivos){
    const alvo = a.banco.filter(q => q.imgNome && nomeImg(q.imgNome) === nomeImg(f.name));
    if(!alvo.length){ semUso.push(f.name); continue; }
    const im = await lerImagemQuestao(f);
    alvo.forEach(q => { q.img = im; ok.push(q.id); });
  }
  return {ok, semUso};
}
async function lerImagemQuestao(arquivo){
  const im = await lerCabecalho(arquivo, 1400, 350000, 1400);
  im.nome = arquivo.name; return im;
}
async function baixarModeloBanco(){
  await carregarScript('lib/xlsx.full.min.js');
  const wb = XLSX.utils.book_new();
  const q = [['Tipo', 'Tema', 'Nível', 'Enunciado', 'A', 'B', 'C', 'D', 'E', 'Correta', 'Comentário', 'Imagem'],
    ['Objetiva', 'Aula 1 – Conceitos básicos', 'Lembrar', 'Segundo Mankiw (2013), a economia estuda:', 'Como a sociedade administra seus recursos escassos.', 'Apenas o mercado financeiro.', 'Somente as decisões do governo.', 'A contabilidade das empresas.', 'A história do dinheiro.', 'A', 'Escassez é o problema central da economia.'],
    ['Objetiva', 'Aula 2 – Oferta e demanda', 'Compreender', 'Se o preço de um bem sobe, o que acontece com a quantidade demandada (lei da demanda)?', 'Aumenta.', 'Diminui.', 'Não se altera.', 'Fica igual à oferta.', '', 'B', 'Questões com 4 alternativas: deixe a coluna E vazia.'],
    ['Discursiva', 'Aula 1 – Conceitos básicos', 'Analisar', 'Mankiw (2013) afirma que "as pessoas enfrentam tradeoffs". Explique o conceito de custo de oportunidade e dê um exemplo da vida de um estudante universitário.', '', '', '', '', '', '', 'Resposta esperada: custo de oportunidade é aquilo de que se abre mão para obter algo; ex.: horas de estudo no lugar de trabalho remunerado.'],
    ['Discursiva', 'Aula 2 – Oferta e demanda', 'Aplicar', 'Com base na lei da oferta e da demanda (Mankiw, 2013), explique o que acontece com o preço e a quantidade de equilíbrio do café quando uma geada destrói parte da safra.', '', '', '', '', '', '', 'Resposta esperada: a oferta diminui (curva desloca para a esquerda), o preço de equilíbrio sobe e a quantidade cai.']];
  const ws = XLSX.utils.aoa_to_sheet(q);
  ws['!cols'] = [{wch: 11}, {wch: 26}, {wch: 12}, {wch: 60}, {wch: 34}, {wch: 34}, {wch: 34}, {wch: 34}, {wch: 34}, {wch: 9}, {wch: 40}, {wch: 22}];
  XLSX.utils.book_append_sheet(wb, ws, 'Questões');
  const instr = [['Como preencher o banco de questões'], [''],
    ['1. Uma questão por linha, a partir da linha 2. Não mude os nomes das colunas.'],
    ['2. Tema: aula, unidade ou assunto. O app equilibra as provas para cobrir todos os temas.'],
    ['3. Nível (opcional): Lembrar, Compreender, Aplicar, Analisar...'],
    ['4. A a E: alternativas. Para questões com 4 alternativas, deixe E vazia.'],
    ['5. Correta: a letra da alternativa certa (A, B, C, D ou E), como está na planilha. O app embaralha as alternativas em cada prova.'],
    ['6. Comentário (opcional): explicação da resposta, para uso do professor.'],
    ['7. Tipo: Objetiva ou Discursiva. Questão discursiva: deixe A a E e Correta vazias e escreva em Comentário a resposta esperada (sai no gabarito do professor).'],
    ['8. No app, escolha quantas objetivas e quantas discursivas cada prova terá e quanto valem as discursivas. As objetivas são corrigidas pela câmera; a nota das discursivas é lançada pelo professor na correção.'],
    ['9. Imagem (opcional): nome do arquivo da figura ou gráfico da questão (ex.: grafico_inflacao.png). Depois de enviar a planilha, toque em "Enviar imagens do banco" e selecione os arquivos: o app liga cada imagem à questão pelo nome. A imagem sai na prova logo abaixo do enunciado. Também é possível anexar a imagem direto na questão, em "Ver questões do banco".']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instr), 'Instruções');
  XLSX.writeFile(wb, 'modelo_banco_de_questoes.xlsx');
}
// planilha modelo do simulado ENADE: mesmas colunas + Parte (Formação Geral / Específico) e Competência
async function baixarModeloEnade(){
  await carregarScript('lib/xlsx.full.min.js');
  const wb = XLSX.utils.book_new();
  const q = [['Parte', 'Tipo', 'Tema', 'Competência', 'Nível', 'Enunciado', 'A', 'B', 'C', 'D', 'E', 'Correta', 'Comentário', 'Imagem'],
    ['Formação Geral', 'Objetiva', 'Ética e cidadania', 'Analisar situações-problema', 'Analisar', 'Para Bauman (2001), na "modernidade líquida" os vínculos sociais tornam-se frágeis e provisórios. Considerando esse conceito, uma consequência para a vida em comunidade é:', 'O enfraquecimento dos compromissos coletivos de longo prazo.', 'O fortalecimento das instituições tradicionais.', 'A eliminação do individualismo.', 'O aumento da estabilidade nas relações de trabalho.', 'A redução do consumo.', 'A', 'Bauman associa a liquidez à fragilidade dos laços e ao individualismo.'],
    ['Formação Geral', 'Discursiva', 'Sustentabilidade', 'Propor soluções', 'Criar', 'O Relatório Brundtland (ONU, 1987) define desenvolvimento sustentável como aquele que atende às necessidades do presente sem comprometer as gerações futuras. Proponha duas ações que um município pode adotar para conciliar crescimento econômico e preservação ambiental, justificando cada uma.', '', '', '', '', '', '', 'Resposta esperada: duas ações concretas (ex.: coleta seletiva com cooperativas; incentivo a energia solar) com justificativa econômica e ambiental.'],
    ['Específico', 'Objetiva', 'Microeconomia', 'Aplicar conceitos', 'Aplicar', 'Segundo Mankiw (2013), quando o preço de um bem com demanda elástica aumenta, a receita total do vendedor:', 'Diminui.', 'Aumenta.', 'Não se altera.', 'Dobra.', 'Fica igual ao custo.', 'A', 'Demanda elástica: a quantidade cai proporcionalmente mais que o aumento do preço.'],
    ['Específico', 'Discursiva', 'Macroeconomia', 'Interpretar dados', 'Analisar', 'Keynes (1936) defende que, em recessões, o gasto público pode estimular a demanda agregada. Explique esse mecanismo e cite um limite dessa política.', '', '', '', '', '', '', 'Resposta esperada: multiplicador de gastos aumenta renda e emprego; limite: endividamento público, inflação ou efeito deslocamento.']];
  const ws = XLSX.utils.aoa_to_sheet(q);
  ws['!cols'] = [{wch: 15}, {wch: 11}, {wch: 20}, {wch: 26}, {wch: 11}, {wch: 60}, {wch: 30}, {wch: 30}, {wch: 30}, {wch: 30}, {wch: 30}, {wch: 9}, {wch: 40}, {wch: 18}];
  XLSX.utils.book_append_sheet(wb, ws, 'Questões');
  const instr = [['Banco de questões do simulado ENADE'], [''],
    ['1. Uma questão por linha, a partir da linha 2. Não mude os nomes das colunas.'],
    ['2. Parte: "Formação Geral" ou "Específico" (Componente Específico). O simulado sorteia as questões de cada parte separadamente.'],
    ['3. Prova completa (100%): Formação Geral com 8 objetivas e 2 discursivas; Específico com 27 objetivas e 3 discursivas. Meia prova (50%): 4 + 1 e 13 + 2.'],
    ['4. Tenha no banco pelo menos essa quantidade em cada parte (mais questões = provas mais diferentes entre os alunos).'],
    ['5. Competência: o que a questão avalia (ex.: Analisar situações-problema). O relatório mostra o acerto da turma em cada competência. Se ficar vazia, o app usa o Tema.'],
    ['6. Tipo: Objetiva ou Discursiva. Discursiva: deixe A a E e Correta vazias e escreva a resposta esperada em Comentário.'],
    ['7. A a E: alternativas; Correta: a letra certa. O app embaralha as alternativas em cada prova.'],
    ['8. Nota de 0 a 100, com os pesos do ENADE: Formação Geral 25% (objetivas 60%, discursivas 40%) e Específico 75% (objetivas 85%, discursivas 15%). Cada discursiva recebe nota de 0 a 10 na correção.'],
    ['9. Imagem (opcional): nome do arquivo da figura; envie os arquivos depois em "Enviar imagens do banco".']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instr), 'Instruções');
  XLSX.writeFile(wb, 'modelo_banco_simulado_enade.xlsx');
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

// cabeçalho usado na prova: o próprio da avaliação (avaliações antigas), senão o da instituição (enviado uma vez,
// na página inicial, em db.cabecalhoInst); null = cabeçalho padrão UNIFADAP desenhado pelo app
function cabecalhoDe(a){ return (a && a.cabecalho) || db.cabecalhoInst || null; }

// cabeçalho: imagem ou PDF, recortando as margens brancas
async function lerCabecalho(arquivo, maxW = 2200, limPNG = 900000, maxH = Infinity){
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
  let cw = x1 - x0 + 1, ch = y1 - y0 + 1, esc = Math.min(1, maxW / cw, maxH / ch);
  const out = document.createElement('canvas'); out.width = Math.round(cw * esc); out.height = Math.round(ch * esc);
  const o = out.getContext('2d'); o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
  o.drawImage(canvas, x0, y0, cw, ch, 0, 0, out.width, out.height);
  let dataUrl = out.toDataURL('image/png'), tipo = 'PNG';
  if(dataUrl.length > limPNG){ dataUrl = out.toDataURL('image/jpeg', 0.88); tipo = 'JPEG'; }
  return {dataUrl, tipo, w: out.width, h: out.height};
}

// =================== notas ===================
function calcular(a, aluno, marcadas, disc){
  if(ehEnade(a)) return calcularEnade(a, aluno, marcadas, disc);
  const n = aluno.gabarito.length, V = valores(a, aluno);
  let ac = 0; for(let i = 0; i < n; i++) if(marcadas[i] && marcadas[i] === aluno.gabarito[i]) ac++;
  const notaObj = Math.round(ac * V.vq * 100) / 100;
  if(!V.nd) return {acertos: ac, n, nota: notaObj};
  disc = disc || [];
  let soma = 0, falta = 0;
  for(let k = 0; k < V.nd; k++){ const x = disc[k]; if(x == null || x === '' || isNaN(x)) falta++; else soma += Math.min(+x, V.vdq); }
  return {acertos: ac, n, notaObj, notaDisc: Math.round(soma * 100) / 100, faltaDisc: falta, nota: Math.round((notaObj + soma) * 100) / 100};
}

// simulado ENADE: nota de 0 a 100 com os pesos do ENADE; discursivas valem de 0 a 10 cada
function calcularEnade(a, aluno, marcadas, disc){
  const n = aluno.gabarito.length, nFG = aluno.nFG || 0, ndFG = aluno.ndFG || 0, nd = (aluno.disc || []).length;
  disc = disc || [];
  const ac = {FG: 0, CE: 0}, tot = {FG: nFG, CE: n - nFG};
  for(let i = 0; i < n; i++) if(marcadas[i] && marcadas[i] === aluno.gabarito[i]) ac[i < nFG ? 'FG' : 'CE']++;
  const dSoma = {FG: 0, CE: 0}, dN = {FG: 0, CE: 0}; let falta = 0;
  for(let k = 0; k < nd; k++){
    const p = k < ndFG ? 'FG' : 'CE', x = disc[k]; dN[p]++;
    if(x == null || x === '' || isNaN(x)) falta++; else dSoma[p] += Math.max(0, Math.min(+x, 10));
  }
  const parte = {}, contrib = {o: 0, d: 0};
  ['FG', 'CE'].forEach(p => {
    const W = ENADE_PESO[p], po = tot[p] ? 100 * ac[p] / tot[p] : null, pd = dN[p] ? 10 * dSoma[p] / dN[p] : null;
    // se a parte não tem discursivas (ou objetivas) no banco, o peso todo fica com o que existe
    let wo = W.o, wd = W.d; if(po == null){ wo = 0; wd = 1; } if(pd == null){ wo = 1; wd = 0; }
    parte[p] = (po == null && pd == null) ? null : wo * (po || 0) + wd * (pd || 0);
    contrib.o += W.parte * wo * (po || 0); contrib.d += W.parte * wd * (pd || 0);
  });
  let nota;
  if(parte.FG == null && parte.CE == null) nota = 0;
  else if(parte.FG == null) nota = parte.CE; else if(parte.CE == null) nota = parte.FG;
  else nota = ENADE_PESO.FG.parte * parte.FG + ENADE_PESO.CE.parte * parte.CE;
  const r1 = x => x == null ? null : Math.round(x * 10) / 10;
  const out = {acertos: ac.FG + ac.CE, n, nota: r1(nota), notaFG: r1(parte.FG), notaCE: r1(parte.CE), acFG: ac.FG, acCE: ac.CE, nFG: tot.FG, nCE: tot.CE};
  if(nd) Object.assign(out, {notaObj: r1(contrib.o), notaDisc: r1(contrib.d), faltaDisc: falta});
  return out;
}
// acerto por competência (ou tema) e por questão do banco, nas provas corrigidas
function analiseEnade(a){
  const banco = {}; (a.banco || []).forEach(q => banco[q.id] = q);
  const comp = {}, quest = {}, res = a.resultados || {};
  alunosGerados(a).forEach(al => {
    const r = res[al.codigo]; if(!r) return;
    al.questoes.forEach((qq, i) => {
      const q = banco[qq.qid]; if(!q) return;
      const certo = r.marcadas[i] && r.marcadas[i] === al.gabarito[i];
      const ch = (q.comp || q.tema || 'Geral'), k = parteQ(q) + '|' + ch;
      comp[k] = comp[k] || {parte: parteQ(q), nome: ch, certas: 0, total: 0}; comp[k].total++; if(certo) comp[k].certas++;
      quest[q.id] = quest[q.id] || {id: q.id, parte: parteQ(q), comp: ch, enunciado: q.enunciado, certas: 0, total: 0}; quest[q.id].total++; if(certo) quest[q.id].certas++;
    });
  });
  const pct = o => o.total ? 100 * o.certas / o.total : 0;
  return {
    competencias: Object.values(comp).sort((x, y) => x.parte.localeCompare(y.parte) || pct(x) - pct(y)).map(o => Object.assign(o, {pct: pct(o)})),
    questoes: Object.values(quest).map(o => Object.assign(o, {pct: pct(o)})).sort((x, y) => x.pct - y.pct || y.total - x.total)
  };
}

// =================== downloads ===================
function baixarBlob(blob, nome){
  const url = URL.createObjectURL(blob), aEl = document.createElement('a');
  aEl.href = url; aEl.download = nome; document.body.appendChild(aEl); aEl.click(); aEl.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const nomeArq = s => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'avaliacao';
async function pdfLibs(){ await carregarScript('lib/jspdf.umd.min.js'); await carregarScript('logo.js'); await carregarScript('lib/qrcode.js'); await carregarScript('pdfgen.js'); }
