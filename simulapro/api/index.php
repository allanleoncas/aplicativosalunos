<?php
// SimulaPro — API do servidor (allanleon.com.br/SimulaPro/api/).
// Recebe POST com JSON {"acao": "...", ...}. A sessão vai no cabeçalho "Authorization: Bearer <token>".
//
// Contas: só entra quem o administrador cadastrou. A primeira conta (configuração inicial, quando ainda
// não há nenhuma) vira administrador. O administrador cadastra os professores com uma senha provisória,
// que o professor troca no primeiro acesso. Senhas guardadas só como resumo (password_hash).
// Dados de cada professor (avaliações, turmas e perfil) ficam em arquivos JSON fora do public_html.

declare(strict_types=1);
require __DIR__ . '/_base.php';

header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $usuarios = cp_ler(cp_arq_usuarios());
    cp_json(200, ['ok' => true, 'versao' => CP_VERSAO_API, 'temUsuarios' => count($usuarios) > 0]);
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') cp_erro(405, 'Método não aceito.');

$e = cp_entrada();
$acao = (string) ($e['acao'] ?? '');

const CP_SENHA_MIN = 5;
/** Usuário de entrada: letras minúsculas, números, ponto, hífen, sublinhado ou @ (ex.: allan.silva). */
function cp_login(string $x): string { return strtolower(trim($x)); }
function cp_login_valido(string $x): bool { return (bool) preg_match('/^[a-z0-9][a-z0-9._@-]{2,79}$/', $x); }
function cp_doc_id(string $id): bool { return (bool) preg_match('/^[A-Za-z0-9_-]{1,40}$/', $id); }
function cp_tipo(array $e): string {
    $t = (string) ($e['tipo'] ?? 'avaliacoes');
    if (!in_array($t, CP_TIPOS, true)) cp_erro(400, 'Tipo de dado inválido.');
    return $t;
}
function cp_apagar_pasta(string $dir): void {
    if (!is_dir($dir)) return;
    foreach (scandir($dir) ?: [] as $f) { if ($f === '.' || $f === '..') continue; $p = $dir . '/' . $f; is_dir($p) ? cp_apagar_pasta($p) : @unlink($p); }
    @rmdir($dir);
}
function cp_nome_valido(string $nome): string {
    $nome = trim(preg_replace('/\s+/', ' ', $nome));
    if (mb_strlen($nome) < 3 || mb_strlen($nome) > 100) cp_erro(400, 'Informe o nome completo.');
    return $nome;
}
function cp_senha_provisoria(): string {
    $alfabeto = 'abcdefghjkmnpqrstuvwxyz23456789';
    $s = ''; for ($i = 0; $i < 8; $i++) $s .= $alfabeto[random_int(0, strlen($alfabeto) - 1)];
    return $s;
}

