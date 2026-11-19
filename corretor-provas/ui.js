/* Corretor de Provas – interface */
'use strict';
let editando = false, abaAtual = 'aval';

// =================== navegação ===================
function aba(v){
  abaAtual = v;
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('on', e.id === 'v-' + v));
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  render(); window.scrollTo(0, 0);
}
function render(){
  const a = av();
  $('#subtitulo').textContent = a ? [a.disciplina, a.titulo].filter(Boolean).join(' · ') || 'Avaliação' : 'Nenhuma avaliação selecionada';
  if(abaAtual === 'aval') editando && a ? renderEditor() : renderLista();
  if(abaAtual === 'corrigir') renderCorrigir();
  if(abaAtual === 'turma') renderTurma();
}

// =================== lista de avaliações ===================
function statusAv(a){
  const g = alunosGerados(a).length, c = Object.keys(a.resultados || {}).length;
  if(!g) return '<span class="pill">rascunho</span>';
  if(c) return '<span class="pill ok">' + c + '/' + g + ' corrigidas</span>';
  return '<span class="pill warn">' + g + ' provas geradas</span>';
}
function renderLista(){
  const lista = Object.values(db.avaliacoes);
  const grupos = {};
  lista.forEach(a => { const k = (a.curso || 'Sem curso') + '\u0000' + (a.disciplina || 'Sem disciplina'); (grupos[k] = grupos[k] || []).push(a); });
  let h = '<div class="stack" style="margin-bottom:14px"><button class="btn acc" onclick="criar()">+ Nova avaliação</button></div>';
  if(!lista.length){
    h += '<div class="card"><h2>Nenhuma avaliação ainda</h2><p class="muted">Crie uma avaliação, envie o banco de questões e a lista de alunos (o cabeçalho da UNIFADAP já vem pronto), e o app gera uma prova diferente para cada aluno, com folha de respostas para correção pela câmera.</p>' +
         '<div class="stack" style="margin-top:12px"><button class="btn sec" onclick="carregarDemo()">Ver um exemplo pronto</button></div></div>';
  }
  Object.keys(grupos).sort((x, y) => x.localeCompare(y, 'pt-BR')).forEach(k => {
    const [curso, disc] = k.split('\u0000');
    h += '<div class="grupo"><div class="lbl" style="font-weight:700;text-transform:uppercase;letter-spacing:.04em">' + esc(curso) + '</div><h3>' + esc(disc) + '</h3>';
    grupos[k].sort((x, y) => (y.data || '').localeCompare(x.data || '')).forEach(a => {
      h += '<div class="card avcard' + (a.id === db.ativa ? ' ativa' : '') + '" onclick="abrir(\'' + a.id + '\')"><div class="row" style="align-items:center">' +
           '<div style="flex:1;min-width:0"><b>' + esc(a.titulo || 'Avaliação') + '</b><div class="lbl">' + (a.data ? fmtData(a.data) + ' · ' : '') +
           a.banco.length + ' questões no banco · ' + (alunosGerados(a).length || a.alunos.length) + ' alunos</div></div><div style="flex:none">' + statusAv(a) + '</div></div></div>';
    });
    h += '</div>';
  });
  h += '<div class="card"><h2>Outras opções</h2><div class="stack" style="margin-top:8px">' +
       '<button class="btn sec" onclick="$(\'#arqGab\').click()">Importar avaliação ou gabaritos (.json)</button>' +
       '<button class="btn sec" onclick="carregarDemo()">Carregar exemplo de demonstração</button>' +
       '<a class="btn sec" href="kit_teste.pdf" target="_blank" rel="noopener">Folhas de teste do exemplo (PDF)</a></div>' +
       '<p class="lbl" style="margin-top:10px">Tudo fica salvo só neste aparelho. Use "Exportar backup" em cada avaliação para guardar uma cópia ou passar para outro aparelho.</p></div>';
  $('#v-aval').innerHTML = h;
}
function criar(){ novaAvaliacao(); editando = true; render(); }
function abrir(id){ db.ativa = id; salvarDB(); editando = true; render(); window.scrollTo(0, 0); }
function voltarLista(){ editando = false; render(); }

