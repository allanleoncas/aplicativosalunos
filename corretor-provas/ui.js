/* Corretor de Provas – interface */
'use strict';
let editando = false, abaAtual = 'inicio', corrigindo = false;

// =================== navegação ===================
function aba(v){
  abaAtual = v;
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('on', e.id === 'v-' + v));
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  render(); window.scrollTo(0, 0);
}
function render(){
  migrarTurmas();
  const a = av();
  Object.values(db.avaliacoes).forEach(atualizarValores);
  $('#subtitulo').textContent = a ? [a.disciplina, a.titulo].filter(Boolean).join(' · ') || 'Avaliação' : 'Nenhuma avaliação selecionada';
  if(abaAtual === 'inicio') renderInicio();
  if(abaAtual === 'aval') editando && a ? renderEditor() : renderLista();
  if(abaAtual === 'corrigir') renderCorrigir();
  if(abaAtual === 'turma') renderTurma();
  if(abaAtual === 'admin') renderAdmin();
}

// =================== painel inicial ===================
function hojeISO(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function diasAte(iso){ return Math.round((new Date(iso + 'T12:00:00') - new Date(hojeISO() + 'T12:00:00')) / 86400000); }
function quando(iso){
  const d = diasAte(iso);
  return d === 0 ? 'hoje' : d === 1 ? 'amanhã' : d > 1 ? 'em ' + d + ' dias' : d === -1 ? 'ontem' : 'há ' + (-d) + ' dias';
}
function nomeAv(a){ return esc(a.disciplina || 'Sem disciplina'); }
function subAv(a){ return esc([a.curso, a.titulo, a.chamada].filter(Boolean).join(' · ')) + (a.data ? ' · ' + fmtData(a.data) : ''); }
function barra(c, g){ const p = g ? Math.round(100 * c / g) : 0; return '<div class="barra-prog"><i style="width:' + p + '%"></i></div>'; }
function abrirAv(id){ abrir(id); aba('aval'); }
function novaDoPainel(){ novaAvaliacao(); editando = true; aba('aval'); }
function renderInicio(){
  const lista = Object.values(db.avaliacoes), hoje = hojeISO();
  const h0 = new Date().getHours(), saud = h0 < 12 ? 'Bom dia' : h0 < 18 ? 'Boa tarde' : 'Boa noite';
  const dataHoje = new Date().toLocaleDateString('pt-BR', {weekday: 'long', day: 'numeric', month: 'long'});
  const pn = String(db.professor || '').replace(/\b(prof|profa|profª|professor|professora|dr|dra|me|ma|msc|esp)\.?\s+/gi, '').trim().split(/\s+/)[0] || '';
  let h = '<div class="ola"><div class="lbl">' + esc(dataHoje.charAt(0).toUpperCase() + dataHoje.slice(1)) + '</div><h2>' + saud + (pn ? ', ' + esc(pn) : '') + '!</h2></div>';
  if(!lista.length){
    h += '<div class="card"><h2>Comece por aqui</h2><ol class="passos"><li>Cadastre suas turmas (a lista de alunos fica salva para as próximas provas).</li><li>Crie uma avaliação com curso, disciplina e data.</li><li>Envie o banco de questões e escolha a turma.</li>' +
         '<li>Gere as provas: cada aluno recebe uma prova diferente, já com o cabeçalho da instituição (o da UNIFADAP vem pronto; outro pode ser enviado uma vez só).</li><li>Depois da prova, corrija as folhas pela câmera do celular.</li></ol>' +
         '<div class="stack" style="margin-top:12px"><button class="btn acc" onclick="novaDoPainel()">+ Nova avaliação</button><button class="btn sec" onclick="carregarDemo()">Ver um exemplo pronto</button>' + botaoInstalar('btn sec') + '</div></div>' + blocoTurmas() + blocoCabecalho() +
         '<p class="lbl" style="margin-top:6px;text-align:center;opacity:.7">Versão ' + VERSAO_APP + '</p>';
    $('#v-inicio').innerHTML = h; return;
  }
  let nGer = 0, nCor = 0, notas = [];
  lista.forEach(a => { nGer += alunosGerados(a).length; Object.values(a.resultados || {}).forEach(r => { nCor++; notas.push(r.nota / ((+a.valor_total || 10)) * 10); }); });
  h += '<div class="painel">' +
    '<div class="kp"><span class="lbl">Avaliações</span><b>' + lista.length + '</b></div>' +
    '<div class="kp"><span class="lbl">Provas geradas</span><b>' + nGer + '</b></div>' +
    '<div class="kp"><span class="lbl">Corrigidas</span><b>' + nCor + '</b></div>' +
    '<div class="kp"><span class="lbl">Falta corrigir</span><b' + (nGer - nCor ? ' style="color:var(--acc)"' : '') + '>' + (nGer - nCor) + '</b></div></div>';
  h += '<div class="row" style="margin:4px 0 14px"><button class="btn acc" onclick="novaDoPainel()">+ Nova avaliação</button>' +
       '<button class="btn" onclick="irCorrigir()">Corrigir provas</button></div>';
  if(sessao && sessao.usuario.papel === 'admin') h += '<div class="card avcard" onclick="adminLista=null;aba(\'admin\')"><div class="row" style="align-items:center"><div style="flex:1"><b>Administração</b><div class="lbl">Professores, liberação de acesso e uso do app</div></div><span class="lbl">›</span></div></div>';
  if(botaoInstalar()) h += '<div style="margin:-4px 0 14px">' + botaoInstalar('btn sec') + '</div>';
  h += blocoTurmas();
  // próximas provas
  const prox = lista.filter(a => a.data && a.data >= hoje).sort((x, y) => x.data.localeCompare(y.data));
  if(prox.length){
    h += '<h3 class="sec">Próximas provas</h3>';
    prox.slice(0, 5).forEach(a => {
      const g = alunosGerados(a).length;
      const st = !a.banco.length ? '<span class="pill">falta o banco</span>' : !nProvas(a) ? '<span class="pill">faltam alunos</span>' :
                 !totalProvas(a) ? '<span class="pill warn">gerar provas</span>' : Object.keys(a.resultados || {}).length ? '<span class="pill ok">' + Object.keys(a.resultados).length + '/' + (exameGerado(a) ? totalProvas(a) : g) + ' corrigidas</span>' : '<span class="pill ok">' + totalProvas(a) + ' provas prontas</span>';
      h += '<div class="card avcard" onclick="abrirAv(\'' + a.id + '\')"><div class="row" style="align-items:center"><div class="dia"><b>' + a.data.slice(8, 10) + '</b><span>' +
           ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+a.data.slice(5, 7) - 1] + '</span></div>' +
           '<div style="flex:1;min-width:0"><b>' + nomeAv(a) + '</b><div class="lbl">' + esc([a.curso, a.chamada].filter(Boolean).join(' · ')) + ' · ' + quando(a.data) + '</div></div>' +
           '<div style="flex:none">' + st + '</div></div></div>';
    });
  }
  // correção em andamento
  const pend = lista.filter(a => { const g = alunosGerados(a).length, c = Object.keys(a.resultados || {}).length; return (!a.data || a.data <= hoje) && (exameGerado(a) ? !c : g && c < g); })
    .sort((x, y) => (y.data || '').localeCompare(x.data || ''));
  if(pend.length){
    h += '<h3 class="sec">Para corrigir</h3>';
    pend.forEach(a => {
      const g = totalProvas(a), c = Object.keys(a.resultados || {}).length;
      h += '<div class="card avcard" onclick="corrigirAv(\'' + a.id + '\')"><div class="row" style="align-items:center"><div style="flex:1;min-width:0"><b>' + nomeAv(a) + '</b><div class="lbl">' + subAv(a) + '</div></div>' +
           '<div style="flex:none" class="lbl"><b style="color:var(--ink)">' + c + '</b> de ' + g + '</div></div>' + barra(c, g) + '</div>';
    });
  }
  // concluídas
  const feitas = lista.filter(a => { const g = alunosGerados(a).length, c = Object.keys(a.resultados || {}).length; return exameGerado(a) ? c > 0 : g && c >= g; })
    .sort((x, y) => (y.data || '').localeCompare(x.data || ''));
  if(feitas.length){
    h += '<h3 class="sec">Corrigidas</h3>';
    feitas.slice(0, 5).forEach(a => {
      const ns = Object.values(a.resultados).map(r => r.nota), m = ns.reduce((x, y) => x + y, 0) / ns.length;
      h += '<div class="card avcard" onclick="db.ativa=\'' + a.id + '\';salvarDB();aba(\'turma\')"><div class="row" style="align-items:center"><div style="flex:1;min-width:0"><b>' + nomeAv(a) + '</b><div class="lbl">' + subAv(a) + '</div></div>' +
           '<div style="flex:none;text-align:right"><div class="lbl">média</div><b style="font-size:18px">' + fmt(m) + '</b><span class="lbl"> / ' + fmt(+a.valor_total || 10) + '</span></div></div></div>';
    });
  }
  // rascunhos sem data
  const semData = lista.filter(a => !a.data && !totalProvas(a));
  if(semData.length){
    h += '<h3 class="sec">Rascunhos</h3>';
    semData.forEach(a => { h += '<div class="card avcard" onclick="abrirAv(\'' + a.id + '\')"><b>' + nomeAv(a) + '</b><div class="lbl">' + subAv(a) + ' · sem data</div></div>'; });
  }
  h += blocoCabecalho();
  h += '<p class="lbl" style="margin-top:14px;text-align:center">' + (sessao ? '<span id="syncInfo">' + textoSync() + '</span> · as suas avaliações aparecem em qualquer aparelho em que você entrar.' : 'Os dados ficam só neste aparelho. Use "Exportar backup" em cada avaliação para passar para outro.') + '</p>' +
       '<p class="lbl" style="margin-top:6px;text-align:center;opacity:.7">Versão ' + VERSAO_APP + '</p>';
  $('#v-inicio').innerHTML = h;
}

