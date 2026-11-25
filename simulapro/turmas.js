/* Corretor de Provas – turmas salvas (lista de alunos carregada uma vez e reutilizada nas provas)
   Dados: db.turmas = {id: {id, nome, curso, alunos: [{nome, ra, cpf}], atualizada}}.
   A avaliação guarda uma CÓPIA da lista (a.alunos) e a.turmaId; mudar a turma depois não altera provas já geradas. */
'use strict';

const turmasLista = () => Object.values(db.turmas || {}).sort((x, y) => (x.nome || '').localeCompare(y.nome || '', 'pt-BR'));
const assinAlunos = l => l.map(x => norm(x.nome)).join('|');

// na primeira abertura, as listas de alunos das avaliações já criadas viram turmas
function migrarTurmas(){
  if(db.turmas) return;
  db.turmas = {};
  // exames criados antes desta versão continuam com a lista de alunos que já tinham
  Object.values(db.avaliacoes).forEach(a => { if(ehExame(a) && a.semNome == null && (a.alunos.length || a.gerado)) a.semNome = false; });
  const porAssin = {};
  Object.values(db.avaliacoes).forEach(a => {
    if(a.id === 'DEMO' || (a.gerado && a.gerado.importado) || !a.alunos || a.alunos.length < 2 || a.semNome) return;
    const s = assinAlunos(a.alunos);
    let t = porAssin[s];
    if(!t){
      t = porAssin[s] = {id: 'T' + novoId().slice(1), nome: [a.curso, a.disciplina].filter(Boolean).join(' · ') || 'Turma', curso: a.curso || '',
        alunos: a.alunos.map(x => ({nome: x.nome, ra: x.ra || '', cpf: x.cpf || ''})), atualizada: new Date().toISOString()};
      db.turmas[t.id] = t;
    }
    a.turmaId = t.id;
  });
  // nomes repetidos ganham um número
  const vistos = {};
  turmasLista().forEach(t => { const k = norm(t.nome); vistos[k] = (vistos[k] || 0) + 1; if(vistos[k] > 1) t.nome += ' (' + vistos[k] + ')'; });
  salvarDB();
}

// ---------- página inicial
function blocoTurmas(){
  const L = turmasLista();
  let h = '<div class="row" style="align-items:baseline;margin:18px 0 8px"><h3 class="sec" style="margin:0;flex:1">Minhas turmas</h3>' +
          '<button class="link" onclick="novaTurma()">+ Nova turma</button></div>';
  if(!L.length) return h + '<div class="card"><p class="muted" style="margin:0">Carregue a lista de alunos de cada turma uma vez só. Depois, em cada prova, é só escolher a turma.</p>' +
    '<div class="stack" style="margin-top:10px"><button class="btn sec" onclick="novaTurma()">+ Nova turma</button></div></div>';
  L.forEach(t => {
    h += '<div class="card avcard" onclick="abrirTurma(\'' + t.id + '\')"><div class="row" style="align-items:center"><div style="flex:1;min-width:0"><b>' + esc(t.nome || 'Turma') + '</b>' +
         '<div class="lbl">' + esc([t.curso, t.alunos.length + ' aluno' + (t.alunos.length === 1 ? '' : 's')].filter(Boolean).join(' · ')) + '</div></div>' +
         '<button class="btn sec" style="flex:none;width:auto;padding:8px 12px;font-size:13px" onclick="event.stopPropagation();provaDaTurma(\'' + t.id + '\')">Nova prova</button></div></div>';
  });
  return h;
}

