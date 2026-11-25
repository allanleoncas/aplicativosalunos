<?php
// SimulaPro — funções do servidor (contas, sessões, avaliações e turmas).
// Os dados ficam em arquivos JSON numa pasta FORA do public_html (não abre pelo navegador).
// Este arquivo não abre direto pelo navegador.

declare(strict_types=1);

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(404); exit; }

const CP_VERSAO_API = '1';
const CP_SESSAO_DIAS = 90;

/** Configuração opcional: simulapro-config.php na pasta acima do public_html. */
function cp_config(): array {
    static $config = null;
    if ($config !== null) return $config;
    $acima = dirname(__DIR__, 3);
    $lido = [];
    foreach ([getenv('SIMULAPRO_CONFIG') ?: '', $acima . '/simulapro-config.php', __DIR__ . '/config.php'] as $arq) {
        if ($arq !== '' && is_file($arq)) { $x = require $arq; if (is_array($x)) { $lido = $x; break; } }
    }
    $config = $lido + [
        'dados_dir' => getenv('SIMULAPRO_DADOS') ?: $acima . '/simulapro-dados',
        'limite_avaliacao_mb' => 25,
    ];
    return $config;
}

/** Pasta dos dados (criada na primeira vez, protegida contra acesso pelo navegador). */
function cp_pasta(string $sub = ''): string {
    $dir = cp_config()['dados_dir'];
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        // sem permissão acima do public_html: usa uma pasta interna bloqueada
        $dir = dirname(__DIR__) . '/_dados';
        if (!is_dir($dir)) @mkdir($dir, 0750, true);
    }
    if (!is_file($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\n");
    if ($sub !== '') { $dir .= '/' . $sub; if (!is_dir($dir)) @mkdir($dir, 0750, true); }
    return $dir;
}

function cp_json(int $status, array $dados): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function cp_erro(int $status, string $msg, array $extra = []): void { cp_json($status, ['ok' => false, 'erro' => $msg] + $extra); }

/** Lê e altera um arquivo JSON com trava (evita perder dados com dois acessos ao mesmo tempo). */
function cp_alterar(string $arquivo, callable $mudar) {
    $f = fopen($arquivo, 'c+');
    if (!$f) cp_erro(500, 'Não foi possível gravar os dados no servidor.');
    flock($f, LOCK_EX);
    $txt = stream_get_contents($f);
    $dados = $txt ? (json_decode($txt, true) ?: []) : [];
    $ret = $mudar($dados);
    ftruncate($f, 0); rewind($f);
    fwrite($f, json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    fflush($f); flock($f, LOCK_UN); fclose($f);
    return $ret;
}
function cp_ler(string $arquivo): array {
    if (!is_file($arquivo)) return [];
    $f = fopen($arquivo, 'r'); if (!$f) return [];
    flock($f, LOCK_SH); $txt = stream_get_contents($f); flock($f, LOCK_UN); fclose($f);
    return $txt ? (json_decode($txt, true) ?: []) : [];
}

function cp_arq_usuarios(): string { return cp_pasta() . '/usuarios.json'; }
function cp_arq_sessoes(): string { return cp_pasta() . '/sessoes.json'; }
function cp_pasta_av(string $uid): string { return cp_pasta('avaliacoes/' . $uid); }
/** Pasta de um tipo de dado do professor: avaliacoes, turmas ou perfil. */
function cp_pasta_tipo(string $tipo, string $uid): string { return cp_pasta($tipo . '/' . $uid); }
const CP_TIPOS = ['avaliacoes', 'turmas', 'perfil'];

function cp_agora_ms(): int { return (int) round(microtime(true) * 1000); }
function cp_id(int $n = 12): string { return bin2hex(random_bytes($n)); }

/** Dados do usuário que podem ir para o navegador. */
function cp_publico(array $u): array {
    return ['id' => $u['id'], 'nome' => $u['nome'], 'usuario' => $u['email'], 'email' => $u['email'], 'papel' => $u['papel'], 'status' => $u['status'], 'trocarSenha' => !empty($u['trocarSenha'])];
}

function cp_entrada(): array {
    $txt = file_get_contents('php://input') ?: '';
    $d = $txt !== '' ? json_decode($txt, true) : [];
    return is_array($d) ? $d : [];
}

function cp_token(): string {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($h === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $h = $v;
    }
    if ($h === '' && !empty($_SERVER['HTTP_X_CORRETOR_TOKEN'])) $h = 'Bearer ' . $_SERVER['HTTP_X_CORRETOR_TOKEN'];
    return preg_match('/^Bearer\s+([a-f0-9]{48})$/i', trim($h), $m) ? strtolower($m[1]) : '';
}

/** Cria a sessão e devolve o token (só o resumo do token fica gravado). */
function cp_criar_sessao(string $uid): string {
    $token = cp_id(24);
    cp_alterar(cp_arq_sessoes(), function (array &$s) use ($token, $uid) {
        $agora = time();
        foreach ($s as $k => $v) if (($v['expira'] ?? 0) < $agora) unset($s[$k]);
        $s[hash('sha256', $token)] = ['uid' => $uid, 'criada' => $agora, 'expira' => $agora + CP_SESSAO_DIAS * 86400];
    });
    return $token;
}
function cp_apagar_sessoes(string $uid, ?string $exceto = null): void {
    cp_alterar(cp_arq_sessoes(), function (array &$s) use ($uid, $exceto) {
        foreach ($s as $k => $v) if (($v['uid'] ?? '') === $uid && $k !== $exceto) unset($s[$k]);
    });
}

/** Usuário da sessão atual (ativo), ou erro 401/403. */
function cp_usuario(bool $exigirAdmin = false): array {
    $token = cp_token();
    if ($token === '') cp_erro(401, 'Entre com seu usuário e senha.');
    $sess = cp_ler(cp_arq_sessoes())[hash('sha256', $token)] ?? null;
    if (!$sess || ($sess['expira'] ?? 0) < time()) cp_erro(401, 'Sua sessão terminou. Entre de novo.');
    $u = cp_ler(cp_arq_usuarios())[$sess['uid']] ?? null;
    if (!$u) cp_erro(401, 'Conta não encontrada.');
    if ($u['status'] !== 'ativo') cp_erro(403, $u['status'] === 'bloqueado' ? 'Seu acesso foi bloqueado pelo administrador.' : 'Seu acesso ainda não foi liberado pelo administrador.', ['status' => $u['status']]);
    if ($exigirAdmin && $u['papel'] !== 'admin') cp_erro(403, 'Só o administrador pode fazer isso.');
    return $u;
}

/** Resumo de uso de um professor (para o administrador): sem nomes de alunos nem notas. */
function cp_uso(string $uid): array {
    $uso = ['avaliacoes' => 0, 'provas' => 0, 'corrigidas' => 0, 'alunos' => 0, 'ultima' => 0];
    $dir = cp_pasta('avaliacoes/' . $uid);
    foreach (glob($dir . '/*.json') ?: [] as $arq) {
        $r = cp_ler($arq);
        if (!empty($r['excluida'])) continue;
        $a = isset($r['txt']) ? (json_decode($r['txt'], true) ?: []) : ($r['dados'] ?? []);
        $uso['avaliacoes']++;
        $uso['ultima'] = max($uso['ultima'], (int) ($r['t'] ?? 0));
        $res = $a['resultados'] ?? [];
        foreach (($a['gerado']['alunos'] ?? []) as $al) {
            if (!empty($al['extra']) && empty($res[$al['codigo'] ?? ''])) continue;
            $uso['provas']++;
        }
        $uso['corrigidas'] += is_array($res) ? count($res) : 0;
        $uso['alunos'] += count($a['alunos'] ?? []);
    }
    return $uso;
}