// =================== editor ===================
function renderEditor(){
  const a = av(), g = alunosGerados(a), nRes = Object.keys(a.resultados || {}).length;
  const temas = {}; a.banco.forEach(q => temas[q.tema] = (temas[q.tema] || 0) + 1);
  const n = Math.min(+a.config.n, MAXQ);
  const comb = a.banco.length ? combinacoes(a.banco.length, Math.min(n, a.banco.length)) : 0;
  const imp = a.gerado && a.gerado.importado;
  let h = '<button class="link" onclick="voltarLista()">‹ Avaliações</button>';
  // 1. dados
  h += '<div class="card"><div class="passo">1</div><h2>Dados da avaliação</h2>' +
    campo('Curso', 'curso', a.curso, 'Ex.: Direito') + campo('Disciplina', 'disciplina', a.disciplina, 'Ex.: Economia') +
    campo('Ano / período (sai no cabeçalho)', 'ano', a.ano || '', 'Ex.: 1º ano (vazio = ano da data)') +
    campo('Nome do(a) professor(a)', 'professor', a.professor || '', 'Ex.: Prof. Dr. Fulano de Tal') +
    campo('Título', 'titulo', a.titulo, 'Ex.: Prova da Unidade 6') +
    '<label class="campo"><span>Chamada</span><input type="text" list="chamadas" value="' + esc(a.chamada || '') + '" placeholder="Ex.: Primeira chamada" onchange="setAv(\'chamada\', this.value.trim())"></label>' +
    '<datalist id="chamadas"><option>Primeira chamada</option><option>Segunda chamada</option><option>Exame</option><option>Recuperação</option></datalist>' +
    '<div class="row"><label class="campo"><span>Data</span><input type="date" value="' + esc(a.data) + '" onchange="setAv(\'data\', this.value)"></label>' +
    '<label class="campo"><span>Valor da prova (pontos)</span><input type="number" min="0" step="0.5" value="' + esc(a.valor_total) + '" onchange="setAv(\'valor_total\', +this.value)"></label></div>' +
    '<label class="campo"><span>Questões por prova</span><select onchange="setCfg(\'n\', +this.value)">' +
    Array.from({length: 10}, (_, i) => '<option' + (i + 1 === n ? ' selected' : '') + '>' + (i + 1) + '</option>').join('') + '</select></label>' +
    check('embaralharQuestoes', 'Embaralhar a ordem das questões', a.config.embaralharQuestoes) +
    check('frenteVerso', 'Impressão frente e verso (cada prova com nº par de páginas)', a.config.frenteVerso) +
    check('mostrarTema', 'Mostrar o tema/aula ao lado do número da questão', a.config.mostrarTema) + '</div>';
  // 2. cabeçalho
  const anoCab = a.ano || (a.data ? a.data.slice(0, 4) : String(new Date().getFullYear()));
  h += '<div class="card"><div class="passo">2</div><h2>Cabeçalho</h2>' +
    (a.cabecalho ? '<img class="cab" src="' + a.cabecalho.dataUrl + '" alt="Cabeçalho"><p class="lbl" style="margin-top:6px">Cabeçalho próprio enviado para esta avaliação.</p>'
     : '<div class="cabpad"><img src="img/logo_unifadap.png" alt="UNIFADAP"><div><b>' + esc([(a.curso || 'CURSO').toUpperCase(), anoCab].join(' – ')) + '</b><b>' +
       esc([a.titulo, a.chamada].filter(Boolean).join(' – ') || 'Tipo de prova') + '</b><b><i>' + esc((a.disciplina || 'DISCIPLINA').toUpperCase()) + '</i></b></div></div>' +
       '<p class="muted" style="margin-top:6px">Cabeçalho padrão da UNIFADAP, preenchido sozinho com os dados do passo 1. Não precisa enviar nada.</p>') +
    '<div class="row" style="margin-top:10px">' +
    (a.cabecalho ? '<button class="btn sec" onclick="setAv(\'cabecalho\', null)">Voltar ao padrão UNIFADAP</button><button class="btn sec" onclick="$(\'#arqCab\').click()">Trocar</button>'
     : '<button class="btn sec" onclick="$(\'#arqCab\').click()">Usar outro cabeçalho (imagem ou PDF)</button>') + '</div></div>';
  // 3. banco
  h += '<div class="card"><div class="passo">3</div><h2>Banco de questões</h2>' +
    (a.banco.length ? '<p><b>' + a.banco.length + ' questões</b> em ' + Object.keys(temas).length + ' tema(s):</p><ul class="temas">' +
       Object.entries(temas).map(([t, c]) => '<li><span>' + esc(t) + '</span><b>' + c + '</b></li>').join('') + '</ul>'
     : '<p class="muted">Preencha a planilha modelo (uma questão por linha) e envie aqui. Aceita Excel (.xlsx) ou CSV.</p>') +
    '<div class="row" style="margin-top:10px"><button class="btn sec" onclick="baixarModeloBanco()">Baixar planilha modelo</button>' +
    '<button class="btn sec" onclick="$(\'#arqBanco\').click()">' + (a.banco.length ? 'Substituir banco' : 'Enviar planilha') + '</button></div>' +
    (a.banco.length ? '<button class="link" style="margin-top:8px" onclick="verBanco()">Ver questões do banco</button>' : '') + '</div>';
  // 4. alunos
  h += '<div class="card"><div class="passo">4</div><h2>Alunos</h2>' +
    (a.alunos.length ? '<p><b>' + a.alunos.length + ' alunos</b> na lista.</p><details><summary class="lbl">Ver lista</summary><ol class="alunos">' +
       a.alunos.map(x => '<li>' + esc(x.nome) + (x.ra ? ' <span class="lbl">RA ' + esc(x.ra) + '</span>' : '') + (x.cpf ? ' <span class="lbl">CPF ' + esc(x.cpf) + '</span>' : '') + '</li>').join('') + '</ol></details>'
     : '<p class="muted">Envie uma planilha com as colunas Nome, RA e CPF, ou cole a lista abaixo (uma linha por aluno: nome, RA e/ou CPF separados por tabulação ou ponto e vírgula). Do CPF, o app guarda e imprime só os 3 primeiros números e os 2 dígitos finais.</p>') +
    '<textarea id="txtAlunos" rows="4" placeholder="Maria da Silva;12345;123.456.789-01&#10;João Souza;12346;987.654.321-00"></textarea>' +
    '<div class="row" style="margin-top:8px"><button class="btn sec" onclick="usarListaColada()">Usar lista colada</button>' +
    '<button class="btn sec" onclick="$(\'#arqAlunos\').click()">Enviar planilha</button></div></div>';
  // 5. provas
  const pronto = a.banco.length && a.alunos.length;
  h += '<div class="card"><div class="passo">5</div><h2>Provas</h2>';
  if(imp) h += '<p class="muted">Avaliação importada de um arquivo de gabaritos: ' + g.length + ' provas prontas para correção.</p>';
  else if(!pronto) h += '<p class="muted">Complete o banco de questões e a lista de alunos para gerar as provas.</p>';
  else {
    h += '<p>' + a.alunos.length + ' provas com ' + Math.min(n, a.banco.length) + ' questões cada, sorteadas de ' + a.banco.length + ' (' +
         (comb >= a.alunos.length ? 'todas as combinações diferentes' : 'só há ' + comb + ' combinações possíveis: algumas provas vão repetir questões, mas com alternativas embaralhadas') + ').</p>' +
         (n > a.banco.length ? '<div class="alerta">O banco tem menos questões que o número por prova.</div>' : '');
    h += '<div class="stack" style="margin-top:10px"><button class="btn acc" onclick="baixarProvas()">' + (g.length ? 'Baixar provas (PDF)' : 'Gerar provas (PDF)') + '</button>';
    if(g.length) h += '<button class="btn sec" onclick="baixarGabarito()">Baixar gabarito do professor (PDF)</button>' +
                      '<button class="btn sec" onclick="sortearDeNovo()">Sortear as provas de novo</button>';
    h += '</div>';
    if(g.length) h += '<p class="lbl" style="margin-top:8px">Provas geradas em ' + new Date(a.gerado.quando).toLocaleString('pt-BR') + '. Para alterar banco, alunos ou regras depois disso, sorteie de novo.</p>';
  }
  h += '</div>';
  // 6. correção e relatório
  if(g.length) h += '<div class="card"><div class="passo">6</div><h2>Correção e relatório</h2><p>' + nRes + ' de ' + g.length + ' provas corrigidas.</p>' +
    '<div class="stack" style="margin-top:10px"><button class="btn" onclick="aba(\'corrigir\')">Corrigir provas</button>' +
    '<button class="btn sec" onclick="baixarRelatorio()">Baixar relatório de notas (PDF)</button>' +
    '<button class="btn sec" onclick="exportarCSV()">Exportar notas (planilha)</button></div></div>';
  h += '<div class="card"><h2>Backup</h2><div class="stack" style="margin-top:8px"><button class="btn sec" onclick="exportarBackup()">Exportar backup (.json)</button>' +
       '<button class="btn sec" style="color:var(--bad)" onclick="excluirAv()">Excluir avaliação</button></div></div>';
  $('#v-aval').innerHTML = h;
}
function campo(rot, k, v, ph){ return '<label class="campo"><span>' + rot + '</span><input type="text" value="' + esc(v) + '" placeholder="' + esc(ph) + '" onchange="setAv(\'' + k + '\', this.value.trim())"></label>'; }
function check(k, rot, v){ return '<label class="chk"><input type="checkbox"' + (v ? ' checked' : '') + ' onchange="setCfg(\'' + k + '\', this.checked)"> ' + rot + '</label>'; }
function alteraGerado(){
  const a = av(); if(!a.gerado || a.gerado.importado) return true;
  const nRes = Object.keys(a.resultados || {}).length;
  if(!confirm('As provas já foram geradas' + (nRes ? ' e ' + nRes + ' foram corrigidas' : '') + '. Essa mudança exige sortear as provas de novo' + (nRes ? ' e apaga as correções' : '') + '. Continuar?')) return false;
  a.gerado = null; a.resultados = {}; return true;
}
function setAv(k, v){
  const a = av();
  if(k === 'valor_total' && a.resultados){ a.valor_total = v; Object.entries(a.resultados).forEach(([c, r]) => { const al = alunosGerados(a).find(x => x.codigo === c); if(al) Object.assign(r, calcular(a, al, r.marcadas)); }); }
  else a[k] = v;
  if(k === 'professor' && v) db.professor = v;
  salvarDB(); render();
}
function setCfg(k, v){
  const a = av();
  if(['n', 'embaralharQuestoes'].includes(k) && a.gerado && !alteraGerado()) return render();
  a.config[k] = v; salvarDB(); render();
}
async function onCabecalho(inp){
  const f = inp.files[0]; inp.value = ''; if(!f) return;
  toast('Lendo o cabeçalho…');
  try { av().cabecalho = await lerCabecalho(f); salvarDB(); render(); toast('Cabeçalho pronto'); }
  catch(e){ alert('Não consegui ler o cabeçalho.\n' + e.message); }
}
async function onBanco(inp){
  const f = inp.files[0]; inp.value = ''; if(!f) return;
  try {
    const {banco, erros} = interpretarBanco(await lerPlanilha(f));
    if(!banco.length) throw new Error(erros.slice(0, 5).join('\n') || 'Nenhuma questão encontrada.');
    if(erros.length && !confirm(banco.length + ' questões lidas. ' + erros.length + ' linha(s) com problema serão ignoradas:\n\n' + erros.slice(0, 8).join('\n') + (erros.length > 8 ? '\n…' : '') + '\n\nContinuar?')) return;
    if(!alteraGerado()) return;
    av().banco = banco; salvarDB(); render(); toast(banco.length + ' questões carregadas');
  } catch(e){ alert('Não consegui ler o banco de questões.\n' + e.message); }
}
async function onAlunosArq(inp){
  const f = inp.files[0]; inp.value = ''; if(!f) return;
  try { definirAlunos(interpretarAlunos(await lerPlanilha(f))); } catch(e){ alert('Não consegui ler a lista de alunos.\n' + e.message); }
}
function usarListaColada(){
  const t = $('#txtAlunos').value; if(!t.trim()) return toast('Cole a lista de alunos no campo');
  definirAlunos(interpretarAlunos([['Nome', 'RA']].concat(linhasDeTexto(t))));
}
function definirAlunos(lista){
  if(!lista.length) return alert('Nenhum aluno encontrado. Confira se há uma coluna "Nome".');
  if(!alteraGerado()) return;
  av().alunos = lista; salvarDB(); render(); toast(lista.length + ' alunos carregados');
}
function verBanco(){
  const a = av();
  $('#resConteudo').innerHTML = '<button class="link" onclick="fecharRes()">‹ Voltar</button><h2 style="margin:8px 0 12px">Banco de questões (' + a.banco.length + ')</h2>' +
    a.banco.map((q, i) => '<div class="card"><div class="lbl">' + (i + 1) + ' · ' + esc(q.tema) + (q.nivel ? ' · ' + esc(q.nivel) : '') + '</div><p style="margin:4px 0 8px">' + esc(q.enunciado) + '</p>' +
      q.alts.map((x, k) => '<div class="' + (k === q.correta ? 'certa' : '') + '"><b>' + LETRAS[k] + ')</b> ' + esc(x) + '</div>').join('') + '</div>').join('');
  $('#res').classList.add('on'); $('#res').scrollTop = 0;
}
function garantirGerado(){
  const a = av();
  if(!a.gerado){ a.gerado = sortear(a); a.resultados = {}; salvarDB(); }
  return a;
}
async function comProgresso(msg, fn){
  const o = $('#ocupado'); $('#ocupadoTxt').textContent = msg; o.classList.add('on');
  await new Promise(r => setTimeout(r, 60));
  try { await fn(); } catch(e){ console.error(e); alert('Ocorreu um erro: ' + e.message); } finally { o.classList.remove('on'); }
}
function baixarProvas(){
  comProgresso('Gerando as provas…', async () => {
    await pdfLibs(); const a = garantirGerado();
    const doc = PDFGEN.gerarProvas(a, LAYOUTS, {mostrarTema: a.config.mostrarTema});
    baixarBlob(doc.output('blob'), 'provas_' + nomeArq(a.disciplina + '_' + a.titulo) + '.pdf'); render();
  });
}
function baixarGabarito(){
  comProgresso('Gerando o gabarito…', async () => { await pdfLibs(); const a = av(); baixarBlob(PDFGEN.gerarGabarito(a).output('blob'), 'gabarito_' + nomeArq(a.disciplina + '_' + a.titulo) + '.pdf'); });
}
function baixarRelatorio(){
  comProgresso('Gerando o relatório…', async () => { await pdfLibs(); const a = av(); baixarBlob(PDFGEN.gerarRelatorio(a).output('blob'), 'relatorio_' + nomeArq(a.disciplina + '_' + a.titulo) + '.pdf'); });
}
function sortearDeNovo(){
  const a = av(), nRes = Object.keys(a.resultados || {}).length;
  if(!confirm('Sortear novas provas? As provas já impressas deixam de valer' + (nRes ? ' e as ' + nRes + ' correções serão apagadas' : '') + '.')) return;
  a.config.semente = (a.config.semente || 1) + 1; a.gerado = null; a.resultados = {}; salvarDB(); render(); toast('Pronto. Gere as provas de novo.');
}
function exportarBackup(){
  const a = av();
  baixarBlob(new Blob([JSON.stringify({formato: 'corretor-provas-avaliacao', id: a.id, alunos: alunosGerados(a).length ? alunosGerados(a) : [{codigo: 'X', nome: 'x', gabarito: 'A'}], avaliacao: a})], {type: 'application/json'}),
    'backup_' + nomeArq(a.disciplina + '_' + a.titulo) + '.json');
}
function excluirAv(){
  const a = av();
  if(!confirm('Excluir "' + (a.titulo || 'Avaliação') + '" com banco, alunos, provas e correções deste aparelho?')) return;
  delete db.avaliacoes[a.id]; db.ativa = null; editando = false; salvarDB(); render();
}
function lerArquivoGab(inp){
  const f = inp.files[0]; inp.value = ''; if(!f) return;
  f.text().then(t => {
    try {
      const nova = deGabaritoJSON(JSON.parse(t));
      if(db.avaliacoes[nova.id] && !confirm('Esta avaliação já está no aparelho. Substituir?')) return;
      db.avaliacoes[nova.id] = nova; db.ativa = nova.id; salvarDB(); editando = true; aba('aval'); toast('Avaliação importada');
    } catch(e){ alert('Não consegui ler o arquivo.\n' + e.message); }
  });
}
function carregarDemo(){
  const j = {id: 'DEMO', prova: 'Prova de demonstração', curso: 'Exemplo', disciplina: 'Demonstração', valor_total: 10, alunos: [
    {codigo: 'P01', nome: 'Aluno Exemplo Um', ra: '000001', gabarito: 'CAEBDACE'},
    {codigo: 'P02', nome: 'Aluna Exemplo Dois', ra: '000002', gabarito: 'BDACEBDA'},
    {codigo: 'P03', nome: 'Aluno Exemplo Três', ra: '000003', gabarito: 'EDCBAEDC'}]};
  const nova = deGabaritoJSON(j);
  if(db.avaliacoes.DEMO) nova.resultados = db.avaliacoes.DEMO.resultados || {};
  db.avaliacoes.DEMO = nova; db.ativa = 'DEMO'; salvarDB(); editando = false; aba('corrigir'); toast('Exemplo carregado');
}