// ---------- tela da turma
let turmaAberta = null;
function novaTurma(){
  const t = {id: 'T' + novoId().slice(1), nome: '', curso: '', alunos: [], atualizada: new Date().toISOString()};
  db.turmas = db.turmas || {}; db.turmas[t.id] = t; salvarDB(); abrirTurma(t.id);
}
function abrirTurma(id){ turmaAberta = id; renderTurmaSalva(); $('#res').classList.add('on'); $('#res').scrollTop = 0; }
function fecharTurma(){
  const t = db.turmas[turmaAberta];
  if(t && !t.alunos.length && !t.nome){ delete db.turmas[t.id]; (db._excluirT = db._excluirT || []).push(t.id); salvarDB(); }
  turmaAberta = null; fecharRes(); render();
}
function renderTurmaSalva(){
  const t = db.turmas[turmaAberta]; if(!t) return fecharTurma();
  const usos = Object.values(db.avaliacoes).filter(a => a.turmaId === t.id).length;
  let h = '<button class="link" onclick="fecharTurma()">‹ Início</button>' +
    '<div class="card" style="margin-top:8px"><h2>Turma</h2>' +
    '<label class="campo"><span>Nome da turma</span><input type="text" value="' + esc(t.nome) + '" placeholder="Ex.: Direito 1º semestre 2026" onchange="setTurma(\'nome\', this.value.trim())"></label>' +
    '<label class="campo"><span>Curso</span><input type="text" value="' + esc(t.curso) + '" placeholder="Ex.: Direito" onchange="setTurma(\'curso\', this.value.trim())"></label>' +
    (usos ? '<p class="lbl">Usada em ' + usos + ' avaliação(ões).</p>' : '') + '</div>';
  h += '<div class="card"><h2>Alunos (' + t.alunos.length + ')</h2>' +
    (t.alunos.length ? '<ol class="alunos">' + t.alunos.map((x, i) => '<li>' + esc(x.nome) + (x.ra ? ' <span class="lbl">RA ' + esc(x.ra) + '</span>' : '') + (x.cpf ? ' <span class="lbl">CPF ' + esc(x.cpf) + '</span>' : '') +
        ' <button class="link" style="color:var(--bad)" title="Tirar da turma" onclick="tirarAluno(' + i + ')">tirar</button></li>').join('') + '</ol>'
     : '<p class="muted">Envie uma planilha com as colunas Nome, RA e CPF, ou cole a lista abaixo (uma linha por aluno: nome, RA e/ou CPF separados por tabulação ou ponto e vírgula). Do CPF, o app guarda só os 3 primeiros números e os 2 dígitos finais.</p>') +
    '<textarea id="txtTurma" rows="4" style="margin-top:8px" placeholder="Maria da Silva;12345;123.456.789-01&#10;João Souza;12346;987.654.321-00"></textarea>' +
    '<div class="row" style="margin-top:8px">' +
    (t.alunos.length ? '<button class="btn sec" onclick="colarNaTurma(true)">Acrescentar alunos</button><button class="btn sec" onclick="colarNaTurma(false)">Trocar a lista toda</button>'
                     : '<button class="btn sec" onclick="colarNaTurma(false)">Usar lista colada</button>') + '</div>' +
    '<div class="row" style="margin-top:8px"><button class="btn sec" onclick="$(\'#arqTurma\').click()">' + (t.alunos.length ? 'Trocar pela planilha' : 'Enviar planilha') + '</button></div></div>';
  h += '<div class="stack">' + (t.alunos.length ? '<button class="btn acc" onclick="provaDaTurma(\'' + t.id + '\')">Nova prova para esta turma</button>' : '') +
       '<button class="btn sec" style="color:var(--bad)" onclick="excluirTurma()">Excluir turma</button></div>' +
       '<p class="lbl" style="margin-top:10px">As provas já geradas guardam a própria lista: mudar a turma aqui não altera provas impressas nem notas.</p>';
  $('#resConteudo').innerHTML = h;
}
function setTurma(k, v){ const t = db.turmas[turmaAberta]; t[k] = v; t.atualizada = new Date().toISOString(); salvarDB(); }
function definirAlunosTurma(lista, acrescentar){
  const t = db.turmas[turmaAberta];
  if(!lista.length) return alert('Nenhum aluno encontrado. Confira se há uma coluna "Nome".');
  if(acrescentar){
    const ja = new Set(t.alunos.map(x => norm(x.nome)));
    const novos = lista.filter(x => !ja.has(norm(x.nome)));
    t.alunos = t.alunos.concat(novos); toast(novos.length + ' aluno(s) acrescentado(s)');
  } else { t.alunos = lista; toast(lista.length + ' alunos na turma'); }
  t.atualizada = new Date().toISOString(); salvarDB(); renderTurmaSalva();
}
function colarNaTurma(acrescentar){
  const txt = $('#txtTurma').value; if(!txt.trim()) return toast('Cole a lista de alunos no campo');
  definirAlunosTurma(interpretarAlunos([['Nome', 'RA']].concat(linhasDeTexto(txt))), acrescentar);
}
async function onTurmaArq(inp){
  const f = inp.files[0]; inp.value = ''; if(!f) return;
  try { definirAlunosTurma(interpretarAlunos(await lerPlanilha(f)), false); } catch(e){ alert('Não consegui ler a lista de alunos.\n' + e.message); }
}
function tirarAluno(i){
  const t = db.turmas[turmaAberta];
  if(!confirm('Tirar ' + t.alunos[i].nome + ' da turma?')) return;
  t.alunos.splice(i, 1); t.atualizada = new Date().toISOString(); salvarDB(); renderTurmaSalva();
}
function excluirTurma(){
  const t = db.turmas[turmaAberta];
  if(!confirm('Excluir a turma "' + (t.nome || 'Turma') + '"? As avaliações que já usaram a lista continuam com os alunos delas.')) return;
  delete db.turmas[t.id]; (db._excluirT = db._excluirT || []).push(t.id); Object.values(db.avaliacoes).forEach(a => { if(a.turmaId === t.id) delete a.turmaId; });
  salvarDB(); turmaAberta = null; fecharRes(); render();
}
function provaDaTurma(id){
  const t = db.turmas[id]; if(!t || !t.alunos.length) return toast('A turma ainda não tem alunos');
  const a = novaAvaliacao(); a.curso = t.curso || ''; aplicarTurma(a, t);
  salvarDB(); turmaAberta = null; fecharRes(); editando = true; aba('aval');
  toast('Avaliação criada com os ' + t.alunos.length + ' alunos de ' + (t.nome || 'turma'));
}