// =================== lista de avaliações ===================
function statusAv(a){
  const g = totalProvas(a), c = Object.keys(a.resultados || {}).length;
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
           a.banco.length + ' questões no banco · ' + (semNome(a) ? qtdProvas(a) + ' provas sem nome' : (alunosGerados(a).length || a.alunos.length) + ' alunos') + '</div></div><div style="flex:none">' + statusAv(a) + '</div></div></div>';
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
  const nObjB = objetivas(a).length, comb = nObjB ? combinacoes(nObjB, Math.min(n, nObjB)) : 0, ndq = Math.min(+a.config.nd || 0, discursivas(a).length);
  const imp = a.gerado && a.gerado.importado;
  let h = '<button class="link" onclick="voltarLista()">‹ Avaliações</button>';
  // 1. dados
  h += '<div class="card"><div class="passo">1</div><h2>Dados da avaliação</h2>' +
    campo('Curso', 'curso', a.curso, 'Ex.: Direito') + campo('Disciplina', 'disciplina', a.disciplina, 'Ex.: Economia') +
    campo('Nome do(a) professor(a)', 'professor', a.professor || '', 'Ex.: Prof. Dr. Fulano de Tal') +
    campo('Título', 'titulo', a.titulo, 'Ex.: Prova da Unidade 6') +
    '<label class="campo"><span>Chamada</span><input type="text" list="chamadas" value="' + esc(a.chamada || '') + '" placeholder="Ex.: Primeira chamada" onchange="setAv(\'chamada\', this.value.trim())"></label>' +
    '<datalist id="chamadas"><option>Primeira chamada</option><option>Segunda chamada</option><option>Exame</option><option>Recuperação</option></datalist>' +
    '<div class="row"><label class="campo"><span>Data</span><input type="date" value="' + esc(a.data) + '" onchange="setAv(\'data\', this.value)"></label>' +
    '<label class="campo"><span>Valor de cada objetiva (pontos)</span><input type="text" inputmode="decimal" value="' + fmt(a.config.vObj) + '" onchange="setValor(\'vObj\', this.value)"></label></div>' +
    '<label class="campo"><span>Questões objetivas por prova</span><select onchange="setCfg(\'n\', +this.value)">' +
    Array.from({length: 11}, (_, i) => '<option value="' + i + '"' + (i === n ? ' selected' : '') + '>' + (i ? i : 'Nenhuma (só dissertativas)') + '</option>').join('') + '</select></label>' +
    '<label class="campo"><span>Questões discursivas por prova</span><select onchange="setCfg(\'nd\', +this.value)">' +
    Array.from({length: 11}, (_, i) => '<option value="' + i + '"' + (i === (+a.config.nd || 0) ? ' selected' : '') + '>' + (i ? i : 'Nenhuma') + '</option>').join('') + '</select></label>' +
    ((+a.config.nd || 0) ? '<div class="row"><label class="campo"><span>Valor de cada discursiva (pontos)</span><input type="text" inputmode="decimal" value="' + fmt(a.config.vDisc) + '" onchange="setValor(\'vDisc\', this.value)"></label>' +
      '<label class="campo"><span>Linhas para resposta</span><select onchange="setCfg(\'linhas\', +this.value)">' + [3, 4, 5, 6, 8, 10, 12, 15].map(x => '<option' + (x === (+a.config.linhas || 6) ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label></div>' : '') +
    (() => { const V = valores(a); return '<div class="alerta" style="background:var(--bg);color:var(--ink)">Valor total da prova: <b>' + fmt(V.total) + ' pontos</b><br><span class="lbl">' + V.nObj + ' objetiva' + (V.nObj > 1 ? 's' : '') + ' × ' + fmt(V.vq) +
      (V.nd ? ' + ' + V.nd + ' discursiva' + (V.nd > 1 ? 's' : '') + ' × ' + fmt(V.vdq) : '') + '. As objetivas são corrigidas pela câmera' + (V.nd ? '; a nota das discursivas você lança na correção' : '') + '.</span></div>'; })() +
    check('embaralharQuestoes', 'Embaralhar a ordem das questões', a.config.embaralharQuestoes) +
    check('frenteVerso', 'Impressão frente e verso (cada prova com nº par de páginas)', a.config.frenteVerso) +
    check('mostrarTema', 'Mostrar o tema/aula ao lado do número da questão', a.config.mostrarTema) + '</div>';
  // 2. cabeçalho (o da instituição é enviado uma vez só, na página inicial)
  const anoCab = (a.data ? a.data.slice(0, 4) : String(new Date().getFullYear()));
  const cabPadrao = '<div class="cabpad"><img src="img/logo_unifadap.png" alt="UNIFADAP"><div><b>' + esc([(a.curso || 'CURSO').toUpperCase(), anoCab].join(' – ')) + '</b><b>' +
       esc(([a.titulo, a.chamada].filter(Boolean).join(' – ') || 'Tipo de prova').toUpperCase()) + '</b><b><i>' + esc((a.disciplina || 'DISCIPLINA').toUpperCase()) + '</i></b></div></div>';
  h += '<div class="card"><div class="passo">2</div><h2>Cabeçalho</h2>';
  if(a.cabecalho) h += '<img class="cab" src="' + a.cabecalho.dataUrl + '" alt="Cabeçalho"><p class="lbl" style="margin-top:6px">Esta avaliação tem um cabeçalho próprio, enviado antes.</p>' +
    '<div class="row" style="margin-top:10px"><button class="btn sec" onclick="setAv(\'cabecalho\', null)">Usar o cabeçalho da instituição</button></div>';
  else if(db.cabecalhoInst) h += '<img class="cab" src="' + db.cabecalhoInst.dataUrl + '" alt="Cabeçalho da instituição"><p class="muted" style="margin-top:6px">Cabeçalho da instituição, o mesmo em todas as provas. Para trocar, use o quadro <b>Cabeçalho da instituição</b> na página inicial.</p>';
  else h += cabPadrao + '<p class="muted" style="margin-top:6px">Cabeçalho padrão da UNIFADAP, preenchido sozinho com os dados do passo 1. Não precisa enviar nada. Se quiser outro, envie uma vez só no quadro <b>Cabeçalho da instituição</b> da página inicial.</p>';
  h += '</div>';
  // texto-base / estudo de caso (opcional)
  const tb = a.textoBase || {};
  h += '<div class="card"><h2>Texto-base ou estudo de caso <span class="lbl">(opcional)</span></h2>' +
    '<p class="lbl">Sai na prova de todos os alunos, depois das instruções e antes das questões, na largura toda da página.</p>' +
    '<label class="campo"><span>Título</span><input type="text" value="' + esc(tb.titulo || '') + '" placeholder="Ex.: Estudo de caso – A crise da empresa X" onchange="setTexto(\'titulo\', this.value)"></label>' +
    '<label class="campo"><span>Texto</span><textarea rows="' + (tb.texto ? 8 : 4) + '" placeholder="Cole aqui o texto do caso. Deixe uma linha em branco entre os parágrafos." onchange="setTexto(\'texto\', this.value)">' + esc(tb.texto || '') + '</textarea></label>' +
    '<label class="campo"><span>Fonte (opcional)</span><input type="text" value="' + esc(tb.fonte || '') + '" placeholder="Ex.: Adaptado de Porter (1986), p. 22." onchange="setTexto(\'fonte\', this.value)"></label></div>';
  // 3. banco
  h += '<div class="card"><div class="passo">3</div><h2>Banco de questões</h2>' +
    (a.banco.length ? '<p><b>' + objetivas(a).length + ' objetivas' + (discursivas(a).length ? ' e ' + discursivas(a).length + ' discursivas' : '') + '</b> em ' + Object.keys(temas).length + ' tema(s):</p><ul class="temas">' +
       Object.entries(temas).map(([t, c]) => '<li><span>' + esc(t) + '</span><b>' + c + '</b></li>').join('') + '</ul>'
     : '<p class="muted">Preencha a planilha modelo (uma questão por linha) e envie aqui. Aceita Excel (.xlsx) ou CSV.</p>') +
    '<div class="row" style="margin-top:10px"><button class="btn sec" onclick="baixarModeloBanco()">Baixar planilha modelo</button>' +
    '<button class="btn sec" onclick="$(\'#arqBanco\').click()">' + (a.banco.length ? 'Substituir banco' : 'Enviar planilha') + '</button></div>' +
    blocoImagensBanco(a) +
    (a.banco.length ? '<button class="link" style="margin-top:8px" onclick="verBanco()">Ver questões do banco</button>' : '') +
    '<details style="margin-top:12px"' + (a.banco.length ? '' : ' open') + '><summary><b>Colar questões dissertativas prontas</b></summary>' +
    '<p class="lbl" style="margin-top:6px">Cole as questões da sua prova (de um Word, por exemplo), numeradas: "1.", "2)", "Questão 3"… O app formata cada uma no padrão, com linhas para resposta.</p>' +
    '<textarea id="txtQuestoes" rows="6" placeholder="1. Com base no caso, explique...&#10;&#10;2. Segundo Porter (1986), ..."></textarea>' +
    '<div class="row" style="margin-top:8px"><button class="btn sec" onclick="colarQuestoes()">Adicionar ao banco</button></div></details></div>';
  // 4. alunos (turma salva, lista avulsa ou exame sem nome)
  h += cartaoAlunos(a);
  // 5. provas
  const ndq2 = Math.min(+a.config.nd || 0, discursivas(a).length), NP = nProvas(a), maisExtra = semNome(a) ? ' sem nome' : ' (+ 1 extra em branco, para aluno fora da lista)', pronto = NP && ((n > 0 && objetivas(a).length) || ndq2 > 0);
  h += '<div class="card"><div class="passo">5</div><h2>Provas</h2>';
  if(imp) h += '<p class="muted">Avaliação importada de um arquivo de gabaritos: ' + g.length + ' provas prontas para correção.</p>';
  else if(!pronto) h += '<p class="muted">Complete o banco de questões e ' + (semNome(a) ? 'a quantidade de provas' : 'a lista de alunos') + ' para gerar as provas.</p>';
  else {
    if(!n) h += '<p>' + NP + ' provas' + maisExtra + ' só com ' + ndq + ' questão(ões) dissertativa(s)' + (discursivas(a).length > ndq ? ', sorteadas de ' + discursivas(a).length : '') + '. No final de cada prova sai um quadro de correção com código: na hora de corrigir, fotografe o quadro e digite a nota de cada questão.</p>';
    else h += '<p>' + NP + ' provas' + maisExtra + ' com ' + Math.min(n, nObjB) + ' objetivas' + (ndq ? ' e ' + ndq + ' discursiva' + (ndq > 1 ? 's' : '') : '') + ' cada, sorteadas de ' + nObjB + ' objetivas' + (ndq ? ' e ' + discursivas(a).length + ' discursivas' : '') + ' (' +
         (comb >= NP ? 'todas as combinações diferentes' : 'só há ' + comb + ' combinações possíveis: algumas provas vão repetir questões, mas com alternativas embaralhadas') + ').</p>' +
         (n > nObjB ? '<div class="alerta">O banco tem menos questões objetivas que o número por prova.</div>' : '') +
         ((+a.config.nd || 0) > discursivas(a).length ? '<div class="alerta">O banco tem ' + discursivas(a).length + ' discursiva(s); a prova vai usar só essas.</div>' : '');
    h += '<div class="stack" style="margin-top:10px"><button class="btn acc" onclick="baixarProvas()">' + (totalProvas(a) ? 'Baixar provas (PDF)' : 'Gerar provas (PDF)') + '</button>';
    if(totalProvas(a)) h += '<button class="btn sec" onclick="baixarGabarito()">Baixar gabarito do professor (PDF)</button>' +
                      '<button class="btn sec" onclick="sortearDeNovo()">Sortear as provas de novo</button>';
    h += '</div>';
    if(totalProvas(a)) h += '<p class="lbl" style="margin-top:8px">Provas geradas em ' + new Date(a.gerado.quando).toLocaleString('pt-BR') + '. Para alterar banco, alunos ou regras depois disso, sorteie de novo.</p>';
  }
  h += '</div>';
  // 6. correção e relatório
  if(totalProvas(a)) h += '<div class="card"><div class="passo">6</div><h2>Correção e relatório</h2><p>' + nRes + ' de ' + totalProvas(a) + ' provas corrigidas.</p>' +
    '<div class="stack" style="margin-top:10px"><button class="btn" onclick="corrigirAv(\'' + a.id + '\')">Corrigir provas</button>' +
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
  if(k === 'valor_total' && a.resultados){ a.valor_total = v; Object.entries(a.resultados).forEach(([c, r]) => { const al = alunosGerados(a).find(x => x.codigo === c); if(al) Object.assign(r, calcular(a, al, r.marcadas, r.disc)); }); }
  else a[k] = v;
  // virou exame depois de já ter lista ou provas: mantém a lista (o professor pode marcar "sem nome" no passo 4)
  if(k === 'chamada' && ehExame(a) && a.semNome == null && (a.alunos.length || a.gerado)) a.semNome = false;
  if(k === 'professor' && v) db.professor = v;
  salvarDB(); render();
}
function setCfg(k, v){
  const a = av();
  if(['n', 'nd', 'embaralharQuestoes'].includes(k) && a.gerado && !alteraGerado()) return render();
  a.config[k] = v;
  atualizarValores(a); recalcularNotas(a);
  salvarDB(); render();
}
function setTexto(k, v){ const a = av(); a.textoBase = a.textoBase || {}; a.textoBase[k] = v; salvarDB(); }
// "1. ...", "2) ...", "Questão 3 - ..." viram questões dissertativas no banco
function colarQuestoes(){
  const a = av(), txt = ($('#txtQuestoes').value || '').replace(/\r/g, '').trim();
  if(!txt) return toast('Cole as questões no campo');
  const re = /^\s*(?:quest[aã]o\s*)?(\d{1,3})\s*(?:[).:\-–—]|\s-)\s*/i;
  let partes = [], atualQ = null;
  txt.split('\n').forEach(l => {
    if(re.test(l)){ if(atualQ) partes.push(atualQ); atualQ = l.replace(re, ''); }
    else if(atualQ !== null) atualQ += '\n' + l;
    else atualQ = l;
  });
  if(atualQ) partes.push(atualQ);
  if(partes.length < 2 && !re.test(txt.split('\n')[0])) partes = txt.split(/\n\s*\n/);
  partes = partes.map(p => p.split('\n').map(x => x.trim()).filter(Boolean).join(' ').trim()).filter(p => p.length > 3);
  if(!partes.length) return toast('Não encontrei questões no texto');
  if(a.gerado && !alteraGerado()) return;
  let nD = discursivas(a).length;
  partes.forEach(p => a.banco.push({id: 'D' + String(++nD).padStart(2, '0'), tipo: 'D', tema: 'Geral', nivel: '', enunciado: p, alts: [], correta: -1, comentario: ''}));
  if(!(+a.config.nd)) a.config.nd = Math.min(partes.length, 10);
  if(!objetivas(a).length) a.config.n = 0;
  atualizarValores(a); salvarDB(); render();
  toast(partes.length + (partes.length > 1 ? ' questões adicionadas' : ' questão adicionada'));
}
function setValor(k, v){
  const a = av(), x = +String(v).replace(',', '.').trim();
  if(isNaN(x) || x < 0) return render();
  a.config[k] = x; atualizarValores(a); recalcularNotas(a); salvarDB(); render();
}
function recalcularNotas(a){
  Object.entries(a.resultados || {}).forEach(([c, r]) => { const al = alunosGerados(a).find(x => x.codigo === c); if(al) Object.assign(r, calcular(a, al, r.marcadas, r.disc)); });
}
async function onCabecalho(inp){
  const f = inp.files[0]; inp.value = ''; if(!f) return;
  toast('Lendo o cabeçalho…');
  try { av().cabecalho = await lerCabecalho(f); salvarDB(); render(); toast('Cabeçalho pronto'); }
  catch(e){ alert('Não consegui ler o cabeçalho.\n' + e.message); }
}
async function onCabecalhoInst(inp){
  const f = inp.files[0]; inp.value = ''; if(!f) return;
  toast('Lendo o cabeçalho…');
  try { db.cabecalhoInst = await lerCabecalho(f); salvarDB(); render(); toast('Cabeçalho salvo para todas as provas'); }
  catch(e){ alert('Não consegui ler o cabeçalho.\n' + e.message); }
}
function cabecalhoPadraoInst(){
  if(!confirm('Voltar ao cabeçalho padrão da UNIFADAP em todas as provas?')) return;
  db.cabecalhoInst = null; salvarDB(); render(); toast('Cabeçalho padrão da UNIFADAP');
}
// quadro da página inicial: cabeçalho enviado uma vez e usado em todas as provas
function blocoCabecalho(){
  const c = db.cabecalhoInst;
  return '<h3 class="sec" style="margin:18px 0 8px">Cabeçalho da instituição</h3><div class="card">' +
    (c ? '<img class="cab" src="' + c.dataUrl + '" alt="Cabeçalho da instituição" style="margin-top:0"><p class="lbl" style="margin-top:6px">Usado em todas as provas. Para trocar, envie outro.</p>'
       : '<div class="cabpad"><img src="img/logo_unifadap.png" alt="UNIFADAP"><div><b>CURSO – ANO</b><b>TÍTULO – CHAMADA</b><b><i>DISCIPLINA</i></b></div></div>' +
         '<p class="lbl" style="margin-top:6px">Hoje as provas saem com o cabeçalho padrão da UNIFADAP, preenchido com os dados de cada avaliação. Se quiser outro, envie uma imagem ou PDF uma vez só: ele fica salvo e vale para todas as provas.</p>') +
    '<div class="row" style="margin-top:10px"><button class="btn sec" onclick="$(\'#arqCabInst\').click()">' + (c ? 'Trocar cabeçalho' : 'Enviar cabeçalho (imagem ou PDF)') + '</button>' +
    (c ? '<button class="btn sec" onclick="cabecalhoPadraoInst()">Voltar ao padrão UNIFADAP</button>' : '') + '</div></div>';
}
async function onBanco(inp){
  const f = inp.files[0]; inp.value = ''; if(!f) return;
  try {
    const {banco, erros} = interpretarBanco(await lerPlanilha(f));
    if(!banco.length) throw new Error(erros.slice(0, 5).join('\n') || 'Nenhuma questão encontrada.');
    if(erros.length && !confirm(banco.length + ' questões lidas. ' + erros.length + ' linha(s) com problema serão ignoradas:\n\n' + erros.slice(0, 8).join('\n') + (erros.length > 8 ? '\n…' : '') + '\n\nContinuar?')) return;
    if(!alteraGerado()) return;
    const mantidas = manterImagens(av().banco, banco);
    av().banco = banco; salvarDB(); render();
    const falta = faltaImagem(av()).length;
    toast(banco.length + ' questões carregadas' + (mantidas ? ' · ' + mantidas + ' imagem(ns) mantida(s)' : '') + (falta ? ' · envie as ' + falta + ' imagem(ns)' : ''));
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
  av().alunos = lista; av().turmaId = null; salvarDB(); render(); toast(lista.length + ' alunos carregados');
}
// passo 3: imagens indicadas na coluna "Imagem" da planilha e envio em lote
function blocoImagensBanco(a){
  const comNome = a.banco.filter(q => q.imgNome), comImg = a.banco.filter(q => q.img), falta = faltaImagem(a);
  if(!comNome.length && !comImg.length) return '';
  return (falta.length ? '<div class="alerta" style="margin-top:10px">' + falta.length + ' questão(ões) indicam uma imagem que ainda não foi enviada: ' +
      esc(falta.slice(0, 6).map(q => q.imgNome).join(', ')) + (falta.length > 6 ? '…' : '') + '. Sem ela, a questão sai só com o texto.</div>'
    : '<p class="lbl" style="margin-top:10px">' + comImg.length + ' questão(ões) com imagem.</p>') +
    (comNome.length ? '<div class="row" style="margin-top:8px"><button class="btn sec" onclick="$(\'#arqImgsBanco\').click()">Enviar imagens do banco</button></div>' : '');
}
async function onImagensBanco(inp){
  const fs = [...inp.files]; inp.value = ''; if(!fs.length) return;
  comProgresso('Lendo as imagens…', async () => {
    const a = av(), {ok, semUso} = await ligarImagens(a, fs);
    salvarDB(); render();
    const falta = faltaImagem(a);
    alert(ok.length + ' questão(ões) receberam imagem.' +
      (semUso.length ? '\n\nArquivos sem questão com esse nome na coluna "Imagem": ' + semUso.join(', ') : '') +
      (falta.length ? '\n\nAinda faltam: ' + falta.map(q => q.imgNome).join(', ') : ''));
  });
}
let imgQuestaoAlvo = null;
function anexarImagem(i){ imgQuestaoAlvo = i; $('#arqImgQ').click(); }
async function onImagemQuestao(inp){
  const f = inp.files[0]; inp.value = ''; if(!f || imgQuestaoAlvo == null) return;
  const q = av().banco[imgQuestaoAlvo];
  comProgresso('Lendo a imagem…', async () => {
    q.img = await lerImagemQuestao(f); salvarDB(); verBanco(imgQuestaoAlvo); render();
    toast('Imagem anexada' + (av().gerado ? '. Gere as provas de novo para incluí-la no PDF.' : ''));
  });
}
function removerImagem(i){
  const q = av().banco[i]; if(!q || !confirm('Tirar a imagem da questão ' + q.id + '?')) return;
  delete q.img; salvarDB(); verBanco(i); render(); toast('Imagem removida');
}
function verBanco(foco){
  const a = av();
  $('#resConteudo').innerHTML = '<button class="link" onclick="fecharRes()">‹ Voltar</button><h2 style="margin:8px 0 4px">Banco de questões (' + a.banco.length + ')</h2>' +
    '<p class="lbl" style="margin:0 0 12px">Para pôr um gráfico ou figura numa questão, toque em <b>Anexar imagem</b>. Ela sai na prova logo abaixo do enunciado.</p>' +
    a.banco.map((q, i) => '<div class="card" id="bq' + i + '"><div class="lbl">' + esc(q.id) + ' · ' + (q.tipo === 'D' ? '<span class="pill warn">discursiva</span> · ' : '') + esc(q.tema) + (q.nivel ? ' · ' + esc(q.nivel) : '') + '</div><p style="margin:4px 0 8px">' + esc(q.enunciado) + '</p>' +
      (q.img ? '<img class="qimg" src="' + q.img.dataUrl + '" alt="Imagem da questão ' + esc(q.id) + '">' :
       q.imgNome ? '<div class="alerta" style="margin:0 0 8px">Falta a imagem "' + esc(q.imgNome) + '".</div>' : '') +
      (q.tipo === 'D' ? '<div class="certa">' + esc(q.comentario || 'Sem resposta esperada.') + '</div>' :
      q.alts.map((x, k) => '<div class="' + (k === q.correta ? 'certa' : '') + '"><b>' + LETRAS[k] + ')</b> ' + esc(x) + '</div>').join('')) +
      '<div class="row" style="margin-top:8px"><button class="btn sec" onclick="anexarImagem(' + i + ')">' + (q.img ? 'Trocar imagem' : 'Anexar imagem') + '</button>' +
      (q.img ? '<button class="btn sec" onclick="removerImagem(' + i + ')">Remover imagem</button>' : '') + '</div></div>').join('');
  $('#res').classList.add('on');
  const el = foco != null && $('#bq' + foco);
  if(el) el.scrollIntoView({block: 'center'}); else $('#res').scrollTop = 0;
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
    const pp = doc.getNumberOfPages() / todosGerados(a).length;
    if(pp > 2) setTimeout(() => alert('Atenção: cada prova ficou com ' + Math.ceil(pp) + ' páginas.' + ((+a.config.nd || 0) ? '\nPara caber em 2 páginas (frente e verso), diminua as linhas para resposta ou o número de questões.' : '')), 300);
  });
}
function baixarGabarito(){
  comProgresso('Gerando o gabarito…', async () => { await pdfLibs(); const a = av(); baixarBlob(PDFGEN.gerarGabarito(a).output('blob'), 'gabarito_' + nomeArq(a.disciplina + '_' + a.titulo) + '.pdf'); });
}
function baixarRelatorio(){
  if(!alunosGerados(av()).length) return toast('Nenhuma prova corrigida ainda');
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
  delete db.avaliacoes[a.id]; (db._excluir = db._excluir || []).push(a.id); db.ativa = null; editando = false; salvarDB(); render();
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
  db.avaliacoes.DEMO = nova; db.ativa = 'DEMO'; salvarDB(); editando = false; corrigirAv('DEMO'); toast('Exemplo carregado');
}

// =================== corrigir ===================
function seletorAv(onde){
  const lista = Object.values(db.avaliacoes).filter(a => totalProvas(a));
  if(!lista.length) return '';
  return '<label class="campo"><span>Avaliação</span><select onchange="db.ativa=this.value;salvarDB();render()">' +
    lista.map(a => '<option value="' + a.id + '"' + (a.id === db.ativa ? ' selected' : '') + '>' + esc([a.curso, a.disciplina, a.titulo].filter(Boolean).join(' · ')) + '</option>').join('') + '</select></label>';
}
function irCorrigir(){ corrigindo = false; aba('corrigir'); }
function corrigirAv(id){ db.ativa = id; salvarDB(); corrigindo = true; editando = false; aba('corrigir'); }
function renderCorrigir(){
  const lista = Object.values(db.avaliacoes).filter(x => totalProvas(x));
  if(!lista.length){
    $('#v-corrigir').innerHTML = '<div class="card"><h2>Nada para corrigir ainda</h2><p class="muted">Gere as provas de uma avaliação (aba Avaliações) ou carregue o exemplo de demonstração.</p>' +
      '<div class="stack" style="margin-top:12px"><button class="btn sec" onclick="aba(\'aval\')">Ir para Avaliações</button><button class="btn sec" onclick="carregarDemo()">Carregar exemplo</button></div></div>';
    return;
  }
  const a = av(), g = a ? Array(totalProvas(a)) : [];
  // lista das provas já geradas
  if(!corrigindo || !a || !g.length){
    let h = '<h2 style="margin:4px 2px 4px">Escolha a prova para corrigir</h2><p class="lbl" style="margin:0 2px 12px">' + lista.length + (lista.length > 1 ? ' provas geradas' : ' prova gerada') + ' neste aparelho</p>';
    lista.sort((x, y) => (y.data || '').localeCompare(x.data || '') || (y.criada || '').localeCompare(x.criada || '')).forEach(x => {
      const nG = totalProvas(x), nC = Object.keys(x.resultados || {}).length;
      h += '<div class="card avcard' + (x.id === db.ativa ? ' ativa' : '') + '" onclick="corrigirAv(\'' + x.id + '\')"><div class="row" style="align-items:center">' +
        '<div style="flex:1;min-width:0"><div class="lbl" style="font-weight:700;text-transform:uppercase;letter-spacing:.04em">' + esc(x.curso || 'Sem curso') + '</div>' +
        '<b>' + esc(x.disciplina || 'Sem disciplina') + '</b><div class="lbl">' + esc([x.titulo, x.chamada].filter(Boolean).join(' · ')) + (x.data ? ' · ' + fmtData(x.data) : '') + '</div></div>' +
        '<div style="flex:none">' + (nC >= nG ? '<span class="pill ok">' + nC + '/' + nG + ' corrigidas</span>' : nC ? '<span class="pill warn">' + nC + '/' + nG + ' corrigidas</span>' : '<span class="pill">0/' + nG + ' corrigidas</span>') + '</div></div></div>';
    });
    $('#v-corrigir').innerHTML = h;
    return;
  }
  const notas = Object.values(a.resultados || {}).map(r => r.nota);
  $('#v-corrigir').innerHTML = '<button class="link" onclick="irCorrigir()">‹ Provas</button>' +
    '<div class="card"><div class="lbl" style="font-weight:700;text-transform:uppercase;letter-spacing:.04em">' + esc(a.curso || '') + '</div><h2>' + esc(a.disciplina || 'Avaliação') + '</h2>' +
    '<div class="lbl">' + esc([a.titulo, a.chamada].filter(Boolean).join(' · ')) + (a.data ? ' · ' + fmtData(a.data) : '') + '</div>' +
    '<div class="lbl" style="margin-top:10px">Corrigidas</div><div class="big">' + notas.length +
    '<span class="muted" style="font-size:22px"> / ' + g.length + '</span></div><div class="kpis">' +
    '<div class="kpi"><span class="lbl">Média</span><b>' + (notas.length ? fmt(notas.reduce((x, y) => x + y, 0) / notas.length) : '–') + '</b></div>' +
    '<div class="kpi"><span class="lbl">Maior</span><b>' + (notas.length ? fmt(Math.max(...notas)) : '–') + '</b></div>' +
    '<div class="kpi"><span class="lbl">Menor</span><b>' + (notas.length ? fmt(Math.min(...notas)) : '–') + '</b></div></div></div>' +
    '<div class="stack"><button class="btn acc" onclick="abrirCamera()"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Corrigir com a câmera</button>' +
    '<button class="btn sec" onclick="$(\'#arqFoto\').click()">Corrigir a partir de uma foto</button>' +
    '<button class="btn sec" onclick="$(\'#arqPDF\').click()">Corrigir a partir de PDF escaneado</button></div>' +
    '<p class="lbl" style="margin-top:8px;text-align:center">PDF escaneado: pode enviar um ou mais arquivos com as provas de vários alunos. O app encontra a folha de respostas de cada um.</p>' +
    '<p class="lbl" style="margin-top:12px;text-align:center">Se a folha for de outra prova deste aparelho, o app troca sozinho.</p>';
}

// =================== turma ===================
function renderTurma(){
  const a = av(), g = alunosGerados(a);
  let h = '<div class="card">' + seletorAv();
  if(!a || !g.length){ $('#v-turma').innerHTML = h + '<div class="vazio">' + (exameGerado(a) ? 'Nenhuma prova corrigida ainda. No exame sem nome, cada aluno aparece aqui depois de corrigido.' : 'Nenhuma prova gerada nesta avaliação.') + '</div></div>'; return; }
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
      li.innerHTML = '<div class="nome"><b></b><span class="lbl"></span></div>' + (r ? (r.faltaDisc ? '<span class="pill warn">falta discursiva</span> ' : '') + (r.pendencias ? '<span class="pill warn">' + r.pendencias + ' p/ conferir</span> ' : '') +
        '<span class="nota">' + fmt(r.nota) + '</span>' : '<span class="pill">pendente</span>');
      li.querySelector('b').textContent = al.nome;
      li.querySelector('.lbl').textContent = 'RA ' + (al.ra || '–') + ' · ' + al.codigo + (r && r.n ? ' · ' + r.acertos + '/' + r.n + ' acertos' : '');
      li.onclick = () => r ? mostrarResultado({aluno: al, marcadas: r.marcadas.slice(), status: r.status.slice(), disc: r.disc ? r.disc.slice() : undefined, salvo: true})
        : !al.gabarito.length ? mostrarResultado({aluno: al, marcadas: [], status: [], salvo: false}) : toast('Ainda não corrigida');
      ul.appendChild(li);
    });
}
function exportarCSV(){
  const a = av(); if(!a) return;
  if(!alunosGerados(a).length) return toast('Nenhuma prova corrigida ainda');
  const g = alunosGerados(a), n = Math.max(...g.map(x => x.gabarito.length)), res = a.resultados || {};
  const cab = ['Código', 'Nome', 'RA', 'Situação', 'Acertos', 'Questões', 'Nota objetivas', 'Nota discursivas', 'Nota']; for(let i = 1; i <= n; i++) cab.push('Q' + i); cab.push('Gabarito', 'Conferir');
  const linhas = [cab];
  g.slice().sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')).forEach(al => {
    const r = res[al.codigo], l = [al.codigo, al.nome, al.ra || '', r ? (r.faltaDisc ? 'falta discursiva' : 'corrigida') : 'pendente', r ? r.acertos : '', al.gabarito.length,
      r ? fmt(r.notaObj != null ? r.notaObj : r.nota) : '', r && r.notaDisc != null ? fmt(r.notaDisc) : '', r ? fmt(r.nota) : ''];
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
// prova só com dissertativas: o QR "DISC|avaliação|código|nº" identifica o aluno (não há bolhas)
function analisarFolha(img, op){
  const r = OMR.analisar(img, LAYOUTS, op);
  if(!r.ok && r.erro === 'qr-formato' && /^DISC\|/.test(r.texto || '')){
    const p = r.texto.split('|');
    return {ok: true, qr: {versao: 'DISC', prova: p[1], codigo: p[2], n: 0}, respostas: [], debug: {cantos: [], bolhas: []}};
  }
  return r;
}
function interpretar(r){
  if(!r.ok){
    if(r.erro === 'qr') return {erro: 'Procurando o QR code da folha…'};
    if(r.erro === 'qr-formato') return {erro: 'Este QR code não é de uma folha de respostas.'};
    return {erro: 'QR lido. Enquadre também os 4 quadrados pretos.'};
  }
  let a = av();
  if(!a || r.qr.prova !== a.id){
    if(db.avaliacoes[r.qr.prova] && totalProvas(db.avaliacoes[r.qr.prova])){ db.ativa = r.qr.prova; salvarDB(); a = av(); toast('Avaliação trocada: ' + (a.titulo || a.id)); }
    else return {erro: 'Esta folha é de uma avaliação que não está neste aparelho (' + r.qr.prova + ').'};
  }
  const aluno = todosGerados(a).find(x => x.codigo === r.qr.codigo);
  if(!aluno) return {erro: 'Prova ' + r.qr.codigo + ' não está nesta avaliação.'};
  const n = aluno.gabarito.length;
  return {aluno, marcadas: r.respostas.slice(0, n).map(x => x.letra), status: r.respostas.slice(0, n).map(x => x.status), debug: r.debug};
}

// =================== câmera ===================
let stream = null, rodando = false, ultimo = null, iguais = 0, luz = false;
async function abrirCamera(){
  if(!totalProvas(av())) return toast('Gere as provas primeiro');
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
  let r; try { r = analisarFolha(img, {escalasQR: [1, 0.6]}); } catch(e){ r = {ok: false, erro: 'qr'}; }
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
    const r2 = analisarFolha(snap.getContext('2d').getImageData(0, 0, snap.width, snap.height), {escalasQR: [1, 0.6, 0.4]});
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
      const r = analisarFolha(img, {escalasQR: [1, 0.6, 0.4], inverter: true}), it = interpretar(r);
      if(!it.erro){ mostrarResultado(Object.assign(it, {snap: canvas, debug: r.debug})); return; }
      melhor = melhor || it.erro;
    }
    alert('Não consegui ler esta foto.\n' + melhor + '\n\nFotografe a folha inteira, com boa luz e os 4 quadrados pretos visíveis.');
  };
  im.src = url;
}

