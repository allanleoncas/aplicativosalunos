/* SimulaPro – análises de desempenho
   1. acerto por questão (com alternativas escolhidas) e por tema
   2. acerto por competência (coluna "Competência" da planilha, guardada em q.comp)
   3. boletim individual do aluno
   4. evolução da turma/disciplina entre avaliações (e, depois, rodadas da trilha: registrarFonteEvolucao)
   5. painel do curso (todas as avaliações da conta, por curso e disciplina)
   Tudo é calculado na hora a partir de a.banco, a.gerado e a.resultados: nada novo é gravado. */
'use strict';

const NOTA_MIN = 6;          // nota de referência (de 0 a 10) no painel do curso
const MIN_DISCR = 10;        // alunos mínimos para comparar "melhores x piores" numa questão
const nota10Av = (a, nota) => { const t = +a.valor_total || 10; return t ? nota / t * 10 : 0; };
const pct = x => (x == null || isNaN(x)) ? '–' : Math.round(x * 100) + '%';
const faixa = p => p == null ? '' : p >= 0.7 ? 'ok' : p >= 0.5 ? 'warn' : 'bad';
const faixaTxt = p => p == null ? '' : p >= 0.7 ? 'Bom' : p >= 0.5 ? 'Atenção' : 'Revisar';
const media = l => l.length ? l.reduce((s, x) => s + x, 0) / l.length : null;
function chaveAluno(al){
  const ra = norm(al.ra || '').replace(/[^a-z0-9]/g, '');
  return ra ? 'ra:' + ra : 'n:' + norm(al.nome);
}
function acumula(m, k, cred){ if(!k) return; const o = m[k] = m[k] || {nome: k, n: 0, soma: 0}; o.n++; o.soma += cred; }
const listaAcum = m => Object.values(m).map(o => ({nome: o.nome, n: o.n, p: o.n ? o.soma / o.n : null}));

