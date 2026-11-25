// SimulaPro — login, sincronização com o servidor, administrador e instalação do app.
// Os dados de cada professor (avaliações, turmas e perfil) ficam no aparelho (IndexedDB, uma chave por conta)
// e são copiados para o servidor (api/index.php). Assim o professor monta a prova no computador e corrige
// no celular. Sem internet o app continua funcionando e envia depois.
'use strict';

const CP_API = 'api/index.php';
// No GitHub Pages (sem servidor) o app funciona sem contas, com os dados só no aparelho.
// Nos outros endereços (allanleon.com.br/SimulaPro) há login e os dados vão para o servidor.
const MODO_LOCAL = /github\.io$/i.test(location.hostname) || location.protocol === 'file:' || /[?&]local=1/.test(location.search);
let sessao = null;               // {token, usuario}
let sincronizando = false, syncDeNovo = false, syncTimer = null, syncEstado = 'ok';

// ------------------------------------------------------------ chamadas ao servidor
async function api(acao, dados = {}){
  const r = await fetch(CP_API, {method: 'POST', headers: {'Content-Type': 'application/json',
    ...(sessao ? {'Authorization': 'Bearer ' + sessao.token} : {})}, body: JSON.stringify({acao, ...dados})});
  let j = {}; try { j = await r.json(); } catch(e){}
  if(!r.ok || !j.ok){ const e = new Error(j.erro || 'Falha na comunicação com o servidor (' + r.status + ').'); e.status = r.status; e.dados = j; throw e; }
  return j;
}
function guardarSessao(s){ sessao = s; try { s ? localStorage.setItem('cp:sessao', JSON.stringify(s)) : localStorage.removeItem('cp:sessao'); } catch(e){} }

// ------------------------------------------------------------ início
async function iniciarApp(){
  registrarSW();
  if(typeof checarMudanca === 'function' && await checarMudanca()) return; // endereço antigo sem dados: vai para o SimulaPro
  if(MODO_LOCAL){ DB_CHAVE = 'db'; entradaLocal(async () => { await carregarDB(); aba('inicio'); if(typeof aposAbrirMudanca === 'function') aposAbrirMudanca(); }); return; }
  try { sessao = JSON.parse(localStorage.getItem('cp:sessao') || 'null'); } catch(e){ sessao = null; }
  if(!sessao){ await telaInicial(); return; }
  await abrirConta();
  // confere a sessão no servidor (sem internet, segue com o que está no aparelho)
  try { const r = await api('eu'); guardarSessao({...sessao, usuario: r.usuario}); atualizarTopo(); if(r.usuario.trocarSenha) trocarSenha(true); sincronizar(); }
  catch(e){ if(e.status === 401 || e.status === 403) sairLocal(e.message); else marcarSync('offline'); }
}
async function abrirConta(){
  DB_CHAVE = 'db:' + sessao.usuario.id;
  db = {versao: 2, avaliacoes: {}, ativa: null};
  await carregarDB();
  if(!db.professor) db.professor = sessao.usuario.nome;
  $('#login').classList.remove('on');
  atualizarTopo(); aba('inicio');
}
function atualizarTopo(){
  const u = sessao && sessao.usuario; if(!u) return;
  const ini = u.nome.replace(/\b(prof|profa|profª|professor|professora|dr|dra|me|ma|msc|esp)\.?\s+/gi, '').split(/\s+/).filter(Boolean);
  $('#btnConta').textContent = ((ini[0] || '?')[0] + (ini.length > 1 ? ini[ini.length - 1][0] : '')).toUpperCase();
  $('#btnConta').style.display = '';
}

