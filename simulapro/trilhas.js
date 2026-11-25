/* SimulaPro – Trilha ENADE (treino quinzenal online)
   O professor cria a trilha (turma salva + banco de questões + calendário). Cada aluno recebe um código
   individual e responde no celular em <endereço do app>/aluno/. Tudo fica no servidor (api/trilha.php):
   a trilha não é guardada no aparelho, porque as respostas chegam a qualquer momento.
   Só existe na versão com login (não no GitHub Pages / MODO_LOCAL). */
'use strict';

const TR_API = 'api/trilha.php';
let trilhas = null, trilhasErro = '', trilhaAberta = null, trilhaDados = null;

async function apiTrilha(acao, dados = {}){
  const r = await fetch(TR_API, {method: 'POST', headers: {'Content-Type': 'application/json',
    ...(sessao ? {'Authorization': 'Bearer ' + sessao.token} : {})}, body: JSON.stringify({acao, ...dados})});
  let j = {}; try { j = await r.json(); } catch(e){}
  if(!r.ok || !j.ok){ const e = new Error(j.erro || 'Falha na comunicação com o servidor (' + r.status + ').'); e.status = r.status; throw e; }
  return j;
}
const linkAluno = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'aluno/';
const linkAlunoCurto = () => linkAluno().replace(/^https?:\/\//, '').replace(/\/$/, '');
const fmtDM = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';
const nota10 = (a, n) => n ? Math.round(100 * a / n) / 10 : null;

// ---------- página inicial
function blocoTrilhas(){
  if(MODO_LOCAL || !sessao) return '';
  if(trilhas === null && !trilhasErro) carregarTrilhas();
  let h = '<div class="row" style="align-items:baseline;margin:18px 0 8px"><h3 class="sec" style="margin:0;flex:1">Trilhas ENADE</h3>' +
          '<button class="link" onclick="novaTrilha()">+ Nova trilha</button></div><div id="blocoTrilhas">';
  if(trilhas === null) h += trilhasErro ? '<div class="card"><p class="muted" style="margin:0">' + esc(trilhasErro) + '</p></div>' : '<div class="card"><p class="muted" style="margin:0">Carregando…</p></div>';
  else if(!trilhas.length) h += '<div class="card"><p class="muted" style="margin:0">Treino quinzenal para o ENADE: a cada 15 dias abre uma rodada de questões do seu banco, e cada aluno responde no celular com um código individual. Você acompanha a evolução da turma por tema.</p>' +
      '<div class="stack" style="margin-top:10px"><button class="btn sec" onclick="novaTrilha()">+ Nova trilha</button></div></div>';
  else trilhas.forEach(t => {
    const ab = t.calendario.find(c => c.estado === 'aberta'), prox = t.calendario.find(c => c.estado === 'futura');
    const st = ab ? '<span class="pill warn">rodada ' + (ab.k + 1) + ': ' + ab.responderam + '/' + t.alunos + '</span>' : prox ? '<span class="pill">abre ' + fmtDM(prox.abre) + '</span>' : '<span class="pill ok">encerrada</span>';
    h += '<div class="card avcard" onclick="abrirTrilha(\'' + t.id + '\')"><div class="row" style="align-items:center"><div style="flex:1;min-width:0"><b>' + esc(t.nome) + '</b>' +
         '<div class="lbl">' + t.alunos + ' alunos · ' + t.rodadas + ' rodadas de ' + t.porRodada + ' questões' + (ab ? ' · aberta até ' + fmtDM(ab.ate) : '') + '</div></div><div style="flex:none">' + st + '</div></div></div>';
  });
  return h + '</div>';
}
async function carregarTrilhas(){
  try { trilhas = (await apiTrilha('trilha_listar')).trilhas; trilhasErro = ''; }
  catch(e){ trilhasErro = e.status ? e.message : 'Sem internet: as trilhas aparecem quando o aparelho estiver conectado.'; trilhas = null; }
  if(abaAtual === 'inicio' && $('#blocoTrilhas')) render();
}

// ---------- nova trilha
let novaTr = null;
function novaTrilha(){
  const turmas = turmasLista().filter(t => t.alunos.length);
  if(!turmas.length) return alert('Primeiro cadastre a turma (Início › Minhas turmas › Nova turma). A trilha usa a lista de alunos dela.');
  novaTr = {nome: '', turmaId: turmas[0].id, fonte: '', banco: null, inicio: hojeISO(), rodadas: 8, porRodada: 10};
  renderNovaTrilha(); $('#res').classList.add('on'); $('#res').scrollTop = 0;
}
function avsComBanco(){ return Object.values(db.avaliacoes).filter(a => a.id !== 'DEMO' && objetivas(a).length).sort((x, y) => (y.data || '').localeCompare(x.data || '')); }
function bancoNovaTr(){ if(novaTr.fonte === 'arquivo') return novaTr.banco || []; const a = db.avaliacoes[novaTr.fonte]; return a ? objetivas(a) : []; }
function renderNovaTrilha(){
  const T = turmasLista().filter(t => t.alunos.length), A = avsComBanco(), nb = bancoNovaTr().length, temas = new Set(bancoNovaTr().map(q => q.tema)).size;
  const fim = novaTr.inicio ? addDias(novaTr.inicio, novaTr.rodadas * 15 - 1) : '';
  let h = '<button class="link" onclick="fecharRes()">‹ Início</button><div class="card" style="margin-top:8px"><h2>Nova trilha ENADE</h2>' +
    '<p class="lbl">A cada 15 dias abre uma rodada. Cada aluno recebe questões diferentes do banco, sem repetir as que já fez, e a partir da 3ª rodada os temas em que ele mais errou voltam com mais frequência.</p>' +
    '<label class="campo"><span>Nome da trilha</span><input type="text" id="trNome" value="' + esc(novaTr.nome) + '" placeholder="Ex.: Trilha ENADE 2026 · Direito" oninput="novaTr.nome=this.value"></label>' +
    '<label class="campo"><span>Turma</span><select onchange="novaTr.turmaId=this.value">' + T.map(t => '<option value="' + t.id + '"' + (t.id === novaTr.turmaId ? ' selected' : '') + '>' + esc(t.nome || 'Turma') + ' (' + t.alunos.length + ' alunos)</option>').join('') + '</select></label>' +
    '<label class="campo"><span>Banco de questões</span><select onchange="escolherFonteTr(this.value)"><option value="">Escolha…</option>' +
      A.map(a => '<option value="' + a.id + '"' + (a.id === novaTr.fonte ? ' selected' : '') + '>Banco da avaliação: ' + esc([a.disciplina, a.titulo].filter(Boolean).join(' · ') || 'Avaliação') + ' (' + objetivas(a).length + ' questões)</option>').join('') +
      '<option value="arquivo"' + (novaTr.fonte === 'arquivo' ? ' selected' : '') + '>Enviar uma planilha de questões…</option></select></label>' +
    (nb ? '<p class="lbl" style="margin-top:6px">' + nb + ' questões objetivas · ' + temas + ' tema(s). Questões discursivas ficam de fora.</p>' : '') +
    '<div class="row"><label class="campo"><span>1ª rodada abre em</span><input type="date" value="' + novaTr.inicio + '" onchange="novaTr.inicio=this.value;renderNovaTrilha()"></label>' +
    '<label class="campo"><span>Rodadas</span><input type="number" min="1" max="26" value="' + novaTr.rodadas + '" onchange="novaTr.rodadas=+this.value;renderNovaTrilha()"></label>' +
    '<label class="campo"><span>Questões por rodada</span><input type="number" min="1" max="20" value="' + novaTr.porRodada + '" onchange="novaTr.porRodada=+this.value;renderNovaTrilha()"></label></div>' +
    (fim ? '<p class="lbl" style="margin-top:8px">Calendário: ' + novaTr.rodadas + ' rodadas de 15 dias, de ' + fmtData(novaTr.inicio) + ' a ' + fmtData(fim) + '.' +
      (nb && nb < novaTr.rodadas * novaTr.porRodada ? ' O banco tem ' + nb + ' questões para ' + (novaTr.rodadas * novaTr.porRodada) + ' respostas por aluno: depois que ele vir todas, as menos vistas voltam.' : '') + '</p>' : '') +
    '</div><div class="stack"><button class="btn acc" onclick="criarTrilha()">Criar trilha e gerar os códigos</button></div>' +
    '<p class="lbl" style="margin-top:10px">Os alunos não precisam de e-mail nem senha: cada um recebe um código. No primeiro acesso eles leem um aviso de privacidade e confirmam que querem participar.</p>';
  $('#resConteudo').innerHTML = h;
}
function addDias(iso, d){ const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); }
function escolherFonteTr(v){
  if(v === 'arquivo'){ trArqDestino = 'nova'; $('#arqBancoTr').click(); return; }
  novaTr.fonte = v; renderNovaTrilha();
}
let trArqDestino = 'nova';
async function onBancoTrilha(inp){
  const f = inp.files[0]; inp.value = ''; if(!f) return;
  try {
    const {banco, erros} = interpretarBanco(await lerPlanilha(f));
    const obj = banco.filter(q => q.tipo !== 'D');
    if(!obj.length) throw new Error('Nenhuma questão objetiva encontrada.' + (erros.length ? '\n' + erros.slice(0, 5).join('\n') : ''));
    if(erros.length) alert(erros.length + ' linha(s) ignorada(s):\n' + erros.slice(0, 8).join('\n'));
    if(trArqDestino === 'nova'){ novaTr.fonte = 'arquivo'; novaTr.banco = obj; renderNovaTrilha(); }
    else trocarBancoTrilha(obj, f.name);
  } catch(e){ alert('Não consegui ler o banco de questões.\n' + e.message); if(trArqDestino === 'nova') renderNovaTrilha(); }
}
const bancoParaServidor = B => B.filter(q => q.tipo !== 'D').map(q => ({tema: q.tema, enunciado: q.enunciado, alts: q.alts, correta: q.correta, comentario: q.comentario || '', ...(q.img ? {img: {dataUrl: q.img.dataUrl}} : {})}));
async function criarTrilha(){
  const t = db.turmas[novaTr.turmaId], B = bancoNovaTr();
  if((novaTr.nome || '').trim().length < 3) return alert('Dê um nome para a trilha.');
  if(!t) return alert('Escolha a turma.');
  if(!B.length) return alert('Escolha o banco de questões.');
  if(B.length < novaTr.porRodada) return alert('O banco tem ' + B.length + ' questões, menos do que as ' + novaTr.porRodada + ' de cada rodada.');
  const av0 = db.avaliacoes[novaTr.fonte];
  await comProgresso('Criando a trilha…', async () => {
    const r = await apiTrilha('trilha_criar', {nome: novaTr.nome.trim(), turmaId: t.id, curso: t.curso || (av0 && av0.curso) || '', disciplina: (av0 && av0.disciplina) || '',
      inicio: novaTr.inicio, rodadas: novaTr.rodadas, porRodada: novaTr.porRodada, banco: bancoParaServidor(B), alunos: t.alunos.map(x => ({nome: x.nome, ra: x.ra || ''}))});
    trilhas = null; novaTr = null; toast('Trilha criada'); await abrirTrilha(r.trilha.id);
  });
}