// =================== 1 e 2: análise de uma avaliação ===================
function analisarAv(a){
  const res = a.resultados || {}, banco = {}, ordem = {};
  (a.banco || []).forEach((q, i) => { banco[q.id] = q; ordem[q.id] = i; });
  const alunos = ((a.gerado && a.gerado.alunos) || []).filter(al => res[al.codigo]);
  const porQ = {}, porTema = {}, porComp = {}, saida = [];
  let semItens = 0;
  const enade = typeof ehEnade === 'function' && ehEnade(a);
  alunos.forEach(al => {
    const r = res[al.codigo], V = valores(a, al), itens = [];
    if(al.gabarito.length && !(al.questoes || []).length) semItens++;
    (al.questoes || []).forEach((qq, i) => {
      const q = banco[qq.qid], m = (r.marcadas || [])[i] || '', certa = al.gabarito[i], ok = m && m === certa ? 1 : 0;
      const li = m.length === 1 ? LETRAS.indexOf(m) : -1, alt = (li >= 0 && qq.perm) ? qq.perm[li] : null;
      itens.push({pos: i + 1, qid: qq.qid, tipo: 'O', tema: q ? q.tema || 'Geral' : '', comp: q ? q.comp || '' : '', marcada: m, certa, cred: ok});
      if(!q) return;
      const o = porQ[q.id] = porQ[q.id] || {q, tipo: 'O', n: 0, soma: 0, escolhas: Array(q.alts.length).fill(0), branco: 0, pares: []};
      o.n++; o.soma += ok; if(alt == null) o.branco++; else if(alt < o.escolhas.length) o.escolhas[alt]++;
      o.pares.push([r.nota, ok]);
    });
    (al.disc || []).forEach((qid, k) => {
      const x = r.disc ? r.disc[k] : null; if(x == null || x === '' || isNaN(x)) return;
      const q = banco[qid], vd = enade ? 10 : V.vdq, cred = vd ? Math.max(0, Math.min(1, +x / vd)) : 0;
      itens.push({pos: al.gabarito.length + k + 1, qid, tipo: 'D', tema: q ? q.tema || 'Geral' : '', comp: q ? q.comp || '' : '', nota: +x, valor: vd, cred});
      if(!q) return;
      const o = porQ[qid] = porQ[qid] || {q, tipo: 'D', n: 0, soma: 0, pares: []};
      o.n++; o.soma += cred; o.pares.push([r.nota, cred]);
    });
    itens.forEach(it => { if(it.tema) acumula(porTema, it.tema, it.cred); acumula(porComp, it.comp, it.cred); });
    saida.push({al, r, itens, nota10: nota10Av(a, r.nota)});
  });
  // melhores x piores (27% de cada lado): uma questão boa é mais acertada por quem foi bem na prova
  const notas = saida.map(s => s.r.nota).sort((x, y) => x - y), k27 = Math.max(1, Math.floor(notas.length * 0.27));
  const corteBaixo = notas[k27 - 1], corteAlto = notas[notas.length - k27];
  const questoes = Object.values(porQ).map(o => {
    const p = o.n ? o.soma / o.n : null, alertas = [];
    let discr = null;
    if(o.n >= MIN_DISCR && corteAlto > corteBaixo){
      const alto = o.pares.filter(x => x[0] >= corteAlto).map(x => x[1]), baixo = o.pares.filter(x => x[0] <= corteBaixo).map(x => x[1]);
      if(alto.length >= 3 && baixo.length >= 3) discr = media(alto) - media(baixo);
    }
    if(o.tipo === 'O'){
      const cor = o.q.correta, certas = o.escolhas[cor] || 0;
      const rival = o.escolhas.map((c, i) => ({c, i})).filter(x => x.i !== cor).sort((x, y) => y.c - x.c)[0];
      if(rival && rival.c > certas && rival.c >= 2) alertas.push({forte: true, t: 'a alternativa ' + LETRAS[rival.i] + ' (da planilha) foi mais marcada que a correta: confira o gabarito e o enunciado'});
      else if(rival && o.n >= 5 && rival.c / o.n >= 0.35) alertas.push({t: 'a alternativa ' + LETRAS[rival.i] + ' (da planilha) atraiu ' + pct(rival.c / o.n) + ' da turma'});
    }
    if(discr != null && discr < 0) alertas.push({forte: true, t: 'quem foi melhor na prova errou mais esta questão: confira'});
    else if(discr != null && discr < 0.15) alertas.push({t: 'separa pouco quem estudou de quem não estudou'});
    if(o.n >= 5 && p != null && p < 0.3) alertas.push({forte: true, t: 'muito difícil para a turma (' + pct(p) + ' de acerto)'});
    else if(o.n >= 5 && p != null && p >= 0.95) alertas.push({t: 'muito fácil (' + pct(p) + ' de acerto)'});
    return {q: o.q, tipo: o.tipo, n: o.n, p, escolhas: o.escolhas, branco: o.branco, discr, alertas};
  }).sort((x, y) => ordem[x.q.id] - ordem[y.q.id]);
  const temas = listaAcum(porTema).sort((x, y) => x.p - y.p), comps = listaAcum(porComp).sort((x, y) => x.p - y.p);
  const todas = saida.flatMap(s => s.itens.map(i => i.cred));
  return {alunos: saida, questoes, temas, comps, n: saida.length, media10: media(saida.map(s => s.nota10)), mediaNota: media(saida.map(s => s.r.nota)),
    acerto: media(todas), semItens, alertas: questoes.filter(q => q.alertas.length).length};
}
// desempenho de um aluno por tema e competência, comparado com a turma
function boletimDe(A, s){
  const t = {}, c = {}; s.itens.forEach(i => { acumula(t, i.tema, i.cred); acumula(c, i.comp, i.cred); });
  const turmaT = {}, turmaC = {}; A.temas.forEach(x => turmaT[x.nome] = x.p); A.comps.forEach(x => turmaC[x.nome] = x.p);
  const lista = (m, tm) => Object.values(m).map(o => ({nome: o.nome, n: o.n, acertos: o.soma, p: o.soma / o.n, turma: tm[o.nome]})).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
  const temas = lista(t, turmaT), comps = lista(c, turmaC);
  return {temas, comps, revisar: temas.concat(comps).filter(x => x.p < 0.7).sort((x, y) => x.p - y.p)};
}