// =================== corrigir ===================
function seletorAv(onde){
  const lista = Object.values(db.avaliacoes).filter(a => alunosGerados(a).length);
  if(!lista.length) return '';
  return '<label class="campo"><span>Avaliação</span><select onchange="db.ativa=this.value;salvarDB();render()">' +
    lista.map(a => '<option value="' + a.id + '"' + (a.id === db.ativa ? ' selected' : '') + '>' + esc([a.curso, a.disciplina, a.titulo].filter(Boolean).join(' · ')) + '</option>').join('') + '</select></label>';
}
function renderCorrigir(){
  const a = av(), g = alunosGerados(a);
  if(!a || !g.length){
    $('#v-corrigir').innerHTML = (seletorAv() ? '<div class="card">' + seletorAv() + '</div>' : '') + '<div class="card"><h2>Nada para corrigir ainda</h2><p class="muted">Gere as provas de uma avaliação (aba Avaliações) ou carregue o exemplo de demonstração.</p>' +
      '<div class="stack" style="margin-top:12px"><button class="btn sec" onclick="aba(\'aval\')">Ir para Avaliações</button><button class="btn sec" onclick="carregarDemo()">Carregar exemplo</button></div></div>';
    return;
  }
  const notas = Object.values(a.resultados || {}).map(r => r.nota);
  $('#v-corrigir').innerHTML = '<div class="card">' + seletorAv() + '<div class="lbl" style="margin-top:6px">Corrigidas</div><div class="big">' + notas.length +
    '<span class="muted" style="font-size:22px"> / ' + g.length + '</span></div><div class="kpis">' +
    '<div class="kpi"><span class="lbl">Média</span><b>' + (notas.length ? fmt(notas.reduce((x, y) => x + y, 0) / notas.length) : '–') + '</b></div>' +
    '<div class="kpi"><span class="lbl">Maior</span><b>' + (notas.length ? fmt(Math.max(...notas)) : '–') + '</b></div>' +
    '<div class="kpi"><span class="lbl">Menor</span><b>' + (notas.length ? fmt(Math.min(...notas)) : '–') + '</b></div></div></div>' +
    '<div class="stack"><button class="btn acc" onclick="abrirCamera()"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Corrigir com a câmera</button>' +
    '<button class="btn sec" onclick="$(\'#arqFoto\').click()">Corrigir a partir de uma foto</button></div>' +
    '<p class="lbl" style="margin-top:12px;text-align:center">Se a folha for de outra avaliação deste aparelho, o app troca sozinho.</p>';
}