switch ($acao) {

// ------------------------------------------------------------------ contas
case 'configurar': { // só quando ainda não existe nenhuma conta: cria o administrador
    $nome = cp_nome_valido((string) ($e['nome'] ?? ''));
    $login = cp_login((string) ($e['usuario'] ?? ''));
    $senha = (string) ($e['senha'] ?? '');
    if (!cp_login_valido($login)) cp_erro(400, 'Usuário inválido. Use letras minúsculas, números e ponto (ex.: allan.silva).');
    if (strlen($senha) < CP_SENHA_MIN) cp_erro(400, 'A senha precisa ter pelo menos ' . CP_SENHA_MIN . ' caracteres.');
    $novo = cp_alterar(cp_arq_usuarios(), function (array &$us) use ($nome, $login, $senha) {
        if (count($us) > 0) return null;
        $id = cp_id(8);
        $us[$id] = ['id' => $id, 'nome' => $nome, 'email' => $login, 'hash' => password_hash($senha, PASSWORD_DEFAULT),
            'papel' => 'admin', 'status' => 'ativo', 'criado' => time(), 'ultimo' => time(), 'falhas' => 0, 'esperaAte' => 0];
        return $us[$id];
    });
    if (!$novo) cp_erro(409, 'O SimulaPro já foi configurado. Entre com seu usuário e senha.');
    cp_json(200, ['ok' => true, 'token' => cp_criar_sessao($novo['id']), 'usuario' => cp_publico($novo)]);
}

case 'entrar': {
    $login = cp_login((string) ($e['usuario'] ?? $e['email'] ?? ''));
    $senha = (string) ($e['senha'] ?? '');
    $r = cp_alterar(cp_arq_usuarios(), function (array &$us) use ($login, $senha) {
        foreach ($us as $id => $u) {
            if ($u['email'] !== $login) continue;
            if (($u['esperaAte'] ?? 0) > time()) return ['erro' => 'Muitas tentativas erradas. Espere 10 minutos e tente de novo.'];
            if (!password_verify($senha, $u['hash'])) {
                $us[$id]['falhas'] = ($u['falhas'] ?? 0) + 1;
                if ($us[$id]['falhas'] >= 5) { $us[$id]['esperaAte'] = time() + 600; $us[$id]['falhas'] = 0; }
                return ['erro' => 'Usuário ou senha incorretos.'];
            }
            $us[$id]['falhas'] = 0; $us[$id]['esperaAte'] = 0;
            if (password_needs_rehash($u['hash'], PASSWORD_DEFAULT)) $us[$id]['hash'] = password_hash($senha, PASSWORD_DEFAULT);
            if ($u['status'] === 'ativo') $us[$id]['ultimo'] = time();
            return ['u' => $us[$id]];
        }
        return ['erro' => 'Usuário ou senha incorretos.'];
    });
    if (isset($r['erro'])) { usleep(400000); cp_erro(401, $r['erro']); }
    $u = $r['u'];
    if ($u['status'] !== 'ativo') cp_erro(403, 'Seu acesso está bloqueado. Fale com o administrador.', ['status' => $u['status']]);
    cp_json(200, ['ok' => true, 'token' => cp_criar_sessao($u['id']), 'usuario' => cp_publico($u)]);
}

case 'eu': {
    $u = cp_usuario();
    cp_alterar(cp_arq_usuarios(), function (array &$us) use ($u) { if (isset($us[$u['id']])) $us[$u['id']]['ultimo'] = time(); });
    cp_json(200, ['ok' => true, 'usuario' => cp_publico($u)]);
}

case 'sair': {
    $t = cp_token();
    if ($t !== '') cp_alterar(cp_arq_sessoes(), function (array &$s) use ($t) { unset($s[hash('sha256', $t)]); });
    cp_json(200, ['ok' => true]);
}

case 'senha': {
    $u = cp_usuario();
    $atual = (string) ($e['atual'] ?? ''); $nova = (string) ($e['nova'] ?? '');
    if (strlen($nova) < CP_SENHA_MIN) cp_erro(400, 'A nova senha precisa ter pelo menos ' . CP_SENHA_MIN . ' caracteres.');
    if (!password_verify($atual, $u['hash'])) cp_erro(400, 'A senha atual não confere.');
    cp_alterar(cp_arq_usuarios(), function (array &$us) use ($u, $nova) { $us[$u['id']]['hash'] = password_hash($nova, PASSWORD_DEFAULT); $us[$u['id']]['trocarSenha'] = false; });
    cp_apagar_sessoes($u['id'], hash('sha256', cp_token()));
    cp_json(200, ['ok' => true]);
}

// ------------------------------------------------------------------ dados do professor (avaliações, turmas, perfil)
case 'listar': {
    $u = cp_usuario(); $tipo = cp_tipo($e);
    $lista = [];
    foreach (glob(cp_pasta_tipo($tipo, $u['id']) . '/*.json') ?: [] as $arq) {
        $r = cp_ler($arq);
        if (!isset($r['id'])) continue;
        $lista[] = ['id' => $r['id'], 't' => (int) ($r['t'] ?? 0), 'excluida' => !empty($r['excluida'])];
    }
    cp_json(200, ['ok' => true, 'itens' => $lista, 'avaliacoes' => $lista, 'agora' => cp_agora_ms()]);
}

case 'baixar': {
    $u = cp_usuario(); $tipo = cp_tipo($e);
    $out = [];
    foreach (array_slice((array) ($e['ids'] ?? []), 0, 200) as $id) {
        $id = (string) $id; if (!cp_doc_id($id)) continue;
        $r = cp_ler(cp_pasta_tipo($tipo, $u['id']) . '/' . $id . '.json');
        if ($r && empty($r['excluida']) && isset($r['txt'])) $out[$id] = ['t' => (int) $r['t'], 'txt' => $r['txt']];
    }
    cp_json(200, ['ok' => true, 'itens' => $out, 'avaliacoes' => $out]);
}

case 'enviar': {
    $u = cp_usuario(); $tipo = cp_tipo($e);
    // Os dados vão e voltam como texto JSON, sem passar por arrays do PHP: assim um objeto vazio ({})
    // continua objeto (o PHP o transformaria em lista vazia [] e as correções seguintes se perderiam).
    $id = (string) ($e['id'] ?? ''); $txt = (string) ($e['dadosTxt'] ?? '');
    if (strlen($txt) > cp_config()['limite_avaliacao_mb'] * 1048576) cp_erro(413, 'Arquivo grande demais para salvar no servidor.');
    $dados = json_decode($txt, true);
    if (!cp_doc_id($id) || !is_array($dados) || ($dados['id'] ?? '') !== $id) cp_erro(400, 'Dados inválidos.');
    $t = cp_agora_ms();
    cp_alterar(cp_pasta_tipo($tipo, $u['id']) . '/' . $id . '.json', function (array &$r) use ($id, $txt, $t) {
        $r = ['id' => $id, 't' => $t, 'excluida' => false, 'txt' => $txt];
    });
    cp_json(200, ['ok' => true, 't' => $t]);
}

case 'excluir': {
    $u = cp_usuario(); $tipo = cp_tipo($e);
    $id = (string) ($e['id'] ?? '');
    if (!cp_doc_id($id)) cp_erro(400, 'Dados inválidos.');
    $t = cp_agora_ms();
    cp_alterar(cp_pasta_tipo($tipo, $u['id']) . '/' . $id . '.json', function (array &$r) use ($id, $t) {
        $r = ['id' => $id, 't' => $t, 'excluida' => true];
    });
    cp_json(200, ['ok' => true, 't' => $t]);
}

// ------------------------------------------------------------------ administrador
case 'admin_usuarios': {
    cp_usuario(true);
    $lista = [];
    foreach (cp_ler(cp_arq_usuarios()) as $u) {
        $lista[] = cp_publico($u) + ['criado' => $u['criado'] ?? 0, 'ultimo' => $u['ultimo'] ?? 0, 'uso' => cp_uso($u['id'])];
    }
    usort($lista, fn($a, $b) => [$a['papel'] !== 'admin', $a['nome']] <=> [$b['papel'] !== 'admin', $b['nome']]);
    cp_json(200, ['ok' => true, 'usuarios' => $lista]);
}

case 'admin_criar': {
    cp_usuario(true);
    $nome = cp_nome_valido((string) ($e['nome'] ?? ''));
    $login = cp_login((string) ($e['usuario'] ?? ''));
    if (!cp_login_valido($login)) cp_erro(400, 'Usuário inválido. Use letras minúsculas, números e ponto (ex.: daniel.manzano).');
    $senha = cp_senha_provisoria();
    $novo = cp_alterar(cp_arq_usuarios(), function (array &$us) use ($nome, $login, $senha) {
        foreach ($us as $u) if ($u['email'] === $login) return null;
        $id = cp_id(8);
        $us[$id] = ['id' => $id, 'nome' => $nome, 'email' => $login, 'hash' => password_hash($senha, PASSWORD_DEFAULT),
            'papel' => 'professor', 'status' => 'ativo', 'trocarSenha' => true, 'criado' => time(), 'ultimo' => 0, 'falhas' => 0, 'esperaAte' => 0];
        return $us[$id];
    });
    if (!$novo) cp_erro(409, 'Já existe um professor com esse usuário.');
    cp_json(200, ['ok' => true, 'usuario' => cp_publico($novo), 'senha' => $senha]);
}

case 'admin_mudar': {
    $eu = cp_usuario(true);
    $uid = (string) ($e['uid'] ?? '');
    $status = isset($e['status']) ? (string) $e['status'] : null;
    $papel = isset($e['papel']) ? (string) $e['papel'] : null;
    if ($status !== null && !in_array($status, ['ativo', 'bloqueado'], true)) cp_erro(400, 'Situação inválida.');
    if ($papel !== null && !in_array($papel, ['admin', 'professor'], true)) cp_erro(400, 'Papel inválido.');
    if ($uid === $eu['id'] && (($status !== null && $status !== 'ativo') || $papel === 'professor')) cp_erro(400, 'Você não pode bloquear nem tirar o administrador da sua própria conta.');
    $ok = cp_alterar(cp_arq_usuarios(), function (array &$us) use ($uid, $status, $papel) {
        if (!isset($us[$uid])) return false;
        if ($status !== null) $us[$uid]['status'] = $status;
        if ($papel !== null) $us[$uid]['papel'] = $papel;
        return true;
    });
    if (!$ok) cp_erro(404, 'Professor não encontrado.');
    if ($status !== null && $status !== 'ativo') cp_apagar_sessoes($uid);
    cp_json(200, ['ok' => true]);
}

case 'admin_senha': {
    cp_usuario(true);
    $uid = (string) ($e['uid'] ?? '');
    $nova = cp_senha_provisoria();
    $ok = cp_alterar(cp_arq_usuarios(), function (array &$us) use ($uid, $nova) {
        if (!isset($us[$uid])) return false;
        $us[$uid]['hash'] = password_hash($nova, PASSWORD_DEFAULT); $us[$uid]['falhas'] = 0; $us[$uid]['esperaAte'] = 0; $us[$uid]['trocarSenha'] = true;
        return true;
    });
    if (!$ok) cp_erro(404, 'Professor não encontrado.');
    cp_apagar_sessoes($uid);
    cp_json(200, ['ok' => true, 'senha' => $nova]);
}

case 'admin_excluir': { // remove o professor e todos os dados dele do servidor
    $eu = cp_usuario(true);
    $uid = (string) ($e['uid'] ?? '');
    if ($uid === $eu['id']) cp_erro(400, 'Você não pode excluir a sua própria conta.');
    if (!preg_match('/^[a-f0-9]{16}$/', $uid)) cp_erro(400, 'Professor inválido.');
    $ok = cp_alterar(cp_arq_usuarios(), function (array &$us) use ($uid) { if (!isset($us[$uid])) return false; unset($us[$uid]); return true; });
    if (!$ok) cp_erro(404, 'Professor não encontrado.');
    cp_apagar_sessoes($uid);
    foreach (CP_TIPOS as $t) cp_apagar_pasta(cp_pasta() . '/' . $t . '/' . $uid);
    // trilhas ENADE do professor (respostas dos alunos) e os códigos de acesso delas
    cp_apagar_pasta(cp_pasta() . '/trilhas/' . $uid);
    if (is_file(cp_pasta() . '/trilhas/_codigos.json')) cp_alterar(cp_pasta() . '/trilhas/_codigos.json', function (array &$c) use ($uid) { foreach ($c as $k => $r) if (($r['uid'] ?? '') === $uid) unset($c[$k]); });
    cp_json(200, ['ok' => true]);
}

default:
    cp_erro(400, 'Ação desconhecida.');
}