// =================== tela: cartão na aba Turma ===================
let analiseAberta = false;
function barraP(p, rot, extra){
  return '<div class="anl-linha"><div class="anl-rot"><span>' + esc(rot) + '</span><b class="anl-' + faixa(p) + '">' + pct(p) + '</b></div>' +
    '<div class="anl-barra"><i class="anl-' + faixa(p) + '" style="width:' + Math.round((p || 0) * 100) + '%"></i></div>' + (extra || '') + '</div>';
}
function blocoAnalise(a){
  const A = analisarAv(a);
  if(!A.n) return '';
  let h = '<div class="card"><h2>Análise da prova</h2>' +
    '<div class="row anl-kpis"><div class="kpi"><span class="lbl">Média</span><b>' + fmt(A.mediaNota) + '<span class="lbl"> / ' + fmt(+a.valor_total || 10) + '</span></b></div>' +
    '<div class="kpi"><span class="lbl">Acerto geral</span><b>' + pct(A.acerto) + '</b></div>' +
    '<div class="kpi"><span class="lbl">Questões em alerta</span><b' + (A.alertas ? ' class="anl-warn"' : '') + '>' + A.alertas + '</b></div></div>';
  if(A.semItens) h += '<p class="lbl" style="margin-top:8px">Esta avaliação foi importada só com gabaritos: não há como saber o tema de cada questão.</p>';
  if(A.temas.length) h += '<h3 class="anl-sub">Acerto por tema</h3>' + A.temas.map(t => barraP(t.p, t.nome)).join('');
  if(A.comps.length) h += '<h3 class="anl-sub">Acerto por competência</h3>' + A.comps.map(t => barraP(t.p, t.nome)).join('');
  else if(A.questoes.length) h += '<p class="lbl" style="margin-top:10px">Dica: preencha a coluna <b>Competência</b> na planilha do banco para ver o acerto por competência.</p>';
  if(A.questoes.length){
    h += '<details style="margin-top:12px"' + (analiseAberta ? ' open' : '') + ' ontoggle="analiseAberta=this.open"><summary><b>Acerto por questão do banco</b> <span class="lbl">(' + A.questoes.length + ')</span></summary><div class="anl-qs">';
    A.questoes.forEach(x => {
      const esc2 = x.tipo === 'O' ? '<div class="anl-alts">' + x.escolhas.map((c, i) => '<span class="' + (i === x.q.correta ? 'anl-certa' : '') + '">' + LETRAS[i] + ' ' + c + '</span>').join('') +
        (x.branco ? '<span>em branco ' + x.branco + '</span>' : '') + '</div>' : '<div class="lbl">Discursiva · média de ' + pct(x.p) + ' do valor</div>';
      h += '<div class="anl-q"><div class="anl-rot"><span><b>' + esc(x.q.id) + '</b> · ' + esc(x.q.tema || '') + (x.q.comp ? ' · ' + esc(x.q.comp) : '') + '</span><b class="anl-' + faixa(x.p) + '">' + pct(x.p) + '</b></div>' +
        '<div class="lbl anl-enun">' + esc(String(x.q.enunciado).slice(0, 140)) + (String(x.q.enunciado).length > 140 ? '…' : '') + '</div>' + esc2 +
        x.alertas.map(al => '<div class="pill ' + (al.forte ? 'bad' : 'warn') + ' anl-pill">' + esc(al.t) + '</div>').join('') + '</div>';
    });
    h += '<p class="lbl" style="margin-top:6px">As letras são as da planilha (antes do embaralhamento). A correta está destacada.</p></div></details>';
  }
  h += '<div class="stack" style="margin-top:12px"><button class="btn sec" onclick="baixarAnalise()">Análise da prova (PDF)</button>' +
       (ehEnade(a) ? '' : '<button class="btn sec" onclick="baixarBoletinsAlunos()">Boletins dos alunos (PDF, um por página)</button>') + '</div></div>';
  return h;
}
async function pdfAnaliseLibs(){ await pdfLibs(); await carregarScript('pdfanalise.js'); }
function baixarAnalise(){
  const a = av(); if(!a) return;
  comProgresso('Gerando a análise…', async () => { await pdfAnaliseLibs(); baixarBlob(PDFANL.gerarAnaliseProva(a, analisarAv(a)).output('blob'), 'analise_' + nomeArq(a.disciplina + '_' + a.titulo) + '.pdf'); });
}
function baixarBoletinsAlunos(codigo){
  const a = av(); if(!a) return;
  comProgresso('Gerando os boletins…', async () => {
    await pdfAnaliseLibs(); const A = analisarAv(a);
    const lista = A.alunos.filter(s => !codigo || s.al.codigo === codigo).sort((x, y) => x.al.nome.localeCompare(y.al.nome, 'pt-BR'));
    if(!lista.length) return toast('Nenhuma prova corrigida ainda');
    const nome = codigo ? 'boletim_' + nomeArq(lista[0].al.nome) : 'boletins_' + nomeArq(a.disciplina + '_' + a.titulo);
    baixarBlob(PDFANL.gerarBoletimAluno(a, A, lista).output('blob'), nome + '.pdf');
  });
}