// ------------------------------------------------------------ senha de entrada (versão sem servidor)
// No GitHub Pages não há contas. A tela de entrada pede os 5 últimos dígitos do CPF do professor.
// A senha é criada no 1º acesso e fica só neste aparelho (localStorage), guardada embaralhada (PBKDF2 com sal).
// Nada do CPF vai para o código nem para a internet. Isso esconde o app de quem pega o aparelho;
// os dados continuam no navegador, como sempre.
const SL_CHAVE = 'cp:senhaLocal', SL_ABERTO = 'cp:liberado', SL_ERROS = 'cp:errosSenha';
let slDepois = null;
function slLer(k, padrao){ try { return JSON.parse(localStorage.getItem(k) || 'null') || padrao; } catch(e){ return padrao; } }
function slGravar(k, v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
function slHex(buf){ return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function slHash(senha, sal){
  const enc = new TextEncoder();
  if(window.crypto && crypto.subtle){
    const k = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
    return slHex(await crypto.subtle.deriveBits({name: 'PBKDF2', salt: enc.encode(sal), iterations: 150000, hash: 'SHA-256'}, k, 256));
  }
  let h = 2166136261; const t = sal + '|' + senha; for(let i = 0; i < t.length; i++){ h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return 'f' + (h >>> 0).toString(16);
}
function slLiberado(){ try { return sessionStorage.getItem(SL_ABERTO) === '1'; } catch(e){ return false; } }
function slMarcar(b){ try { b ? sessionStorage.setItem(SL_ABERTO, '1') : sessionStorage.removeItem(SL_ABERTO); } catch(e){} }
function entradaLocal(depois){
  slDepois = depois || slDepois;
  $('#btnConta').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  if(slLiberado() && slLer(SL_CHAVE, null)){ slEntrou(); return; }
  telaSenhaLocal();
}
function slEntrou(){ slMarcar(true); $('#login').classList.remove('on'); $('#login').innerHTML = ''; $('#btnConta').style.display = '';
  const f = slDepois; slDepois = null; if(f) f(); }
function slCampo(id, rotulo){ return '<label class="campo"><span>' + rotulo + '</span><input id="' + id + '" type="password" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="off" required placeholder="•••••" style="font-size:22px;letter-spacing:.4em;text-align:center"></label>'; }
function telaSenhaLocal(msg, modo){
  const tem = !!slLer(SL_CHAVE, null), criar = !tem || modo === 'trocar';
  $('#btnConta').style.display = 'none';
  const L = $('#login'); L.classList.add('on');
  L.innerHTML = '<div class="login-caixa"><div class="login-logo"><svg width="34" height="34" viewBox="0 0 24 24"><circle cx="7" cy="8" r="3.4" fill="#FF3B5F"/><circle cx="17" cy="8" r="3.4" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="7" cy="17" r="3.4" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="17" cy="17" r="3.4" fill="#fff"/></svg></div>' +
    '<h1>SimulaPro</h1><p class="muted" style="margin:4px 0 18px">Provas, exames e simulados: provas individuais, correção pela câmera e relatório de notas.</p>' +
    (msg ? '<div class="alerta" style="margin-bottom:12px">' + esc(msg) + '</div>' : '') +
    '<form class="card" onsubmit="event.preventDefault();' + (criar ? 'slCriar(' + (modo === 'trocar') + ')' : 'slEntrar()') + '">' +
    (criar ? '<h2>' + (modo === 'trocar' ? 'Nova senha de entrada' : 'Crie sua senha de entrada') + '</h2>' +
        '<p class="muted" style="margin-bottom:10px">Use os <b>5 últimos dígitos do seu CPF</b>. A senha fica guardada só neste aparelho e será pedida sempre que o app for aberto.</p>' +
        slCampo('slS1', 'Os 5 últimos dígitos do CPF') + slCampo('slS2', 'Digite de novo')
      : '<h2>Entrar</h2>' + slCampo('slS1', 'Senha: os 5 últimos dígitos do seu CPF')) +
    '<button class="btn acc" id="lgBotao" type="submit" style="margin-top:8px">' + (criar ? 'Salvar e entrar' : 'Entrar') + '</button>' +
    (modo === 'trocar' ? '<button class="btn sec" type="button" style="margin-top:8px" onclick="slEntrou()">Cancelar</button>' : '') +
    '</form>' +
    (criar ? '' : '<p class="lbl" style="text-align:center;margin-top:10px">A senha vale só para este aparelho. Os dados das provas ficam no navegador e não vão para a internet.</p>') +
    '</div>';
  setTimeout(() => { const i = $('#slS1'); if(i) i.focus(); }, 50);
}
function slValida(v){ return /^\d{5}$/.test(v); }
async function slCriar(trocando){
  const a = $('#slS1').value.trim(), b = $('#slS2').value.trim();
  if(!slValida(a)){ telaSenhaLocal('Digite exatamente 5 números.', trocando ? 'trocar' : null); return; }
  if(a !== b){ telaSenhaLocal('As duas senhas não são iguais. Tente de novo.', trocando ? 'trocar' : null); return; }
  const sal = slHex(crypto.getRandomValues(new Uint8Array(16)));
  slGravar(SL_CHAVE, {sal, hash: await slHash(a, sal)}); slGravar(SL_ERROS, null);
  if(trocando) toast('Senha trocada.');
  slEntrou();
}
async function slEntrar(){
  const v = $('#slS1').value.trim(), s = slLer(SL_CHAVE, null), e = slLer(SL_ERROS, {n: 0, ate: 0});
  if(e.ate > Date.now()){ telaSenhaLocal('Muitas tentativas erradas. Espere ' + Math.ceil((e.ate - Date.now()) / 1000) + ' segundos.'); return; }
  if(slValida(v) && s && await slHash(v, s.sal) === s.hash){ slGravar(SL_ERROS, null); slEntrou(); return; }
  e.n = (e.n || 0) + 1; if(e.n >= 5){ e.n = 0; e.ate = Date.now() + 60000; } slGravar(SL_ERROS, e);
  telaSenhaLocal(e.ate > Date.now() ? 'Senha errada 5 vezes. Espere 1 minuto para tentar de novo.' : 'Senha errada. Use os 5 últimos dígitos do seu CPF.');
}
function menuLocal(){
  abrirFolha('<h2 style="margin-bottom:2px">Entrada do app</h2><p class="lbl">Senha: os 5 últimos dígitos do seu CPF (só neste aparelho)</p>' +
    '<div class="stack" style="margin-top:14px">' +
    '<button class="btn" onclick="fecharFolha();bloquearLocal()">Bloquear agora</button>' +
    '<button class="btn sec" onclick="fecharFolha();telaSenhaLocal(null,\'trocar\')">Trocar senha</button>' +
    botaoInstalar('btn sec') + '</div>');
}
function bloquearLocal(){ slMarcar(false); location.reload(); }

// ------------------------------------------------------------ tela de login
async function telaInicial(msg){
  // sem nenhuma conta no servidor: configuração inicial (cria o administrador)
  let modo = 'entrar';
  try { const r = await fetch(CP_API, {cache: 'no-store'}); const j = await r.json(); if(j.ok && !j.temUsuarios) modo = 'configurar'; } catch(e){}
  telaLogin(msg, modo);
}
function telaLogin(msg, modo = 'entrar'){
  $('#btnConta').style.display = 'none';
  const L = $('#login'); L.classList.add('on');
  const cfg = modo === 'configurar';
  L.innerHTML = '<div class="login-caixa"><div class="login-logo"><svg width="34" height="34" viewBox="0 0 24 24"><circle cx="7" cy="8" r="3.4" fill="#FF3B5F"/><circle cx="17" cy="8" r="3.4" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="7" cy="17" r="3.4" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="17" cy="17" r="3.4" fill="#fff"/></svg></div>' +
    '<h1>SimulaPro</h1><p class="muted" style="margin:4px 0 18px">Provas, exames e simulados: provas individuais, correção pela câmera e relatório de notas.</p>' +
    (msg ? '<div class="alerta" style="margin-bottom:12px">' + esc(msg) + '</div>' : '') +
    '<form class="card" onsubmit="event.preventDefault();' + (cfg ? 'fazerConfigurar()' : 'fazerLogin()') + '">' +
    (cfg ? '<h2>Configuração inicial</h2><p class="muted" style="margin-bottom:10px">Ainda não há nenhuma conta. Esta será a conta do <b>administrador</b>, que cadastra os outros professores.</p>' +
        '<label class="campo"><span>Nome completo</span><input id="lgNome" type="text" autocomplete="name" required placeholder="Ex.: Prof. Dr. Fulano de Tal"></label>'
      : '<h2>Entrar</h2>') +
    '<label class="campo"><span>Usuário</span><input id="lgUsuario" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="nome.sobrenome"></label>' +
    '<label class="campo"><span>Senha' + (cfg ? ' (mínimo 5 caracteres)' : '') + '</span><input id="lgSenha" type="password" autocomplete="' + (cfg ? 'new-password' : 'current-password') + '" required minlength="' + (cfg ? 5 : 1) + '" style="width:100%;padding:11px 12px;border:1.5px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font-size:15px"></label>' +
    '<button class="btn acc" id="lgBotao" type="submit" style="margin-top:8px">' + (cfg ? 'Criar e entrar' : 'Entrar') + '</button></form>' +
    (cfg ? '' : '<p class="lbl" style="text-align:center;margin-top:10px">Só entram professores cadastrados pelo administrador. Esqueceu a senha? Peça uma senha nova a ele.</p>') +
    '</div>';
  setTimeout(() => { const i = $(cfg ? '#lgNome' : '#lgUsuario'); if(i) i.focus(); }, 50);
}
function ocupado(b){ const x = $('#lgBotao'); if(x){ x.disabled = b; x.style.opacity = b ? .6 : 1; } }
async function entrouNaConta(r){
  guardarSessao({token: r.token, usuario: r.usuario});
  await abrirConta(); sincronizar(true);
  if(r.usuario.trocarSenha) trocarSenha(true);
}
async function fazerLogin(){
  ocupado(true);
  const usuario = $('#lgUsuario').value;
  try { await entrouNaConta(await api('entrar', {usuario, senha: $('#lgSenha').value})); }
  catch(e){ ocupado(false); telaLogin(e.status ? e.message : 'Sem conexão com o servidor. Confira a internet e tente de novo.'); $('#lgUsuario').value = usuario; }
}
async function fazerConfigurar(){
  ocupado(true);
  const nome = $('#lgNome').value, usuario = $('#lgUsuario').value;
  try { await entrouNaConta(await api('configurar', {nome, usuario, senha: $('#lgSenha').value})); toast('Pronto! Você é o administrador.'); }
  catch(e){ ocupado(false); if(e.status === 409){ telaLogin(e.message); return; } telaLogin(e.message, 'configurar'); $('#lgNome').value = nome; $('#lgUsuario').value = usuario; }
}

// ------------------------------------------------------------ menu da conta
function menuConta(){
  if(MODO_LOCAL){ menuLocal(); return; }
  const u = sessao.usuario;
  abrirFolha('<h2 style="margin-bottom:2px">' + esc(u.nome) + '</h2><p class="lbl">' + 'Usuário: ' + esc(u.usuario || u.email) + (u.papel === 'admin' ? ' · administrador' : '') + '</p>' +
    '<p class="lbl" style="margin-top:6px">' + textoSync() + '</p>' +
    '<div class="stack" style="margin-top:14px">' +
    (u.papel === 'admin' ? '<button class="btn" onclick="fecharFolha();aba(\'admin\')">Administração (professores)</button>' : '') +
    '<button class="btn sec" onclick="fecharFolha();sincronizar(true)">Sincronizar agora</button>' +
    '<button class="btn sec" onclick="trocarSenha()">Trocar senha</button>' +
    botaoInstalar('btn sec') +
    '<button class="btn sec" style="color:var(--acc)" onclick="sair()">Sair</button></div>');
}
function abrirFolha(html){ let f = $('#folha'); if(!f){ f = document.createElement('div'); f.id = 'folha'; f.className = 'picker'; f.onclick = e => { if(e.target === f) fecharFolha(); }; document.body.appendChild(f); }
  f.innerHTML = '<div class="sheet">' + html + '</div>'; f.classList.add('on'); }
function fecharFolha(){ const f = $('#folha'); if(f) f.classList.remove('on'); }
function trocarSenha(obrigatoria){
  abrirFolha('<h2>' + (obrigatoria ? 'Crie uma senha nova' : 'Trocar senha') + '</h2>' + (obrigatoria ? '<p class="muted">Você entrou com uma senha provisória dada pelo administrador.</p>' : '') +
    '<form onsubmit="event.preventDefault();salvarSenha()"><label class="campo"><span>Senha atual' + (obrigatoria ? ' (a provisória)' : '') + '</span><input id="snAtual" type="password" required autocomplete="current-password"></label>' +
    '<label class="campo"><span>Nova senha (mínimo 5 caracteres)</span><input id="snNova" type="password" minlength="5" required autocomplete="new-password"></label>' +
    '<div class="stack" style="margin-top:10px"><button class="btn acc" type="submit">Salvar</button>' + (obrigatoria ? '' : '<button class="btn sec" type="button" onclick="fecharFolha()">Cancelar</button>') + '</div></form>');
}
async function salvarSenha(){
  try { await api('senha', {atual: $('#snAtual').value, nova: $('#snNova').value}); sessao.usuario.trocarSenha = false; guardarSessao(sessao); fecharFolha(); toast('Senha alterada'); }
  catch(e){ alert(e.message); }
}
async function sair(){
  fecharFolha();
  if(navigator.onLine){ try { await sincronizar(true); } catch(e){} }
  const pendente = temPendencias();
  if(pendente && !confirm('Há alterações que ainda não foram enviadas ao servidor (sem internet?). Se sair agora, elas ficam só neste aparelho. Sair mesmo assim?')) return;
  try { await api('sair'); } catch(e){}
  // sem pendências, apaga a cópia deste aparelho (útil em computador compartilhado)
  if(!pendente){ try { await IDB.set(DB_CHAVE, null); } catch(e){} }
  sairLocal();
}
function sairLocal(msg){ guardarSessao(null); db = {versao: 2, avaliacoes: {}, ativa: null}; DB_CHAVE = 'db'; telaInicial(msg); }

// ------------------------------------------------------------ sincronização
function hashAv(a){ const s = JSON.stringify(a); let h = 2166136261; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; }
function agendarSync(){ if(!sessao) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => sincronizar(), 2500); }
function marcarSync(e){ syncEstado = e; const el = $('#syncInfo'); if(el){ el.textContent = textoSync(); el.dataset.e = e; } }
function textoSync(){ return {ok: '☁ Salvo no servidor', enviando: '↻ Sincronizando…', offline: '⚠ Sem internet: salvo só neste aparelho', erro: '⚠ Não foi possível sincronizar'}[syncEstado] || ''; }
// O que vai para o servidor: avaliações, turmas e o perfil (nome do professor e cabeçalho da instituição).
// Cada tipo guarda em db o que já foi sincronizado (_sinc*) e o que foi excluído aqui (_excluir*).
const TIPOS_SYNC = [
  {tipo: 'avaliacoes', sinc: '_sinc', excl: '_excluir', itens: () => db.avaliacoes,
    tirar: id => { delete db.avaliacoes[id]; if(db.ativa === id) db.ativa = null; }, por: (id, x) => { db.avaliacoes[id] = x; }},
  {tipo: 'turmas', sinc: '_sincT', excl: '_excluirT', itens: () => (db.turmas = db.turmas || {}),
    tirar: id => { delete db.turmas[id]; }, por: (id, x) => { db.turmas = db.turmas || {}; db.turmas[id] = x; }},
  {tipo: 'perfil', sinc: '_sincP', excl: '_excluirP', itens: () => ({perfil: {id: 'perfil', professor: db.professor || '', cabecalhoInst: db.cabecalhoInst || null}}),
    tirar: () => {}, por: (id, x) => { if(x.professor) db.professor = x.professor; db.cabecalhoInst = x.cabecalhoInst || null; }},
];
function temPendencias(){
  return TIPOS_SYNC.some(T => { const m = db[T.sinc] || {};
    return (db[T.excl] || []).length || Object.values(T.itens()).some(x => !m[x.id] || m[x.id].h !== hashAv(x)); });
}
async function sincronizarTipo(T){
  let mudou = false;
  const m = db[T.sinc] = db[T.sinc] || {}; db[T.excl] = db[T.excl] || [];
  // 1. exclusões feitas neste aparelho
  for(const id of db[T.excl].slice()){ await api('excluir', {tipo: T.tipo, id}); delete m[id]; db[T.excl] = db[T.excl].filter(x => x !== id); }
  // 2. o que mudou no servidor (outro aparelho)
  const {itens: lista} = await api('listar', {tipo: T.tipo});
  const baixar = [];
  for(const s of lista){
    const local = T.itens()[s.id], meta = m[s.id];
    const intocada = local && meta && hashAv(local) === meta.h;
    if(s.excluida){ if(local && (!meta || intocada) && s.t > (meta ? meta.t : 0)){ T.tirar(s.id); delete m[s.id]; mudou = true; } continue; }
    // perfil: um aparelho novo (sem nada sincronizado) recebe o do servidor
    if(!local || (s.t > (meta ? meta.t : 0) && (!meta || intocada))) baixar.push(s.id);
  }
  for(let i = 0; i < baixar.length; i += 20){
    const r = await api('baixar', {tipo: T.tipo, ids: baixar.slice(i, i + 20)});
    Object.entries(r.itens).forEach(([id, x]) => { const d = JSON.parse(x.txt); T.por(id, d); m[id] = {t: x.t, h: hashAv(T.itens()[id] || d)}; mudou = true; });
  }
  // 3. o que mudou neste aparelho
  for(const x of Object.values(T.itens())){
    const h = hashAv(x);
    if(m[x.id] && m[x.id].h === h) continue;
    const r = await api('enviar', {tipo: T.tipo, id: x.id, dadosTxt: JSON.stringify(x)});
    m[x.id] = {t: r.t, h};
  }
  return mudou;
}
async function sincronizar(avisar){
  if(!sessao) return;
  if(sincronizando){ syncDeNovo = true; return; }
  if(!navigator.onLine){ marcarSync('offline'); return; }
  sincronizando = true; marcarSync('enviando');
  let mudou = false;
  try {
    for(const T of TIPOS_SYNC) if(await sincronizarTipo(T)) mudou = true;
    await IDB.set(DB_CHAVE, db);
    marcarSync('ok');
    if(avisar) toast('Tudo sincronizado');
  } catch(e){
    if(e.status === 401 || e.status === 403){ sincronizando = false; sairLocal(e.message); return; }
    marcarSync(navigator.onLine ? 'erro' : 'offline'); console.warn(e);
    if(avisar) toast(e.message);
  }
  sincronizando = false;
  if(mudou) render();
  if(syncDeNovo){ syncDeNovo = false; agendarSync(); }
}
window.addEventListener('online', () => sincronizar());
window.addEventListener('offline', () => marcarSync('offline'));
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && sessao) sincronizar(); });