// =================== PDF escaneado (várias folhas de uma vez) ===================
// Tudo roda no navegador (pdf.js): o arquivo não sai do aparelho.
let lote = null; // {itens: [{rotulo, avId, aluno, marcadas, status, disc, snap, debug, salvo}], semFolha: [], naoLidas: [{rotulo, erro}]}
function identificarFolha(r){
  if(!r.ok) return {erro: r.erro === 'qr-formato' ? 'o QR code não é de uma folha de respostas' : 'QR lido, mas os 4 quadrados pretos não foram encontrados'};
  const a = db.avaliacoes[r.qr.prova];
  if(!a || !totalProvas(a)) return {erro: 'folha de uma avaliação que não está neste aparelho (' + r.qr.prova + ')'};
  const aluno = todosGerados(a).find(x => x.codigo === r.qr.codigo);
  if(!aluno) return {erro: 'a prova ' + r.qr.codigo + ' não está nesta avaliação'};
  const n = aluno.gabarito.length;
  return {avId: a.id, aluno, marcadas: r.respostas.slice(0, n).map(x => x.letra), status: r.respostas.slice(0, n).map(x => x.status)};
}
// recorta só a folha de respostas para mostrar na conferência (economiza memória em PDFs grandes)
function recortarFolha(canvas, debug){
  let x0 = 0, y0 = 0, x1 = canvas.width, y1 = canvas.height;
  if(debug && debug.cantos.length === 4){
    const xs = debug.cantos.map(c => c[0]), ys = debug.cantos.map(c => c[1]);
    const mx = (Math.max(...xs) - Math.min(...xs)) * 0.06, my = (Math.max(...ys) - Math.min(...ys)) * 0.12;
    x0 = Math.max(0, Math.floor(Math.min(...xs) - mx)); x1 = Math.min(canvas.width, Math.ceil(Math.max(...xs) + mx));
    y0 = Math.max(0, Math.floor(Math.min(...ys) - my)); y1 = Math.min(canvas.height, Math.ceil(Math.max(...ys) + my));
  }
  const s = Math.min(1, 1100 / Math.max(x1 - x0, y1 - y0)), c = document.createElement('canvas');
  c.width = Math.round((x1 - x0) * s); c.height = Math.round((y1 - y0) * s);
  c.getContext('2d').drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
  const t = p => [(p[0] - x0) * s, (p[1] - y0) * s];
  const d = debug ? {cantos: debug.cantos.map(t), bolhas: debug.bolhas.map(b => Object.assign({}, b, {p: t(b.p), rp: b.rp * s}))} : null;
  return {snap: c, debug: d};
}
function lerPaginaEscaneada(pagina){
  let melhor = null;
  for(const max of [1700, 2300, 1200]){
    const {canvas, img} = imagemDeFonte(pagina, pagina.width, pagina.height, max);
    let r; try { r = analisarFolha(img, {escalasQR: [1, 0.6, 0.4], inverter: true}); } catch(e){ r = {ok: false, erro: 'qr'}; }
    if(r.erro === 'qr') continue;               // nenhum QR nesta escala
    const it = identificarFolha(r);
    if(!it.erro) return Object.assign(it, recortarFolha(canvas, r.debug));
    melhor = melhor || it;
  }
  return melhor || {semFolha: true};
}
async function lerPDFs(inp){
  const arqs = [...inp.files]; inp.value = ''; if(!arqs.length) return;
  const o = $('#ocupado'), msg = t => { $('#ocupadoTxt').textContent = t; };
  o.classList.add('on'); msg('Abrindo o PDF…');
  const novo = {itens: [], semFolha: [], naoLidas: []};
  try {
    await carregarScript('lib/pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
    for(const arq of arqs){
      let pdf;
      try { pdf = await pdfjsLib.getDocument({data: await arq.arrayBuffer()}).promise; }
      catch(e){ novo.naoLidas.push({rotulo: arq.name, erro: 'não é um PDF válido'}); continue; }
      for(let p = 1; p <= pdf.numPages; p++){
        const rotulo = (arqs.length > 1 ? arq.name + ', ' : '') + 'página ' + p;
        msg('Lendo ' + (arqs.length > 1 ? arq.name + ', ' : '') + 'página ' + p + ' de ' + pdf.numPages + '…');
        await new Promise(r => setTimeout(r, 20));
        const pg = await pdf.getPage(p), vp1 = pg.getViewport({scale: 1});
        const vp = pg.getViewport({scale: Math.min(4, 2300 / Math.max(vp1.width, vp1.height))});
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext('2d', {willReadFrequently: true}); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await pg.render({canvasContext: ctx, viewport: vp}).promise; pg.cleanup();
        const it = lerPaginaEscaneada(c); c.width = c.height = 0;
        if(it.semFolha) novo.semFolha.push(rotulo);
        else if(it.erro) novo.naoLidas.push({rotulo, erro: it.erro});
        else {
          const a = db.avaliacoes[it.avId], ja = (a.resultados || {})[it.aluno.codigo], V = valores(a, it.aluno);
          it.disc = (ja && ja.disc) ? ja.disc.slice() : Array(V.nd).fill(null);
          it.rotulo = rotulo; it.lote = true;
          it.repetida = novo.itens.some(x => x.avId === it.avId && x.aluno.codigo === it.aluno.codigo);
          novo.itens.push(it);
        }
      }
      await pdf.destroy();
    }
  } catch(e){ console.error(e); o.classList.remove('on'); alert('Não consegui abrir o PDF: ' + e.message); return; }
  o.classList.remove('on');
  if(!novo.itens.length){
    alert('Nenhuma folha de respostas encontrada no PDF.' + (novo.naoLidas.length ? '\n\n' + novo.naoLidas.map(x => x.rotulo + ': ' + x.erro).join('\n') : '') +
      '\n\nDigitalize em boa resolução (200 a 300 dpi), com a folha inteira e os 4 quadrados pretos visíveis.');
    return;
  }
  lote = novo; mostrarLote();
}
function mostrarLote(){
  const L = lote; atual = null;
  const pend = it => it.status.filter(s => s !== 'ok' && s !== 'manual').length;
  const semNomeFalta = it => it.aluno.extra && (!it.aluno.nome || it.aluno.nome === 'ALUNO(A) NÃO LISTADO(A)');
  const naoSalvas = L.itens.filter(x => !x.salvo).length;
  let h = '<div class="card"><h2>PDF lido</h2><p style="margin:4px 0 0"><b>' + L.itens.length + '</b> folha' + (L.itens.length > 1 ? 's' : '') + ' de respostas encontrada' + (L.itens.length > 1 ? 's' : '') + '.</p>' +
    (L.semFolha.length ? '<p class="lbl" style="margin-top:4px">' + L.semFolha.length + ' página(s) sem folha de respostas foram ignoradas (por exemplo, a frente da prova).</p>' : '') +
    (L.naoLidas.length ? '<div class="alerta bad">Não consegui ler ' + L.naoLidas.length + ' página(s):<br>' + L.naoLidas.map(x => esc(x.rotulo) + ': ' + esc(x.erro)).join('<br>') + '<br>Corrija essas pela câmera ou por uma foto.</div>' : '') +
    '<p class="lbl" style="margin-top:8px">Toque num aluno para conferir as respostas. Amarelo = precisa de conferência.</p></div>' +
    '<div class="card"><ul class="lista">';
  L.itens.forEach((it, i) => {
    const a = db.avaliacoes[it.avId], calc = calcular(a, it.aluno, it.marcadas, it.disc), ja = (a.resultados || {})[it.aluno.codigo], p = pend(it);
    const pills = (it.salvo ? '<span class="pill ok">salva</span> ' : ja ? '<span class="pill warn">já corrigida (' + fmt(ja.nota) + ')</span> ' : '') +
      (it.repetida ? '<span class="pill warn">repetida</span> ' : '') + (semNomeFalta(it) ? '<span class="pill warn">falta o nome</span> ' : '') +
      (p ? '<span class="pill warn">' + p + ' p/ conferir</span> ' : '') + (calc.faltaDisc ? '<span class="pill warn">falta nota discursiva</span> ' : '');
    h += '<li onclick="abrirItemLote(' + i + ')"><div class="nome"><b>' + esc(it.aluno.nome) + '</b><span class="lbl">' + esc(it.aluno.codigo + ' · ' + it.rotulo + (Object.keys(db.avaliacoes).length > 1 ? ' · ' + (a.disciplina || a.titulo || '') : '') + (calc.n ? ' · ' + calc.acertos + '/' + calc.n + ' acertos' : '')) + '</span><span>' + pills + '</span></div>' +
      '<span class="nota">' + fmt(calc.nota) + '</span></li>';
  });
  h += '</ul></div><div class="stack">' +
    (naoSalvas ? '<button class="btn acc" onclick="salvarLote()">Salvar ' + (naoSalvas > 1 ? 'as ' + naoSalvas + ' correções' : 'a correção') + '</button>' : '<div class="alerta" style="background:var(--okb);color:var(--ok)">Todas as correções foram salvas.</div>') +
    '<button class="btn sec" onclick="fecharLote()">' + (naoSalvas ? 'Sair sem salvar' : 'Fechar') + '</button></div>';
  $('#resConteudo').innerHTML = h; $('#res').classList.add('on'); $('#res').scrollTop = 0;
}
function abrirItemLote(i){ const it = lote.itens[i]; db.ativa = it.avId; mostrarResultado(it); }
function salvarLote(){
  const fora = lote.itens.filter(x => !x.salvo);
  const ja = fora.filter(x => (db.avaliacoes[x.avId].resultados || {})[x.aluno.codigo]).length;
  if(ja && !confirm(ja + ' prova(s) deste PDF já tinham correção salva. Substituir pela leitura do PDF?')) return;
  fora.forEach(it => { gravarResultado(db.avaliacoes[it.avId], it.aluno, it.marcadas, it.status, it.disc); it.salvo = true; });
  salvarDB(); toast(fora.length + (fora.length > 1 ? ' correções salvas' : ' correção salva'));
  mostrarLote(); render();
}
function fecharLote(){
  if(lote && lote.itens.some(x => !x.salvo) && !confirm('Sair sem salvar as correções que faltam?')) return;
  lote = null; $('#res').classList.remove('on'); render();
}

// =================== resultado ===================
let atual = null;
function mostrarResultado(it){
  atual = it;
  const a = av(), al = it.aluno, n = al.gabarito.length, ja = (a.resultados || {})[al.codigo];
  const V = valores(a, al);
  if(!it.disc) it.disc = (ja && ja.disc) ? ja.disc.slice() : Array(V.nd).fill(null);
  const calc = calcular(a, al, it.marcadas, it.disc);
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
    '<div class="card"><div class="lbl">' + esc(al.codigo) + ' · RA ' + esc(al.ra || '–') + ' · ' + esc([a.disciplina, a.titulo].filter(Boolean).join(' · ')) + '</div>' + (al.extra ? '<div class="alerta">' + (al.semNome ? 'Prova sem nome' : 'Prova extra (aluno fora da lista)') + '. Digite o nome do aluno:</div><input type="text" style="margin-top:8px" value="' + (al.nome === 'ALUNO(A) NÃO LISTADO(A)' ? '' : esc(al.nome)) + '" placeholder="Nome do aluno" onchange="atual.aluno.nome = this.value.trim().toUpperCase() || \'ALUNO(A) NÃO LISTADO(A)\'; salvarDB()">' : '<h2 style="font-size:20px">' + esc(al.nome) + '</h2>') +
    '<div class="row" style="margin-top:8px;align-items:flex-end"><div><div class="lbl">Nota</div><div class="big">' + fmt(calc.nota) + '</div></div>' +
    (n ? '<div><div class="lbl">Acertos' + (V.nd ? ' (objetivas)' : '') + '</div><div class="big" style="font-size:28px">' + calc.acertos + '/' + n + '</div></div>' : '') + '</div>' +
    (V.nd && !n && calc.faltaDisc ? '<div class="alerta">Falta lançar a nota de ' + calc.faltaDisc + ' questão(ões) (mais abaixo).</div>' : '') +
    (V.nd && n ? '<p class="lbl" style="margin-top:6px">Objetivas ' + fmt(calc.notaObj) + ' + discursivas ' + fmt(calc.notaDisc) + '</p>' +
      (calc.faltaDisc ? '<div class="alerta">Falta lançar a nota de ' + calc.faltaDisc + ' discursiva' + (calc.faltaDisc > 1 ? 's' : '') + ' (mais abaixo).</div>' : '') : '') +
    (pend ? '<div class="alerta">' + pend + (pend > 1 ? ' questões precisam' : ' questão precisa') + ' de conferência. Toque na resposta para corrigir.</div>' : '') +
    (ja && !it.salvo ? '<div class="alerta bad">Esta prova já foi corrigida (nota ' + fmt(ja.nota) + '). Salvar vai substituir.</div>' : '') + '</div>' +
    (n ? '<div class="card"><table class="qgrid"><tr><th>Questão</th><th>Marcada</th><th>Gabarito</th><th></th></tr>' + linhas + '</table>' +
    '<p class="lbl" style="margin-top:8px">Questão em branco ou com dupla marcação conta como errada, a menos que você escolha a resposta.</p></div>' : '') +
    (V.nd ? '<div class="card"><h2>' + (n ? 'Questões discursivas' : 'Notas das questões') + '</h2><p class="lbl">Leia as respostas na prova do aluno e digite a nota de cada uma (de 0 a ' + fmt(V.vdq) + ').</p>' +
      (al.disc || []).map((id, k) => '<label class="campo"><span>Questão ' + (n + k + 1) + ' · ref. ' + esc(id) + ' (vale ' + fmt(V.vdq) + ')</span><input type="text" inputmode="decimal" value="' + (it.disc[k] == null ? '' : it.disc[k]) + '" placeholder="nota" onchange="notaDisc(' + k + ', this.value)"></label>').join('') + '</div>' : '') +
    '<div class="card" id="cardSnap" style="display:none"><div class="lbl">Imagem lida</div><canvas class="snap" id="snap"></canvas></div>' +
    '<div class="stack">' +
    (it.lote ? '<button class="btn acc" onclick="salvarAtual(false)">' + (it.salvo ? 'Salvar alterações' : 'Salvar') + ' e voltar à lista</button><button class="btn sec" onclick="voltarLote()">Voltar à lista</button>' :
     it.salvo ? '<button class="btn acc" onclick="salvarAtual(false)">Salvar alterações</button><button class="btn sec" onclick="fecharRes()">Voltar</button>' +
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
function notaDisc(k, v){
  const V = valores(av(), atual.aluno);
  v = String(v).replace(',', '.').trim();
  atual.disc[k] = v === '' ? null : Math.max(0, Math.min(V.vdq, +v || 0));
  mostrarResultado(atual);
}
function fecharPicker(){ $('#picker').classList.remove('on'); }
function gravarResultado(a, al, marcadas, status, disc){
  const calc = calcular(a, al, marcadas, disc);
  a.resultados = a.resultados || {};
  a.resultados[al.codigo] = {marcadas: marcadas.slice(), status: status.slice(), acertos: calc.acertos, n: calc.n, nota: calc.nota,
    pendencias: status.filter(s => s !== 'ok' && s !== 'manual').length, quando: new Date().toISOString()};
  if(disc && disc.length) Object.assign(a.resultados[al.codigo], {disc: disc.slice(), notaObj: calc.notaObj, notaDisc: calc.notaDisc, faltaDisc: calc.faltaDisc});
  return calc;
}
function salvarAtual(proxima){
  const a = av(), al = atual.aluno, calc = gravarResultado(a, al, atual.marcadas, atual.status, atual.disc);
  salvarDB(); toast('Salvo: ' + al.nome + ' — nota ' + fmt(calc.nota));
  if(atual.lote){ atual.salvo = true; render(); mostrarLote(); return; }
  $('#res').classList.remove('on'); render();
  if(proxima) abrirCamera();
}
function voltarLote(){ mostrarLote(); }
function excluirAtual(){
  if(!confirm('Excluir a correção de ' + atual.aluno.nome + '?')) return;
  delete av().resultados[atual.aluno.codigo]; salvarDB(); fecharRes(); render();
}
function fecharRes(lerDeNovo){ if(atual && atual.lote) return mostrarLote(); $('#res').classList.remove('on'); if(lerDeNovo) abrirCamera(); }

let tt = null;
function toast(m){ const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2600); }
iniciarApp();