// =================== 4 e 5: dados de todas as avaliações ===================
// outras partes do app (ex.: trilha quinzenal) podem acrescentar pontos à evolução:
// registrarFonteEvolucao(() => [{id, tipo: 'Rodada', titulo, data, curso, disciplina, turmaId, media10, n,
//   temas: [{nome, n, p}], comps: [{nome, n, p}], alunos: [{chave, nome, ra, nota10}]}])
const fontesEvolucao = [];
function registrarFonteEvolucao(fn){ fontesEvolucao.push(fn); }
function pontosAvaliacoes(){
  const pts = [];
  Object.values(db.avaliacoes).forEach(a => {
    if(!a.gerado || !Object.keys(a.resultados || {}).length) return;
    const A = analisarAv(a); if(!A.n) return;
    pts.push({id: a.id, tipo: 'Avaliação', titulo: [a.titulo, a.chamada].filter(Boolean).join(' · ') || 'Avaliação', data: a.data || (a.gerado.quando || '').slice(0, 10),
      curso: a.curso || 'Sem curso', disciplina: a.disciplina || 'Sem disciplina', turmaId: a.turmaId || '', media10: A.media10, n: A.n, acerto: A.acerto,
      temas: A.temas, comps: A.comps,
      alunos: A.alunos.filter(s => s.al.nome && s.al.nome !== 'ALUNO(A) NÃO LISTADO(A)').map(s => ({chave: chaveAluno(s.al), nome: s.al.nome, ra: s.al.ra || '', nota10: s.nota10}))});
  });
  fontesEvolucao.forEach(fn => { try { (fn() || []).forEach(p => pts.push(p)); } catch(e){ console.warn(e); } });
  return pts.sort((x, y) => (x.data || '').localeCompare(y.data || ''));
}
function gruposEvolucao(pts){
  const g = {};
  pts.forEach(p => {
    if(p.turmaId && db.turmas && db.turmas[p.turmaId]) (g['t:' + p.turmaId] = g['t:' + p.turmaId] || {id: 't:' + p.turmaId, tipo: 'Turma', nome: db.turmas[p.turmaId].nome, pts: []}).pts.push(p);
    const kd = 'd:' + p.curso + '\u0000' + p.disciplina;
    (g[kd] = g[kd] || {id: kd, tipo: 'Disciplina', nome: p.curso + ' · ' + p.disciplina, pts: []}).pts.push(p);
  });
  return Object.values(g).sort((x, y) => x.tipo.localeCompare(y.tipo) || x.nome.localeCompare(y.nome, 'pt-BR'));
}
function evolucaoDe(G){
  const pts = G.pts, alunos = {};
  pts.forEach((p, i) => p.alunos.forEach(s => { const o = alunos[s.chave] = alunos[s.chave] || {nome: s.nome, ra: s.ra, notas: Array(pts.length).fill(null)}; o.notas[i] = s.nota10; }));
  const lista = Object.values(alunos).map(o => {
    const v = o.notas.filter(x => x != null); let tend = null;
    if(v.length >= 2){ const ult = v[v.length - 1], ant = media(v.slice(0, -1)); tend = ult - ant; }
    return Object.assign(o, {media: media(v), tend, feitas: v.length});
  }).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
  // competências (ou temas) que aparecem em mais de uma avaliação
  const eixo = (campo) => { const m = {}; pts.forEach((p, i) => (p[campo] || []).forEach(t => { (m[t.nome] = m[t.nome] || Array(pts.length).fill(null))[i] = t.p; })); return Object.entries(m).filter(([, v]) => v.filter(x => x != null).length >= 2).map(([nome, v]) => ({nome, v})); };
  return {pts, alunos: lista, comps: eixo('comps'), temas: eixo('temas')};
}
function painelCurso(curso){
  const pts = pontosAvaliacoes().filter(p => p.tipo === 'Avaliação' && p.curso === curso);
  const disc = {}, comp = {}, tema = {};
  pts.forEach(p => {
    const d = disc[p.disciplina] = disc[p.disciplina] || {nome: p.disciplina, avs: 0, notas: [], temas: {}};
    d.avs++; p.alunos.forEach(s => d.notas.push(s.nota10));
    p.temas.forEach(t => { const o = d.temas[t.nome] = d.temas[t.nome] || {nome: t.nome, n: 0, soma: 0}; o.n += t.n; o.soma += t.p * t.n;
                           const g = tema[t.nome] = tema[t.nome] || {nome: t.nome + ' (' + p.disciplina + ')', n: 0, soma: 0}; g.n += t.n; g.soma += t.p * t.n; });
    p.comps.forEach(t => { const o = comp[t.nome] = comp[t.nome] || {nome: t.nome, n: 0, soma: 0}; o.n += t.n; o.soma += t.p * t.n; });
  });
  const linhas = Object.values(disc).map(d => {
    const fracos = Object.values(d.temas).map(o => ({nome: o.nome, p: o.soma / o.n})).sort((x, y) => x.p - y.p).slice(0, 2);
    return {nome: d.nome, avs: d.avs, n: d.notas.length, media: media(d.notas), acima: d.notas.length ? d.notas.filter(x => x >= NOTA_MIN).length / d.notas.length : null, fracos};
  }).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
  const todas = pts.flatMap(p => p.alunos.map(s => s.nota10));
  const lst = m => Object.values(m).map(o => ({nome: o.nome, n: o.n, p: o.soma / o.n})).sort((x, y) => x.p - y.p);
  return {curso, avs: pts.length, n: todas.length, media: media(todas), acima: todas.length ? todas.filter(x => x >= NOTA_MIN).length / todas.length : null,
    disciplinas: linhas, comps: lst(comp), temas: lst(tema).slice(0, 8)};
}