// ---------- tela da trilha
async function abrirTrilha(id){
  trilhaAberta = id; $('#res').classList.add('on');
  $('#resConteudo').innerHTML = '<button class="link" onclick="fecharTrilha()">‹ Início</button><div class="card" style="margin-top:8px"><p class="muted">Carregando a trilha…</p></div>';
  try { trilhaDados = await apiTrilha('trilha_ver', {id}); renderTrilha(); $('#res').scrollTop = 0; }
  catch(e){ $('#resConteudo').innerHTML = '<button class="link" onclick="fecharTrilha()">‹ Início</button><div class="card" style="margin-top:8px"><p>' + esc(e.status ? e.message : 'Sem internet. A trilha fica no servidor: conecte o aparelho e tente de novo.') + '</p></div>'; }
}
function fecharTrilha(){ trilhaAberta = null; trilhaDados = null; trilhas = null; fecharRes(); render(); }

/** Números da trilha: notas por aluno e rodada, participação, acerto por tema. */
function estatTrilha(D){
  const T = D.trilha, R = D.resp || {}, al = D.alunos.filter(a => a.ativo);
  const linhas = al.map(a => {
    const notas = T.calendario.map(c => { const r = (R[c.k] || {})[a.id]; return r && r.enviado ? nota10(r.acertos, r.n) : null; });
    const f = notas.filter(x => x != null);
    return {a, notas, feitas: f.length, media: f.length ? f.reduce((s, x) => s + x, 0) / f.length : null};
  });
  const porRodada = T.calendario.map((c, i) => { const f = linhas.map(l => l.notas[i]).filter(x => x != null); return {c, responderam: f.length, media: f.length ? f.reduce((s, x) => s + x, 0) / f.length : null}; });
  const temas = {};
  Object.values(R).forEach(porAluno => Object.values(porAluno).forEach(r => {
    if(!r.enviado) return;
    r.qs.forEach((qid, i) => { const q = D.banco[qid]; if(!q) return; const x = temas[q.tema] = temas[q.tema] || {tema: q.tema, certas: 0, total: 0}; x.total++; if(r.certas[i]) x.certas++; });
  }));
  const listaTemas = Object.values(temas).map(x => ({...x, pct: x.total ? 100 * x.certas / x.total : 0})).sort((x, y) => x.pct - y.pct);
  return {linhas, porRodada, temas: listaTemas};
}
function renderTrilha(){
  const D = trilhaDados, T = D.trilha, E = estatTrilha(D);
  const ab = E.porRodada.find(p => p.c.estado === 'aberta');
  let h = '<button class="link" onclick="fecharTrilha()">‹ Início</button>' +
    '<div class="card" style="margin-top:8px"><h2>' + esc(T.nome) + '</h2><div class="lbl">' + T.alunos + ' alunos · ' + T.questoes + ' questões no banco · ' + T.rodadas + ' rodadas de ' + T.porRodada + ' questões · de ' +
    fmtData(T.calendario[0].abre) + ' a ' + fmtData(T.calendario[T.calendario.length - 1].ate) + '</div>' +
    (ab ? '<div class="alerta" style="margin-top:10px"><b>Rodada ' + (ab.c.k + 1) + ' aberta até ' + fmtData(ab.c.ate) + ':</b> ' + ab.responderam + ' de ' + T.alunos + ' alunos responderam.</div>' : '') +
    '<p class="lbl" style="margin-top:10px">Os alunos entram em <b>' + esc(linkAlunoCurto()) + '</b> com o código de cada um.</p>' +
    '<div class="row" style="margin-top:10px"><button class="btn" onclick="pdfCodigosTrilha()">Códigos dos alunos (PDF)</button></div>' +
    '<div class="row" style="margin-top:8px"><button class="btn sec" onclick="pdfRelatorioTrilha()">Relatório (PDF)</button><button class="btn sec" onclick="csvTrilha()">Planilha (CSV)</button></div></div>';
  // calendário
  h += '<h3 class="sec">Calendário</h3><div class="card" style="padding:6px 14px">';
  E.porRodada.forEach(p => {
    const c = p.c, st = c.estado === 'futura' ? '<span class="pill">abre ' + fmtDM(c.abre) + '</span>' : c.estado === 'aberta' ? '<span class="pill warn">aberta</span>' : '<span class="pill ok">fechada</span>';
    h += '<div class="row" style="align-items:center;padding:9px 0;border-bottom:1px solid var(--line)"><div style="flex:1;min-width:0"><b>Rodada ' + (c.k + 1) + '</b><div class="lbl">' + fmtDM(c.abre) + ' a ' + fmtDM(c.ate) +
         (c.estado !== 'futura' ? ' · ' + p.responderam + '/' + T.alunos + ' responderam' + (p.media != null ? ' · média ' + fmt(p.media) : '') : '') + '</div></div><div style="flex:none">' + st + '</div></div>';
  });
  h += '</div>';
  // temas
  if(E.temas.length){
    h += '<h3 class="sec">Acerto da turma por tema</h3><div class="card">';
    E.temas.forEach(x => {
      const p = Math.round(x.pct);
      h += '<div style="margin-bottom:10px"><div class="row" style="align-items:baseline"><span style="flex:1;min-width:0">' + esc(x.tema) + '</span><b style="flex:none">' + p + '%</b></div>' +
           '<div class="barra-prog" style="margin-top:4px"><i style="width:' + p + '%;background:' + (p < 50 ? 'var(--bad)' : p < 70 ? 'var(--warn)' : 'var(--ok)') + '"></i></div><div class="lbl">' + x.certas + ' de ' + x.total + ' respostas certas</div></div>';
    });
    h += '<p class="lbl">Os temas mais fracos aparecem primeiro. Eles são bons candidatos para revisar em aula.</p></div>';
  }
  // alunos
  const visiveis = T.calendario.filter(c => c.estado !== 'futura').length;
  h += '<h3 class="sec">Alunos</h3><div class="card" style="padding:6px 14px">';
  E.linhas.forEach(l => {
    const ult = l.notas.slice(0, visiveis).map(n => '<span class="pill' + (n == null ? '' : n >= 6 ? ' ok' : ' warn') + '" style="margin:2px 2px 0 0">' + (n == null ? '–' : fmt(n)) + '</span>').join('');
    h += '<div style="padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer" onclick="verAlunoTrilha(\'' + l.a.id + '\')"><div class="row" style="align-items:baseline"><b style="flex:1;min-width:0">' + esc(l.a.nome) + '</b>' +
         '<span class="lbl" style="flex:none">' + (l.media != null ? 'média ' + fmt(l.media) : 'sem respostas') + '</span></div>' +
         '<div class="lbl">' + (l.a.aceite ? '' : 'ainda não entrou · ') + l.feitas + ' de ' + visiveis + ' rodada(s)</div>' + (ult ? '<div>' + ult + '</div>' : '') + '</div>';
  });
  const fora = D.alunos.filter(a => !a.ativo);
  h += '</div>' + (fora.length ? '<p class="lbl">Desativados: ' + fora.map(a => esc(a.nome)).join(', ') + '.</p>' : '');
  // ajustes
  h += '<h3 class="sec">Ajustes</h3><div class="stack">' +
       (T.turmaId && db.turmas && db.turmas[T.turmaId] ? '<button class="btn sec" onclick="incluirDaTurma()">Incluir alunos novos da turma</button>' : '') +
       '<button class="btn sec" onclick="trArqDestino=\'trilha\';$(\'#arqBancoTr\').click()">Trocar o banco de questões (planilha)</button>' +
       '<button class="btn sec" onclick="mudarRodadasTrilha()">Mudar o número de rodadas</button>' +
       '<button class="btn sec" style="color:var(--bad)" onclick="excluirTrilha()">Excluir trilha</button></div>' +
       '<p class="lbl" style="margin-top:10px">Trocar o banco vale para as próximas rodadas; as respostas já enviadas continuam valendo.</p>';
  $('#resConteudo').innerHTML = h;
}
function verAlunoTrilha(aid){
  const D = trilhaDados, a = D.alunos.find(x => x.id === aid), l = estatTrilha(D).linhas.find(x => x.a.id === aid);
  abrirFolha('<b style="font-size:17px">' + esc(a.nome) + '</b><div class="lbl">' + (a.ra ? 'RA ' + esc(a.ra) + ' · ' : '') + (a.aceite ? 'entrou em ' + new Date(a.aceite * 1000).toLocaleDateString('pt-BR') : 'ainda não entrou') + '</div>' +
    '<div style="margin:14px 0;text-align:center"><div class="lbl">Código de acesso</div><div style="font:800 28px ui-monospace,Menlo,monospace;letter-spacing:.1em">' + esc(a.codigo) + '</div><div class="lbl">' + esc(linkAlunoCurto()) + '</div></div>' +
    (l ? '<div class="lbl" style="margin-bottom:10px">Notas: ' + D.trilha.calendario.map((c, i) => 'R' + (i + 1) + ' ' + (l.notas[i] == null ? '–' : fmt(l.notas[i]))).join(' · ') + '</div>' : '') +
    '<div class="stack"><button class="btn sec" onclick="mudarAlunoTrilha(\'' + aid + '\',{novoCodigo:\'' + aid + '\'},\'Criar um código novo para ' + esc(a.nome).replace(/'/g, '') + '? O código antigo deixa de funcionar.\')">Criar código novo (perdeu o código)</button>' +
    '<button class="btn sec" style="color:var(--bad)" onclick="mudarAlunoTrilha(\'' + aid + '\',{aluno:\'' + aid + '\',ativo:' + (a.ativo ? 'false' : 'true') + '},' + (a.ativo ? '\'Desativar este aluno? O código deixa de funcionar e ele sai do relatório.\'' : 'null') + ')">' + (a.ativo ? 'Desativar aluno' : 'Reativar aluno') + '</button>' +
    '<button class="btn sec" onclick="fecharFolha()">Fechar</button></div>');
}
async function mudarAlunoTrilha(aid, m, pergunta){
  if(pergunta && !confirm(pergunta)) return;
  fecharFolha();
  try { await apiTrilha('trilha_mudar', {id: trilhaAberta, ...m}); trilhaDados = await apiTrilha('trilha_ver', {id: trilhaAberta}); renderTrilha(); if(m.novoCodigo) verAlunoTrilha(aid); }
  catch(e){ alert(e.message); }
}
async function incluirDaTurma(){
  const t = db.turmas[trilhaDados.trilha.turmaId];
  const ja = new Set(trilhaDados.alunos.map(a => norm(a.nome)));
  const novos = t.alunos.filter(x => !ja.has(norm(x.nome)));
  if(!novos.length) return toast('Todos os alunos da turma já estão na trilha');
  if(!confirm('Incluir ' + novos.length + ' aluno(s) novo(s) da turma "' + (t.nome || 'Turma') + '"?\n' + novos.slice(0, 10).map(x => x.nome).join('\n'))) return;
  try { const r = await apiTrilha('trilha_mudar', {id: trilhaAberta, incluir: novos.map(x => ({nome: x.nome, ra: x.ra || ''}))}); toast(r.msg); trilhaDados = await apiTrilha('trilha_ver', {id: trilhaAberta}); renderTrilha(); }
  catch(e){ alert(e.message); }
}
async function trocarBancoTrilha(B, nome){
  if(!confirm('Trocar o banco desta trilha pelas ' + B.length + ' questões de "' + nome + '"? Vale para as próximas rodadas.')) return;
  try { await apiTrilha('trilha_mudar', {id: trilhaAberta, banco: bancoParaServidor(B)}); toast('Banco trocado'); trilhaDados = await apiTrilha('trilha_ver', {id: trilhaAberta}); renderTrilha(); }
  catch(e){ alert(e.message); }
}
async function mudarRodadasTrilha(){
  const v = prompt('Quantas rodadas a trilha deve ter? (hoje: ' + trilhaDados.trilha.rodadas + ')', trilhaDados.trilha.rodadas);
  if(v == null) return;
  try { await apiTrilha('trilha_mudar', {id: trilhaAberta, rodadas: parseInt(v, 10) || 0}); trilhaDados = await apiTrilha('trilha_ver', {id: trilhaAberta}); renderTrilha(); }
  catch(e){ alert(e.message); }
}
async function excluirTrilha(){
  if(!confirm('Excluir a trilha "' + trilhaDados.trilha.nome + '"? Os códigos param de funcionar e as respostas dos alunos são apagadas do servidor.')) return;
  try { await apiTrilha('trilha_excluir', {id: trilhaAberta}); toast('Trilha excluída'); fecharTrilha(); }
  catch(e){ alert(e.message); }
}

// ---------- arquivos: códigos (PDF), relatório (PDF) e planilha (CSV)
function csvTrilha(){
  const D = trilhaDados, T = D.trilha, E = estatTrilha(D), cel = x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
  const num = x => x == null ? '' : String(Math.round(x * 10) / 10).replace('.', ',');
  const L = [['Aluno', 'RA', 'Código', ...T.calendario.map(c => 'Rodada ' + (c.k + 1) + ' (' + fmtDM(c.abre) + ')'), 'Rodadas feitas', 'Média'].map(cel).join(';')];
  E.linhas.forEach(l => L.push([l.a.nome, l.a.ra, l.a.codigo, ...l.notas.map(num), l.feitas, num(l.media)].map(cel).join(';')));
  L.push(''); L.push(['Tema', 'Respostas certas', 'Total', '% de acerto'].map(cel).join(';'));
  E.temas.forEach(x => L.push([x.tema, x.certas, x.total, num(x.pct)].map(cel).join(';')));
  baixarBlob(new Blob(['﻿' + L.join('\r\n')], {type: 'text/csv;charset=utf-8'}), nomeArq(T.nome) + '_notas.csv');
}
async function pdfCodigosTrilha(){
  await comProgresso('Gerando os códigos…', async () => {
    await pdfLibs();
    const D = trilhaDados, T = D.trilha, s = PDFGEN.san, {jsPDF} = window.jspdf, doc = new jsPDF({unit: 'mm', format: 'a4'});
    const al = D.alunos.filter(a => a.ativo), base = linkAluno(), curto = linkAlunoCurto();
    const W = 90, H = 52, X0 = 12, Y0 = 16, GX = 6, GY = 4;
    al.forEach((a, i) => {
      const p = i % 10; if(i && !p) doc.addPage();
      const x = X0 + (p % 2) * (W + GX), y = Y0 + Math.floor(p / 2) * (H + GY);
      doc.setLineDashPattern([1.5, 1.5], 0); doc.setDrawColor(150); doc.setLineWidth(0.2); doc.rect(x, y, W, H); doc.setLineDashPattern([], 0);
      doc.setFillColor(31, 56, 100); doc.rect(x, y, W, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(255); doc.text(doc.splitTextToSize(s(T.nome), W - 6)[0], x + 3, y + 5.4);
      doc.setTextColor(20, 26, 43); doc.setFontSize(10.5); doc.text(doc.splitTextToSize(s(a.nome), W - 36).slice(0, 2), x + 3, y + 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(94, 99, 120);
      doc.text('Seu código de acesso:', x + 3, y + 25);
      doc.setFont('courier', 'bold'); doc.setFontSize(19); doc.setTextColor(20, 26, 43); doc.text(a.codigo, x + 3, y + 33);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(94, 99, 120);
      doc.text(doc.splitTextToSize(s('Aponte a câmera do celular para o QR ou acesse ' + curto + ' e digite o código. Não passe o seu código para ninguém.'), W - 37), x + 3, y + 39.5);
      const q = qrcode(0, 'M'); q.addData(base + '#c=' + a.codigo); q.make();
      const n = q.getModuleCount(), lado = 30, m = lado / n, qx = x + W - lado - 3, qy = y + 12;
      doc.setFillColor(0, 0, 0);
      for(let r = 0; r < n; r++) for(let c = 0; c < n; c++) if(q.isDark(r, c)) doc.rect(qx + c * m, qy + r * m, m + 0.02, m + 0.02, 'F');
    });
    baixarBlob(doc.output('blob'), nomeArq(T.nome) + '_codigos.pdf');
  });
}
async function pdfRelatorioTrilha(){
  await comProgresso('Gerando o relatório…', async () => {
    await pdfLibs();
    const D = trilhaDados, T = D.trilha, E = estatTrilha(D), s = PDFGEN.san, {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit: 'mm', format: 'a4', orientation: 'landscape'}), PW = 297, M = 12;
    const vis = T.calendario.filter(c => c.estado !== 'futura').length || 1;
    const cab = () => {
      doc.setFillColor(31, 56, 100); doc.rect(0, 0, PW, 16, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(255); doc.text(s('Relatório da trilha · ' + T.nome), M, 10.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(s('Emitido em ' + new Date().toLocaleDateString('pt-BR')), PW - M, 10.5, {align: 'right'});
      doc.setTextColor(20, 26, 43);
    };
    cab();
    doc.setFontSize(9.5); doc.setTextColor(94, 99, 120);
    doc.text(s(T.alunos + ' alunos · ' + T.rodadas + ' rodadas de ' + T.porRodada + ' questões (uma a cada 15 dias) · ' + fmtData(T.calendario[0].abre) + ' a ' + fmtData(T.calendario[T.calendario.length - 1].ate) + ' · notas de 0 a 10'), M, 23);
    // tabela de notas
    const colNome = 78, colFim = 34, larg = (PW - 2 * M - colNome - colFim) / T.rodadas;
    let y = 30;
    const linhaCab = () => {
      doc.setFillColor(231, 237, 248); doc.rect(M, y - 4.5, PW - 2 * M, 6.5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 26, 43);
      doc.text('Aluno', M + 2, y);
      T.calendario.forEach((c, i) => doc.text('R' + (i + 1), M + colNome + larg * (i + .5), y, {align: 'center'}));
      doc.text('Feitas', M + colNome + larg * T.rodadas + 9, y, {align: 'center'}); doc.text(s('Média'), M + colNome + larg * T.rodadas + 25, y, {align: 'center'});
      y += 6.5;
    };
    linhaCab();
    const linha = (rot, vals, feitas, media, negrito) => {
      if(y > 196){ doc.addPage(); cab(); y = 26; linhaCab(); }
      doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(8.5); doc.setTextColor(20, 26, 43);
      doc.text(doc.splitTextToSize(s(rot), colNome - 4)[0], M + 2, y);
      vals.forEach((v, i) => { if(v != null && v < 6) doc.setTextColor(184, 50, 42); doc.text(v == null ? '-' : fmt(v), M + colNome + larg * (i + .5), y, {align: 'center'}); doc.setTextColor(20, 26, 43); });
      doc.text(feitas, M + colNome + larg * T.rodadas + 9, y, {align: 'center'}); doc.text(media == null ? '-' : fmt(media), M + colNome + larg * T.rodadas + 25, y, {align: 'center'});
      doc.setDrawColor(221, 226, 236); doc.setLineWidth(0.2); doc.line(M, y + 2, PW - M, y + 2); y += 6;
    };
    E.linhas.forEach(l => linha(l.a.nome, l.notas.map((n, i) => i < vis ? n : null), l.feitas + '/' + vis, l.media));
    const mm = E.linhas.filter(l => l.media != null);
    linha('Média da turma', E.porRodada.map(p => p.media), '', mm.length ? mm.reduce((s2, l) => s2 + l.media, 0) / mm.length : null, true);
    linha('Responderam', E.porRodada.map(() => null), '', null, false);
    y -= 6; E.porRodada.forEach((p, i) => { if(p.c.estado !== 'futura'){ doc.setFillColor(255, 255, 255); doc.rect(M + colNome + larg * i + 0.5, y - 3.6, larg - 1, 4.6, 'F'); doc.text(p.responderam + '/' + T.alunos, M + colNome + larg * (i + .5), y, {align: 'center'}); } }); y += 6;
    // temas
    if(E.temas.length){
      y += 6; if(y > 170){ doc.addPage(); cab(); y = 28; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Acerto da turma por tema (dos mais fracos para os mais fortes)', M, y); y += 7;
      E.temas.forEach(x => {
        if(y > 198){ doc.addPage(); cab(); y = 28; }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(20, 26, 43);
        doc.text(doc.splitTextToSize(s(x.tema), 110)[0], M + 2, y);
        const bx = M + 118, bw = 110;
        doc.setFillColor(231, 237, 248); doc.rect(bx, y - 3.2, bw, 4, 'F');
        if(x.pct < 50) doc.setFillColor(184, 50, 42); else if(x.pct < 70) doc.setFillColor(214, 150, 30); else doc.setFillColor(22, 120, 74);
        doc.rect(bx, y - 3.2, bw * x.pct / 100, 4, 'F');
        doc.text(Math.round(x.pct) + '%  (' + x.certas + '/' + x.total + ')', bx + bw + 4, y); y += 6.5;
      });
    }
    baixarBlob(doc.output('blob'), nomeArq(T.nome) + '_relatorio.pdf');
  });
}