// ------------------------------------------------------------ administração
let adminLista = null;
async function renderAdmin(){
  const el = $('#v-admin');
  if(!sessao || sessao.usuario.papel !== 'admin'){ el.innerHTML = '<div class="card">Só o administrador vê esta tela.</div>'; return; }
  if(!adminLista){ el.innerHTML = '<button class="link" onclick="aba(\'inicio\')">‹ Início</button><div class="card"><p class="muted">Carregando professores…</p></div>';
    try { adminLista = (await api('admin_usuarios')).usuarios; } catch(e){ el.innerHTML = '<div class="card"><div class="alerta">' + esc(e.message) + '</div></div>'; return; } }
  const L = adminLista, pend = L.filter(u => u.status === 'bloqueado').length;
  const tot = L.reduce((s, u) => ({av: s.av + u.uso.avaliacoes, pr: s.pr + u.uso.provas, co: s.co + u.uso.corrigidas}), {av: 0, pr: 0, co: 0});
  const data = t => t ? new Date(t * 1000).toLocaleDateString('pt-BR') : 'nunca';
  let h = '<button class="link" onclick="aba(\'inicio\')">‹ Início</button><h2 style="margin:4px 2px 10px">Administração</h2>' +
    '<div class="painel"><div class="kp"><span class="lbl">Professores</span><b>' + L.length + '</b></div><div class="kp"><span class="lbl">Bloqueados</span><b>' + pend + '</b></div>' +
    '<div class="kp"><span class="lbl">Provas geradas</span><b>' + tot.pr + '</b></div><div class="kp"><span class="lbl">Provas corrigidas</span><b>' + tot.co + '</b></div></div>' +
    '<form class="card" onsubmit="event.preventDefault();adminCriar()"><h2>Cadastrar professor</h2>' +
    '<p class="lbl" style="margin-bottom:8px">Só entram professores cadastrados aqui. O app cria uma senha provisória para você enviar; no primeiro acesso, o professor cria a senha dele.</p>' +
    '<label class="campo"><span>Nome completo</span><input id="adNome" type="text" required placeholder="Ex.: Prof. Daniel Manzano"></label>' +
    '<label class="campo"><span>Usuário</span><input id="adUsuario" type="text" required autocapitalize="none" spellcheck="false" placeholder="nome.sobrenome"></label>' +
    '<button class="btn acc" type="submit" style="margin-top:8px">Cadastrar</button></form>';
  L.forEach(u => {
    const eu = u.id === sessao.usuario.id;
    const pill = u.status === 'ativo' ? '<span class="pill ok">' + (u.trocarSenha ? 'senha provisória' : 'ativo') + '</span>' : '<span class="pill" style="background:#fde2e2;color:#a3122e">bloqueado</span>';
    h += '<div class="card"><div class="row" style="align-items:flex-start"><div style="flex:1;min-width:0"><b>' + esc(u.nome) + '</b>' + (u.papel === 'admin' ? ' <span class="pill">admin</span>' : '') +
      '<div class="lbl" style="word-break:break-all">Usuário: ' + esc(u.usuario || u.email) + '</div><div class="lbl">Cadastro ' + data(u.criado) + ' · último acesso ' + data(u.ultimo) + '</div></div><div style="flex:none">' + pill + '</div></div>' +
      '<p class="lbl" style="margin-top:8px">' + u.uso.avaliacoes + ' avaliações · ' + u.uso.provas + ' provas geradas · ' + u.uso.corrigidas + ' corrigidas · ' + u.uso.alunos + ' alunos</p>' +
      (eu ? '<p class="lbl" style="margin-top:6px">Esta é a sua conta.</p>' : '<div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px">' +
        (u.status !== 'ativo' ? '<button class="btn acc" style="flex:1" onclick="adminMudar(\'' + u.id + '\',{status:\'ativo\'})">Desbloquear</button>' : '') +
        (u.status !== 'bloqueado' ? '<button class="btn sec" style="flex:1" onclick="adminMudar(\'' + u.id + '\',{status:\'bloqueado\'},\'Bloquear ' + esc(u.nome).replace(/'/g, '') + '?\')">Bloquear</button>' : '') +
        (u.status === 'ativo' ? '<button class="btn sec" style="flex:1" onclick="adminMudar(\'' + u.id + '\',{papel:\'' + (u.papel === 'admin' ? 'professor' : 'admin') + '\'})">' + (u.papel === 'admin' ? 'Tirar admin' : 'Tornar admin') + '</button>' +
          '<button class="btn sec" style="flex:1" onclick="adminSenha(\'' + u.id + '\')">Senha nova</button>' : '') +
        '<button class="btn sec" style="flex:1;color:var(--acc)" onclick="adminExcluir(\'' + u.id + '\')">Excluir</button></div>') + '</div>';
  });
  h += '<button class="btn sec" onclick="adminLista=null;renderAdmin()">Atualizar lista</button>';
  el.innerHTML = h;
}
async function adminMudar(uid, m, pergunta){
  if(pergunta && !confirm(pergunta)) return;
  try { await api('admin_mudar', {uid, ...m}); adminLista = null; renderAdmin(); toast('Feito'); } catch(e){ alert(e.message); }
}
async function adminCriar(){
  const nome = $('#adNome').value, usuario = $('#adUsuario').value.trim().toLowerCase();
  try { const r = await api('admin_criar', {nome, usuario}); adminLista = null; await renderAdmin(); mostrarSenhaProvisoria(r.usuario, r.senha, true); }
  catch(e){ alert(e.message); }
}
function mostrarSenhaProvisoria(u, senha, novo){
  abrirFolha('<h2>' + (novo ? 'Professor cadastrado' : 'Senha provisória') + '</h2><p class="muted">Envie para ' + esc(u.nome) + ' o endereço do app, o usuário e a senha provisória. No primeiro acesso, o app pede para ele criar uma senha nova.</p>' +
    '<p class="lbl" style="margin-top:12px">Endereço</p><div style="font-family:monospace;user-select:all;word-break:break-all">' + esc(location.origin + location.pathname) + '</div>' +
    '<p class="lbl" style="margin-top:8px">Usuário</p><div class="big" style="font-family:monospace;user-select:all">' + esc(u.usuario || u.email) + '</div>' +
    '<p class="lbl" style="margin-top:8px">Senha provisória</p><div class="big" style="font-family:monospace;letter-spacing:.08em;margin-bottom:14px;user-select:all">' + esc(senha) + '</div><button class="btn" onclick="fecharFolha()">Pronto</button>');
}
async function adminExcluir(uid){
  const u = adminLista.find(x => x.id === uid);
  if(!confirm('Excluir ' + u.nome + '? A conta e todas as provas, turmas e notas dele no servidor serão apagadas. Isso não pode ser desfeito.')) return;
  try { await api('admin_excluir', {uid}); adminLista = null; renderAdmin(); toast('Professor excluído'); } catch(e){ alert(e.message); }
}
async function adminSenha(uid){
  const u = adminLista.find(x => x.id === uid);
  if(!confirm('Criar uma senha provisória para ' + u.nome + '? A senha atual dele deixa de valer.')) return;
  try { const r = await api('admin_senha', {uid}); adminLista = null; await renderAdmin(); mostrarSenhaProvisoria(u, r.senha, false); } catch(e){ alert(e.message); }
}

// ------------------------------------------------------------ instalar (web app)
let pedidoInstalar = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoInstalar = e; if(abaAtual === 'inicio') render(); });
window.addEventListener('appinstalled', () => { pedidoInstalar = null; toast('App instalado'); if(abaAtual === 'inicio') render(); });
const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function botaoInstalar(cls){
  if(instalado()) return '';
  if(pedidoInstalar || ehIOS()) return '<button class="' + (cls || 'btn sec') + '" onclick="instalarApp()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>Instalar o app</button>';
  return '';
}
async function instalarApp(){
  fecharFolha();
  if(pedidoInstalar){ pedidoInstalar.prompt(); const r = await pedidoInstalar.userChoice; pedidoInstalar = null; if(r.outcome !== 'accepted') toast('Instalação cancelada'); render(); return; }
  abrirFolha('<h2>Instalar no iPhone/iPad</h2><ol class="passos"><li>No <b>Safari</b>, toque no botão <b>Compartilhar</b> (quadrado com seta para cima).</li><li>Escolha <b>Adicionar à Tela de Início</b>.</li><li>Toque em <b>Adicionar</b>. O ícone do SimulaPro aparece na tela inicial.</li></ol><button class="btn" onclick="fecharFolha()">Entendi</button>');
}
function registrarSW(){ if('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(e => console.warn(e)); }