// =================== tela "Desempenho" ===================
let desTela = 'evolucao', desGrupo = null, desCurso = null;
function abrirDesempenho(tela){ if(tela) desTela = tela; aba('desempenho'); }
function cartaoDesempenho(){
  if(!pontosAvaliacoes().length) return '';
  return '<div class="card avcard" onclick="abrirDesempenho()"><div class="row" style="align-items:center"><div style="flex:1"><b>Desempenho das turmas</b>' +
    '<div class="lbl">Evolução entre as provas e painel por curso</div></div><span class="lbl">›</span></div></div>';
}
function graficoLinha(valores, rotulos, max){
  const W = 320, H = 150, ml = 26, mr = 18, mt = 10, mb = 26, n = valores.length;
  const x = i => n < 2 ? ml + (W - ml - mr) / 2 : ml + i * (W - ml - mr) / (n - 1), y = v => mt + (1 - v / max) * (H - mt - mb);
  let s = '<svg class="anl-graf" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Média por avaliação">';
  [0, max / 2, max].forEach(v => { s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="anl-grade"/><text x="' + (ml - 4) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + fmt(v) + '</text>'; });
  const pts = valores.map((v, i) => v == null ? null : [x(i), y(v)]);
  const seg = pts.filter(Boolean).map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  if(pts.filter(Boolean).length > 1) s += '<polyline points="' + seg + '" class="anl-linha-g"/>';
  pts.forEach((p, i) => { if(!p) return; s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" class="anl-ponto"/><text x="' + p[0] + '" y="' + (p[1] - 7) + '" text-anchor="middle" class="anl-val">' + fmt(Math.round(valores[i] * 10) / 10) + '</text>'; });
  rotulos.forEach((r, i) => { s += '<text x="' + x(i) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(r) + '</text>'; });
  return s + '</svg>';
}
const rotPt = (p, i) => p.data ? fmtData(p.data).slice(0, 5) : 'P' + (i + 1);
function seta(t){ return t == null ? '<span class="lbl">–</span>' : t >= 0.5 ? '<b class="anl-ok">▲ ' + fmt(Math.round(t * 10) / 10) + '</b>' : t <= -0.5 ? '<b class="anl-bad">▼ ' + fmt(Math.round(-t * 10) / 10) + '</b>' : '<span class="lbl">=</span>'; }
function renderDesempenho(){
  const pts = pontosAvaliacoes();
  let h = '<button class="link" onclick="aba(\'inicio\')">‹ Início</button><div class="anl-seg"><button class="' + (desTela === 'evolucao' ? 'on' : '') + '" onclick="desTela=\'evolucao\';render()">Evolução</button>' +
    '<button class="' + (desTela === 'painel' ? 'on' : '') + '" onclick="desTela=\'painel\';render()">Painel do curso</button></div>';
  if(!pts.length){ $('#v-desempenho').innerHTML = h + '<div class="card"><div class="vazio">Corrija pelo menos uma avaliação para ver o desempenho.</div></div>'; return; }
  if(desTela === 'evolucao'){
    const G = gruposEvolucao(pts); if(!G.find(g => g.id === desGrupo)) desGrupo = (G.find(g => g.pts.length > 1) || G[0]).id;
    const g = G.find(x => x.id === desGrupo), E = evolucaoDe(g);
    h += '<div class="card"><label class="campo"><span>Turma ou disciplina</span><select onchange="desGrupo=this.value;render()">' +
      ['Turma', 'Disciplina'].map(tp => { const gs = G.filter(x => x.tipo === tp); return gs.length ? '<optgroup label="' + (tp === 'Turma' ? 'Turmas' : 'Disciplinas') + '">' + gs.map(x => '<option value="' + esc(x.id) + '"' + (x.id === desGrupo ? ' selected' : '') + '>' + esc(x.nome) + ' (' + x.pts.length + ')</option>').join('') + '</optgroup>' : ''; }).join('') + '</select></label>';
    h += '<h3 class="anl-sub">Média da turma (de 0 a 10)</h3>' + graficoLinha(E.pts.map(p => p.media10), E.pts.map(rotPt), 10) +
      '<ul class="anl-pts">' + E.pts.map((p, i) => '<li><b>' + esc(rotPt(p, i)) + '</b> ' + esc(p.tipo === 'Avaliação' ? (g.tipo === 'Turma' ? p.disciplina + ' · ' : '') + p.titulo : p.tipo + ': ' + p.titulo) + ' <span class="lbl">· ' + p.n + ' alunos · média ' + fmt(Math.round(p.media10 * 10) / 10) + '</span></li>').join('') + '</ul>';
    if(E.pts.length < 2) h += '<p class="lbl">Quando houver mais de uma avaliação corrigida para esta turma, o gráfico mostra a evolução.</p>';
    const eixo = E.comps.length ? E.comps : E.temas;
    if(eixo.length) h += '<h3 class="anl-sub">' + (E.comps.length ? 'Competências' : 'Temas') + ' ao longo do tempo</h3><div class="anl-tab"><table><tr><th></th>' + E.pts.map((p, i) => '<th>' + esc(rotPt(p, i)) + '</th>').join('') + '</tr>' +
      eixo.map(e => '<tr><td>' + esc(e.nome) + '</td>' + e.v.map(v => '<td class="anl-' + faixa(v) + '">' + (v == null ? '' : pct(v)) + '</td>').join('') + '</tr>').join('') + '</table></div>';
    h += '<button class="btn sec" style="margin-top:12px;width:100%" onclick="baixarEvolucao()">Evolução (PDF)</button></div>';
    const caiu = E.alunos.filter(x => x.tend != null && x.tend <= -1.5);
    h += '<div class="card"><h2>Alunos</h2>' + (caiu.length ? '<div class="alerta">' + caiu.length + ' aluno' + (caiu.length > 1 ? 's caíram' : ' caiu') + ' 1,5 ponto ou mais na última prova, comparando com a média das anteriores.</div>' : '') +
      '<div class="anl-tab"><table><tr><th>Aluno</th>' + E.pts.map((p, i) => '<th>' + esc(rotPt(p, i)) + '</th>').join('') + '<th>Tendência</th></tr>' +
      E.alunos.map(x => '<tr><td>' + esc(x.nome) + '</td>' + x.notas.map(v => '<td' + (v != null && v < NOTA_MIN ? ' class="anl-bad"' : '') + '>' + (v == null ? '<span class="lbl">–</span>' : fmt(Math.round(v * 10) / 10)) + '</td>').join('') + '<td>' + seta(x.tend) + '</td></tr>').join('') +
      '</table></div><p class="lbl" style="margin-top:8px">Notas convertidas para 0 a 10. Tendência: última nota menos a média das anteriores. O aluno é reconhecido pelo RA (ou pelo nome, se não houver RA).</p></div>';
  } else {
    const cursos = [...new Set(pts.filter(p => p.tipo === 'Avaliação').map(p => p.curso))].sort((x, y) => x.localeCompare(y, 'pt-BR'));
    if(!cursos.includes(desCurso)) desCurso = cursos.slice().sort((x, y) => pts.filter(p => p.curso === y).length - pts.filter(p => p.curso === x).length)[0];
    const P = painelCurso(desCurso);
    h += '<div class="card"><label class="campo"><span>Curso</span><select onchange="desCurso=this.value;render()">' + cursos.map(c => '<option' + (c === desCurso ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label>' +
      '<div class="row anl-kpis"><div class="kpi"><span class="lbl">Avaliações</span><b>' + P.avs + '</b></div><div class="kpi"><span class="lbl">Provas corrigidas</span><b>' + P.n + '</b></div>' +
      '<div class="kpi"><span class="lbl">Média (0 a 10)</span><b>' + fmt(Math.round(P.media * 10) / 10) + '</b></div><div class="kpi"><span class="lbl">Nota ' + NOTA_MIN + ' ou mais</span><b>' + pct(P.acima) + '</b></div></div>' +
      '<h3 class="anl-sub">Por disciplina</h3>' + P.disciplinas.map(d => '<div class="anl-q"><div class="anl-rot"><span><b>' + esc(d.nome) + '</b> <span class="lbl">· ' + d.avs + ' avaliaç' + (d.avs > 1 ? 'ões' : 'ão') + ' · ' + d.n + ' provas</span></span><b class="anl-' + faixa(d.media / 10) + '">' + fmt(Math.round(d.media * 10) / 10) + '</b></div>' +
        '<div class="anl-barra"><i class="anl-' + faixa(d.media / 10) + '" style="width:' + Math.round(d.media * 10) + '%"></i></div><div class="lbl">' + pct(d.acima) + ' com nota ' + NOTA_MIN + ' ou mais' + (d.fracos.length ? ' · mais fracos: ' + d.fracos.map(f => esc(f.nome) + ' (' + pct(f.p) + ')').join(', ') : '') + '</div></div>').join('');
    if(P.comps.length) h += '<h3 class="anl-sub">Competências do curso</h3>' + P.comps.map(t => barraP(t.p, t.nome)).join('');
    else if(P.temas.length) h += '<h3 class="anl-sub">Temas com menor acerto</h3>' + P.temas.map(t => barraP(t.p, t.nome)).join('');
    h += '<button class="btn sec" style="margin-top:12px;width:100%" onclick="baixarPainel()">Painel do curso (PDF)</button>' +
      '<p class="lbl" style="margin-top:8px">Reúne as avaliações corrigidas na sua conta. Para comparar professores diferentes, cada um precisa usar a própria conta e enviar o PDF à coordenação.</p></div>';
  }
  $('#v-desempenho').innerHTML = h;
}
function baixarEvolucao(){
  const G = gruposEvolucao(pontosAvaliacoes()), g = G.find(x => x.id === desGrupo); if(!g) return;
  comProgresso('Gerando a evolução…', async () => { await pdfAnaliseLibs(); baixarBlob(PDFANL.gerarEvolucao(g, evolucaoDe(g)).output('blob'), 'evolucao_' + nomeArq(g.nome) + '.pdf'); });
}
function baixarPainel(){
  if(!desCurso) return;
  comProgresso('Gerando o painel…', async () => { await pdfAnaliseLibs(); baixarBlob(PDFANL.gerarPainelCurso(painelCurso(desCurso), NOTA_MIN).output('blob'), 'painel_' + nomeArq(desCurso) + '.pdf'); });
}

// estilos das análises (ficam aqui para não mexer no index.html)
(function(){
  const s = document.createElement('style');
  s.textContent = '.anl-kpis{margin-top:8px;flex-wrap:wrap}.anl-kpis .kpi{flex:1;min-width:92px}.anl-kpis .kpi b{font-size:18px}' +
    '.anl-sub{font-size:14px;margin:16px 0 8px;color:var(--navy)}.anl-linha,.anl-q{margin-bottom:10px}.anl-q{padding:8px 0;border-bottom:1px solid var(--line)}' +
    '.anl-rot{display:flex;justify-content:space-between;gap:10px;font-size:13.5px;align-items:baseline}.anl-rot span{min-width:0;overflow-wrap:anywhere}' +
    '.anl-barra{height:8px;background:var(--bg);border-radius:99px;overflow:hidden;margin-top:4px}.anl-barra i{display:block;height:100%;border-radius:99px;background:var(--navy2)}' +
    '.anl-barra i.anl-ok{background:var(--ok)}.anl-barra i.anl-warn{background:#d79b12}.anl-barra i.anl-bad{background:var(--bad)}' +
    'b.anl-ok,.anl-ok{color:var(--ok)}b.anl-warn,.anl-warn{color:var(--warn)}b.anl-bad,.anl-bad{color:var(--bad)}' +
    '.anl-enun{margin:3px 0}.anl-alts{display:flex;flex-wrap:wrap;gap:6px;font-size:12.5px;margin-top:4px}.anl-alts span{background:var(--bg);border-radius:6px;padding:1px 7px}' +
    '.anl-alts span.anl-certa{background:var(--okb);color:var(--ok);font-weight:700}.anl-pill{display:block;width:fit-content;max-width:100%;white-space:normal;margin-top:5px;font-weight:500}' +
    '.anl-seg{display:flex;gap:6px;margin:8px 0 12px}.anl-seg button{flex:1;padding:9px;border-radius:10px;border:1.5px solid var(--line);background:var(--card);color:var(--ink);font:600 14px system-ui,sans-serif;cursor:pointer}' +
    '.anl-seg button.on{background:var(--navy);border-color:var(--navy);color:var(--card)}' +
    '.anl-graf{width:100%;height:auto;display:block}.anl-graf text{font:10px system-ui,sans-serif;fill:var(--mute)}.anl-graf .anl-val{fill:var(--ink);font-weight:700}' +
    '.anl-grade{stroke:var(--line);stroke-width:1}.anl-linha-g{fill:none;stroke:var(--navy2);stroke-width:2.5}.anl-ponto{fill:var(--acc)}' +
    '.anl-pts{list-style:none;padding:0;margin:8px 0 0;font-size:13px}.anl-pts li{padding:3px 0}' +
    '.anl-tab{overflow-x:auto;margin-top:6px}.anl-tab table{border-collapse:collapse;width:100%;font-size:13px}.anl-tab th,.anl-tab td{padding:6px 6px;border-bottom:1px solid var(--line);text-align:center;white-space:nowrap}' +
    '.anl-tab th:first-child,.anl-tab td:first-child{text-align:left;white-space:normal;min-width:120px}.anl-tab th{color:var(--mute);font-weight:600;font-size:12px}';
  document.head.appendChild(s);
})();