// ---------- passo 4 da avaliação
function aplicarTurma(a, t){ a.alunos = t.alunos.map(x => ({nome: x.nome, ra: x.ra || '', cpf: x.cpf || ''})); a.turmaId = t.id; a.semNome = false; }
function usarTurma(id){
  if(!id) return;
  const a = av(), t = db.turmas[id]; if(!t || !t.alunos.length) return toast('Essa turma ainda não tem alunos');
  if(!alteraGerado()) return render();
  aplicarTurma(a, t); if(!a.curso && t.curso) a.curso = t.curso;
  salvarDB(); render(); toast(t.alunos.length + ' alunos de ' + (t.nome || 'turma'));
}
function salvarComoTurma(){
  const a = av(); if(!a.alunos.length) return;
  const nome = prompt('Nome da turma:', [a.curso, a.disciplina].filter(Boolean).join(' · ')); if(nome === null) return;
  const t = {id: 'T' + novoId().slice(1), nome: nome.trim() || 'Turma', curso: a.curso || '', alunos: a.alunos.map(x => ({nome: x.nome, ra: x.ra || '', cpf: x.cpf || ''})), atualizada: new Date().toISOString()};
  db.turmas = db.turmas || {}; db.turmas[t.id] = t; a.turmaId = t.id; salvarDB(); render(); toast('Turma salva');
}
// turma mudou depois que a avaliação copiou a lista (e as provas ainda não foram geradas)
function turmaDesatualizada(a){
  const t = a.turmaId && db.turmas && db.turmas[a.turmaId];
  return !!(t && !a.gerado && assinAlunos(t.alunos) + t.alunos.map(x => x.ra + x.cpf).join() !== assinAlunos(a.alunos) + a.alunos.map(x => (x.ra || '') + (x.cpf || '')).join());
}

