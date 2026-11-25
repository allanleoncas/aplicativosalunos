/* Mudança de endereço: o Corretor de Provas agora é uma funcionalidade do SimulaPro.
 * Só age no endereço antigo (GitHub Pages).
 * - Quem não tem nada salvo neste navegador vai direto para o SimulaPro.
 * - Quem tem avaliações ou turmas salvas vê um aviso com o backup (para importar no SimulaPro)
 *   e pode continuar usando o app aqui até passar tudo. Nada é apagado.
 */
'use strict';
const SIMULAPRO_URL = 'https://allanleon.com.br/SimulaPro/';
const ENDERECO_ANTIGO = /github\.io$/i.test(location.hostname) || /[?&]endereco_antigo=1/.test(location.search);

// lê o que está salvo sem abrir o app (antes da senha local)
async function dadosAntigos(){
  let d = null;
  try { d = await IDB.get('db'); } catch(e){ return {erro: true}; }
  let legado = false; try { legado = !!localStorage.getItem('corretorProvas:v1'); } catch(e){}
  const avs = Object.values((d && d.avaliacoes) || {}).filter(a => a && a.id !== 'DEMO');
  const turmas = Object.values((d && d.turmas) || {}).filter(t => t && (t.alunos || []).length);
  return {avs: avs.length, turmas: turmas.length, legado};
}

// true = saiu da página (redirecionou)
async function checarMudanca(){
  if(!ENDERECO_ANTIGO) return false;
  const q = await dadosAntigos();
  if(q.erro || q.avs || q.turmas || q.legado) return false; // tem dados (ou não deu para ler): fica e mostra o aviso
  location.replace(SIMULAPRO_URL);
  return true;
}

function faixaMudanca(){
  if(!ENDERECO_ANTIGO || document.getElementById('faixaMudanca')) return;
  const f = document.createElement('div');
  f.id = 'faixaMudanca';
  f.style.cssText = 'background:#FF3B5F;color:#fff;padding:10px 14px;font-size:14px;font-weight:600;text-align:center;cursor:pointer;line-height:1.35';
  f.innerHTML = 'O Corretor de Provas agora faz parte do SimulaPro. Toque aqui para levar as suas avaliações.';
  f.onclick = avisoMudanca;
  document.body.insertBefore(f, document.body.firstChild);
}

function avisoMudanca(){
  if(!ENDERECO_ANTIGO) return;
  const nA = Object.values(db.avaliacoes || {}).filter(a => a.id !== 'DEMO').length;
  const nT = Object.values(db.turmas || {}).filter(t => (t.alunos || []).length).length;
  const partes = [nA ? nA + (nA > 1 ? ' avaliações' : ' avaliação') : '', nT ? nT + (nT > 1 ? ' turmas' : ' turma') : ''].filter(Boolean).join(' e ');
  let m = document.getElementById('modalMudanca');
  if(!m){ m = document.createElement('div'); m.id = 'modalMudanca'; document.body.appendChild(m); }
  m.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(10,14,25,.6);display:flex;align-items:center;justify-content:center;padding:16px';
  m.innerHTML = '<div class="card" style="max-width:460px;width:100%;max-height:92vh;overflow:auto">' +
    '<h2>O Corretor de Provas mudou de endereço</h2>' +
    '<p class="muted" style="margin-top:6px">Agora ele faz parte do <b>SimulaPro</b>, em <b>allanleon.com.br/SimulaPro</b>. Lá as avaliações ficam guardadas na sua conta e aparecem no computador e no celular.</p>' +
    '<p class="muted" style="margin-top:8px">Este navegador tem ' + (partes || 'dados salvos') + '. Para levar para o SimulaPro:</p>' +
    '<ol class="muted" style="margin:6px 0 0 20px;padding:0">' +
    '<li>Baixe o backup aqui (um arquivo para cada avaliação' + (nT ? ' e uma planilha para cada turma' : '') + ').</li>' +
    '<li>Entre no SimulaPro e use <b>Avaliações › Importar avaliação ou gabaritos (.json)</b> para cada arquivo' + (nT ? '. As turmas entram pela opção de turma, enviando a planilha' : '') + '.</li></ol>' +
    '<p class="lbl" style="margin-top:8px">As folhas já impressas continuam valendo no SimulaPro. Nada é apagado daqui.</p>' +
    '<div class="stack" style="margin-top:14px">' +
    (nA || nT ? '<button class="btn sec" onclick="backupTudo()">Baixar backup de tudo</button>' : '') +
    '<a class="btn acc" href="' + SIMULAPRO_URL + '">Ir para o SimulaPro</a>' +
    '<button class="btn sec" onclick="fecharMudanca()">Continuar aqui por enquanto</button></div></div>';
}
function fecharMudanca(){ const m = document.getElementById('modalMudanca'); if(m) m.remove(); try { sessionStorage.setItem('cp:avisoMudanca', '1'); } catch(e){} }

const csvCel = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
async function backupTudo(){
  const avs = Object.values(db.avaliacoes || {}).filter(a => a.id !== 'DEMO');
  const turmas = Object.values(db.turmas || {}).filter(t => (t.alunos || []).length);
  const pausa = () => new Promise(r => setTimeout(r, 700));
  for(const a of avs){
    const gerados = alunosGerados(a);
    baixarBlob(new Blob([JSON.stringify({formato: 'corretor-provas-avaliacao', id: a.id,
      alunos: gerados.length ? gerados : [{codigo: 'X', nome: 'x', gabarito: 'A'}], avaliacao: a})], {type: 'application/json'}),
      'backup_' + nomeArq((a.disciplina || '') + '_' + (a.titulo || a.id)) + '.json');
    await pausa();
  }
  for(const t of turmas){
    const linhas = [['Nome', 'RA', 'CPF']].concat(t.alunos.map(x => [x.nome, x.ra || '', x.cpf || '']));
    baixarBlob(new Blob(['﻿' + linhas.map(l => l.map(csvCel).join(',')).join('\r\n')], {type: 'text/csv'}),
      'turma_' + nomeArq(t.nome || t.id) + '.csv');
    await pausa();
  }
  toast((avs.length + turmas.length) + ' arquivo(s) baixado(s). Se o navegador perguntar, permita vários downloads.');
}

// chamado depois que o app abriu com os dados deste navegador
function aposAbrirMudanca(){
  if(!ENDERECO_ANTIGO) return;
  faixaMudanca();
  let visto = false; try { visto = !!sessionStorage.getItem('cp:avisoMudanca'); } catch(e){}
  if(!visto) avisoMudanca();
}