// =================== turma ===================
function renderTurma(){
  const a = av(), g = alunosGerados(a);
  let h = '<div class="card">' + seletorAv();
  if(!a || !g.length){ $('#v-turma').innerHTML = h + '<div class="vazio">Nenhuma prova gerada nesta avaliação.</div></div>'; return; }
  const res = a.resultados || {};
  h += '<div class="row" style="align-items:center;margin-top:6px"><h2 style="margin:0">Turma (' + Object.keys(res).length + '/' + g.length + ')</h2></div>' +
    '<div class="row" style="margin-top:10px"><button class="btn small sec" onclick="baixarRelatorio()">Relatório (PDF)</button><button class="btn small sec" onclick="exportarCSV()">Planilha (CSV)</button></div>' +
    '<input type="text" id="busca" placeholder="Buscar aluno" oninput="filtrarTurma()" style="margin-top:12px"><ul class="lista" id="lista"></ul></div>';
  $('#v-turma').innerHTML = h; filtrarTurma();
}
function filtrarTurma(){
  const a = av(), res = a.resultados || {}, ul = $('#lista'), q = ($('#busca').value || '').toLowerCase(); ul.innerHTML = '';
  alunosGerados(a).slice().sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
    .filter(x => !q || (x.nome + ' ' + (x.ra || '') + ' ' + x.codigo).toLowerCase().includes(q))
    .forEach(al => {
      const r = res[al.codigo], li = document.createElement('li');
      li.innerHTML = '<div class="nome"><b></b><span class="lbl"></span></div>' + (r ? (r.pendencias ? '<span class="pill warn">' + r.pendencias + ' p/ conferir</span> ' : '') +
        '<span class="nota">' + fmt(r.nota) + '</span>' : '<span class="pill">pendente</span>');
      li.querySelector('b').textContent = al.nome;
      li.querySelector('.lbl').textContent = 'RA ' + (al.ra || '–') + ' · ' + al.codigo + (r ? ' · ' + r.acertos + '/' + r.n + ' acertos' : '');
      li.onclick = () => r ? mostrarResultado({aluno: al, marcadas: r.marcadas.slice(), status: r.status.slice(), salvo: true}) : toast('Ainda não corrigida');
      ul.appendChild(li);
    });
}
function exportarCSV(){
  const a = av(); if(!a) return;
  const g = alunosGerados(a), n = Math.max(...g.map(x => x.gabarito.length)), res = a.resultados || {};
  const cab = ['Código', 'Nome', 'RA', 'Situação', 'Acertos', 'Questões', 'Nota']; for(let i = 1; i <= n; i++) cab.push('Q' + i); cab.push('Gabarito', 'Conferir');
  const linhas = [cab];
  g.slice().sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')).forEach(al => {
    const r = res[al.codigo], l = [al.codigo, al.nome, al.ra || '', r ? 'corrigida' : 'pendente', r ? r.acertos : '', al.gabarito.length, r ? fmt(r.nota) : ''];
    for(let i = 0; i < n; i++) l.push(r ? (r.marcadas[i] || '-') : '');
    l.push(al.gabarito, r ? r.status.map((s, i) => (s !== 'ok' && s !== 'manual') ? 'Q' + (i + 1) + ' ' + s : '').filter(Boolean).join(', ') : '');
    linhas.push(l);
  });
  const csv = '﻿' + linhas.map(l => l.map(x => { x = String(x); return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(';')).join('\r\n');
  baixarBlob(new Blob([csv], {type: 'text/csv;charset=utf-8'}), 'notas_' + nomeArq(a.disciplina + '_' + a.titulo) + '.csv');
}

// =================== leitura ===================
function imagemDeFonte(src, w, h, max){
  const s = Math.min(1, max / Math.max(w, h)), cw = Math.round(w * s), ch = Math.round(h * s);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const ctx = c.getContext('2d', {willReadFrequently: true}); ctx.drawImage(src, 0, 0, cw, ch);
  return {canvas: c, img: ctx.getImageData(0, 0, cw, ch)};
}
function interpretar(r){
  if(!r.ok){
    if(r.erro === 'qr') return {erro: 'Procurando o QR code da folha…'};
    if(r.erro === 'qr-formato') return {erro: 'Este QR code não é de uma folha de respostas.'};
    return {erro: 'QR lido. Enquadre também os 4 quadrados pretos.'};
  }
  let a = av();
  if(!a || r.qr.prova !== a.id){
    if(db.avaliacoes[r.qr.prova] && alunosGerados(db.avaliacoes[r.qr.prova]).length){ db.ativa = r.qr.prova; salvarDB(); a = av(); toast('Avaliação trocada: ' + (a.titulo || a.id)); }
    else return {erro: 'Esta folha é de uma avaliação que não está neste aparelho (' + r.qr.prova + ').'};
  }
  const aluno = alunosGerados(a).find(x => x.codigo === r.qr.codigo);
  if(!aluno) return {erro: 'Prova ' + r.qr.codigo + ' não está nesta avaliação.'};
  const n = aluno.gabarito.length;
  return {aluno, marcadas: r.respostas.slice(0, n).map(x => x.letra), status: r.respostas.slice(0, n).map(x => x.status), debug: r.debug};
}

// =================== câmera ===================
let stream = null, rodando = false, ultimo = null, iguais = 0, luz = false;
async function abrirCamera(){
  if(!alunosGerados(av()).length) return toast('Gere as provas primeiro');
  $('#cam').classList.add('on'); $('#camStatus').textContent = 'Abrindo a câmera…';
  try { stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1920}, height: {ideal: 1080}}}); }
  catch(e){ $('#camStatus').textContent = 'Sem acesso à câmera. Use "Corrigir a partir de uma foto".'; return; }
  const v = $('#video'); v.srcObject = stream; await v.play().catch(() => {});
  const tr = stream.getVideoTracks()[0], cap = tr.getCapabilities ? tr.getCapabilities() : {};
  $('#btnLuz').style.display = cap.torch ? '' : 'none';
  rodando = true; ultimo = null; iguais = 0; loop();
}
function fecharCamera(){
  rodando = false; luz = false;
  if(stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
  $('#cam').classList.remove('on'); const o = $('#ov'); o.getContext('2d').clearRect(0, 0, o.width, o.height);
}
function alternarLuz(){ if(!stream) return; luz = !luz; stream.getVideoTracks()[0].applyConstraints({advanced: [{torch: luz}]}).catch(() => {}); }
function desenharOverlay(r, fw, fh){
  const o = $('#ov'); o.width = o.clientWidth; o.height = o.clientHeight;
  const ctx = o.getContext('2d'); ctx.clearRect(0, 0, o.width, o.height);
  if(!r || !r.ok) return;
  const s = Math.min(o.width / fw, o.height / fh), ox = (o.width - fw * s) / 2, oy = (o.height - fh * s) / 2;
  ctx.strokeStyle = '#3ce08f'; ctx.lineWidth = 3; ctx.beginPath();
  r.debug.cantos.forEach((c, i) => { const x = ox + c[0] * s, y = oy + c[1] * s; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.closePath(); ctx.stroke();
}
function loop(){
  if(!rodando) return;
  const v = $('#video');
  if(v.readyState < 2){ setTimeout(loop, 150); return; }
  const fw = v.videoWidth, fh = v.videoHeight, {img} = imagemDeFonte(v, fw, fh, 1280);
  let r; try { r = OMR.analisar(img, LAYOUTS, {escalasQR: [1, 0.6]}); } catch(e){ r = {ok: false, erro: 'qr'}; }
  const k = img.width / fw;
  if(r.ok) r.debug.cantos = r.debug.cantos.map(c => [c[0] / k, c[1] / k]);
  desenharOverlay(r, fw, fh);
  const it = interpretar(r);
  if(it.erro){ $('#camStatus').textContent = it.erro; iguais = 0; ultimo = null; setTimeout(loop, 120); return; }
  const assin = it.aluno.codigo + ':' + it.marcadas.map(x => x || '-').join('');
  if(assin === ultimo) iguais++; else { ultimo = assin; iguais = 1; }
  $('#camStatus').textContent = it.aluno.nome + ' — segure firme…';
  if(iguais >= 2){
    const snap = imagemDeFonte(v, fw, fh, 1000).canvas;
    if(navigator.vibrate) navigator.vibrate(60);
    fecharCamera();
    const r2 = OMR.analisar(snap.getContext('2d').getImageData(0, 0, snap.width, snap.height), LAYOUTS, {escalasQR: [1, 0.6, 0.4]});
    const it2 = r2.ok ? interpretar(r2) : it;
    mostrarResultado(Object.assign({}, it2.erro ? it : it2, {snap, debug: r2.ok ? r2.debug : null}));
    return;
  }
  setTimeout(loop, 60);
}
function lerFoto(inp){
  const f = inp.files[0]; inp.value = ''; if(!f) return;
  const url = URL.createObjectURL(f), im = new Image();
  im.onload = () => {
    URL.revokeObjectURL(url); let melhor = null;
    for(const max of [1600, 2200, 1100]){
      const {canvas, img} = imagemDeFonte(im, im.naturalWidth, im.naturalHeight, max);
      const r = OMR.analisar(img, LAYOUTS, {escalasQR: [1, 0.6, 0.4], inverter: true}), it = interpretar(r);
      if(!it.erro){ mostrarResultado(Object.assign(it, {snap: canvas, debug: r.debug})); return; }
      melhor = melhor || it.erro;
    }
    alert('Não consegui ler esta foto.\n' + melhor + '\n\nFotografe a folha inteira, com boa luz e os 4 quadrados pretos visíveis.');
  };
  im.src = url;
}

// =================== resultado ===================
let atual = null;
function mostrarResultado(it){
  atual = it;
  const a = av(), al = it.aluno, n = al.gabarito.length, calc = calcular(a, al, it.marcadas), ja = (a.resultados || {})[al.codigo];
  const pend = it.status.filter(s => s !== 'ok' && s !== 'manual').length;
  const nomes = {ok: '', branco: 'branco', multipla: 'dupla', duvida: 'dúvida', manual: 'editada'};
  let linhas = '';
  for(let i = 0; i < n; i++){
    const m = it.marcadas[i], g = al.gabarito[i], st = it.status[i];
    const cls = (st !== 'ok' && st !== 'manual') ? 'warn' : (m === g ? 'ok' : 'bad');
    linhas += '<tr><td><b>' + (i + 1) + '</b></td><td><span class="ch ' + cls + '" onclick="abrirPicker(' + i + ')">' + (m || '–') + '</span> ' +
      (nomes[st] ? '<span class="pill ' + (st === 'manual' ? '' : 'warn') + '">' + nomes[st] + '</span>' : '') + '</td><td><span class="ch">' + g + '</span></td><td>' +
      (m === g ? '<span class="pill ok">certa</span>' : '<span class="pill bad">errada</span>') + '</td></tr>';
  }
  $('#resConteudo').innerHTML =
    '<div class="card"><div class="lbl">' + esc(al.codigo) + ' · RA ' + esc(al.ra || '–') + ' · ' + esc([a.disciplina, a.titulo].filter(Boolean).join(' · ')) + '</div><h2 style="font-size:20px">' + esc(al.nome) + '</h2>' +
    '<div class="row" style="margin-top:8px;align-items:flex-end"><div><div class="lbl">Nota</div><div class="big">' + fmt(calc.nota) + '</div></div>' +
    '<div><div class="lbl">Acertos</div><div class="big" style="font-size:28px">' + calc.acertos + '/' + n + '</div></div></div>' +
    (pend ? '<div class="alerta">' + pend + (pend > 1 ? ' questões precisam' : ' questão precisa') + ' de conferência. Toque na resposta para corrigir.</div>' : '') +
    (ja && !it.salvo ? '<div class="alerta bad">Esta prova já foi corrigida (nota ' + fmt(ja.nota) + '). Salvar vai substituir.</div>' : '') + '</div>' +
    '<div class="card"><table class="qgrid"><tr><th>Questão</th><th>Marcada</th><th>Gabarito</th><th></th></tr>' + linhas + '</table>' +
    '<p class="lbl" style="margin-top:8px">Questão em branco ou com dupla marcação conta como errada, a menos que você escolha a resposta.</p></div>' +
    '<div class="card" id="cardSnap" style="display:none"><div class="lbl">Imagem lida</div><canvas class="snap" id="snap"></canvas></div>' +
    '<div class="stack">' +
    (it.salvo ? '<button class="btn acc" onclick="salvarAtual(false)">Salvar alterações</button><button class="btn sec" onclick="fecharRes()">Voltar</button>' +
                '<button class="btn sec" style="color:var(--bad)" onclick="excluirAtual()">Excluir esta correção</button>'
              : '<button class="btn acc" onclick="salvarAtual(true)">Salvar e próxima</button><button class="btn sec" onclick="salvarAtual(false)">Salvar</button>' +
                '<button class="btn sec" onclick="fecharRes(true)">Descartar e ler de novo</button>') + '</div>';
  $('#res').classList.add('on'); $('#res').scrollTop = 0;
  if(it.snap) desenharSnap();
}
function desenharSnap(){
  const it = atual, c = $('#snap'); if(!c || !it.snap) return;
  $('#cardSnap').style.display = ''; c.width = it.snap.width; c.height = it.snap.height;
  const ctx = c.getContext('2d'); ctx.drawImage(it.snap, 0, 0);
  if(!it.debug) return;
  const g = it.aluno.gabarito;
  it.debug.bolhas.forEach(b => {
    if(b.q >= g.length) return;
    const letra = LETRAS[b.j], marc = it.marcadas[b.q], certa = g[b.q];
    if(letra !== marc && letra !== certa) return;
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.p[0], b.p[1], b.rp * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = letra === certa ? '#16a35f' : '#e0283c'; ctx.stroke();
  });
}
function abrirPicker(i){
  $('#pkTitulo').textContent = 'Questão ' + (i + 1);
  const o = $('#pkOpts'); o.innerHTML = '';
  [...LETRAS, null].forEach(L => {
    const b = document.createElement('button'); b.className = 'ch' + (atual.marcadas[i] === L ? ' ok' : ''); b.textContent = L || '–';
    b.onclick = () => { atual.marcadas[i] = L; atual.status[i] = 'manual'; fecharPicker(); mostrarResultado(atual); };
    o.appendChild(b);
  });
  $('#picker').classList.add('on');
}
function fecharPicker(){ $('#picker').classList.remove('on'); }
function salvarAtual(proxima){
  const a = av(), al = atual.aluno, calc = calcular(a, al, atual.marcadas);
  a.resultados = a.resultados || {};
  a.resultados[al.codigo] = {marcadas: atual.marcadas, status: atual.status, acertos: calc.acertos, n: calc.n, nota: calc.nota,
    pendencias: atual.status.filter(s => s !== 'ok' && s !== 'manual').length, quando: new Date().toISOString()};
  salvarDB(); toast('Salvo: ' + al.nome + ' — nota ' + fmt(calc.nota));
  $('#res').classList.remove('on'); render();
  if(proxima) abrirCamera();
}
function excluirAtual(){
  if(!confirm('Excluir a correção de ' + atual.aluno.nome + '?')) return;
  delete av().resultados[atual.aluno.codigo]; salvarDB(); fecharRes(); render();
}
function fecharRes(lerDeNovo){ $('#res').classList.remove('on'); if(lerDeNovo) abrirCamera(); }

let tt = null;
function toast(m){ const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2600); }
carregarDB().then(() => { aba(Object.values(db.avaliacoes).some(a => alunosGerados(a).length) ? 'aval' : 'aval'); });