// ---------- exame sem nome: o professor escolhe só a quantidade de provas
const ehExame = a => /exame/i.test(a.chamada || '');
const semNome = a => a.semNome != null ? !!a.semNome : ehExame(a);
const qtdProvas = a => Math.max(1, Math.min(300, Math.round(+a.qtdProvas || 0) || 10));
// quantas provas serão geradas (sem contar a extra em branco das provas com lista)
const nProvas = a => semNome(a) ? qtdProvas(a) : a.alunos.length;
function setSemNome(v){
  const a = av(); if(semNome(a) === v) return;
  if(a.gerado && !alteraGerado()) return render();
  a.semNome = v; if(v && !a.qtdProvas) a.qtdProvas = a.alunos.length || 10;
  salvarDB(); render();
}
function setQtd(v){
  const a = av(), x = Math.round(+String(v).replace(',', '.'));
  if(!x || x < 1 || x > 300){ toast('Escolha de 1 a 300 provas'); return render(); }
  if(x === qtdProvas(a)) return;
  if(a.gerado && !alteraGerado()) return render();
  a.qtdProvas = x; salvarDB(); render();
}
function cartaoAlunos(a){
  const L = turmasLista().filter(t => t.alunos.length);
  let h = '<div class="card"><div class="passo">4</div><h2>Alunos</h2>';
  if(ehExame(a) || a.semNome) h += '<label class="chk"><input type="checkbox"' + (semNome(a) ? ' checked' : '') + ' onchange="setSemNome(this.checked)"> Provas sem nome (o aluno escreve o nome na prova)</label>';
  if(semNome(a)){
    return h + '<label class="campo" style="margin-top:8px"><span>Quantidade de provas</span><input type="number" min="1" max="300" inputmode="numeric" value="' + qtdProvas(a) + '" onchange="setQtd(this.value)"></label>' +
      '<p class="lbl">Cada prova sai com NOME e CPF em branco para o aluno preencher à mão. Na correção, o app pede o nome do aluno depois de ler a folha. Só as provas corrigidas entram no relatório.</p></div>';
  }
  const t = a.turmaId && db.turmas && db.turmas[a.turmaId];
  if(L.length) h += '<label class="campo"><span>Usar turma salva</span><select onchange="usarTurma(this.value)"><option value="">' + (t ? esc(t.nome || 'Turma') : 'Escolha a turma…') + '</option>' +
    L.filter(x => !t || x.id !== t.id).map(x => '<option value="' + x.id + '">' + esc(x.nome || 'Turma') + ' (' + x.alunos.length + ')</option>').join('') + '</select></label>';
  if(turmaDesatualizada(a)) h += '<div class="alerta">A turma "' + esc(t.nome) + '" mudou depois que a lista foi copiada para esta avaliação. <button class="link" onclick="usarTurma(\'' + t.id + '\')">Atualizar lista</button></div>';
  h += (a.alunos.length ? '<p><b>' + a.alunos.length + ' alunos</b> na lista' + (t ? ' (turma ' + esc(t.nome || '') + ')' : '') + '.</p><details><summary class="lbl">Ver lista</summary><ol class="alunos">' +
       a.alunos.map(x => '<li>' + esc(x.nome) + (x.ra ? ' <span class="lbl">RA ' + esc(x.ra) + '</span>' : '') + (x.cpf ? ' <span class="lbl">CPF ' + esc(x.cpf) + '</span>' : '') + '</li>').join('') + '</ol></details>'
     : '<p class="muted">' + (L.length ? 'Escolha uma turma salva acima, ou envie' : 'Envie') + ' uma planilha com as colunas Nome, RA e CPF, ou cole a lista abaixo (uma linha por aluno: nome, RA e/ou CPF separados por tabulação ou ponto e vírgula). Do CPF, o app guarda e imprime só os 3 primeiros números e os 2 dígitos finais.</p>') +
    '<details style="margin-top:8px"' + (a.alunos.length || L.length ? '' : ' open') + '><summary class="lbl">' + (a.alunos.length ? 'Usar outra lista' : 'Colar lista ou enviar planilha') + '</summary>' +
    '<textarea id="txtAlunos" rows="4" style="margin-top:8px" placeholder="Maria da Silva;12345;123.456.789-01&#10;João Souza;12346;987.654.321-00"></textarea>' +
    '<div class="row" style="margin-top:8px"><button class="btn sec" onclick="usarListaColada()">Usar lista colada</button>' +
    '<button class="btn sec" onclick="$(\'#arqAlunos\').click()">Enviar planilha</button></div></details>' +
    (a.alunos.length && !t ? '<div class="row" style="margin-top:8px"><button class="btn sec" onclick="salvarComoTurma()">Salvar esta lista como turma</button></div>' : '');
  return h + '</div>';
}
