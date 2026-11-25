<?php
// SimulaPro — Trilha ENADE (treino quinzenal online).
// O professor cria a trilha (turma + banco de questões + calendário); cada aluno recebe um código
// individual e responde as rodadas no celular em allanleon.com.br/SimulaPro/aluno.
//
// Recebe POST com JSON {"acao": "...", ...}.
//  - Ações do professor (trilha_*): sessão do login no cabeçalho "Authorization: Bearer <token>".
//  - Ações do aluno (aluno_*): o código individual vai no corpo ({"codigo": "K7F2-9QXM"}).
//
// Dados (fora do public_html, na mesma pasta do login):
//  - trilhas/<id do professor>/<id da trilha>.json  (trilha completa: banco, alunos, sorteios e respostas)
//  - trilhas/_codigos.json  {CODIGO: {uid, tid, aid}}
//  - trilhas/_tentativas.json  (códigos errados por IP, para impedir chutes)
// O aluno nunca recebe a resposta certa de uma rodada aberta: a correção é feita aqui no servidor.

declare(strict_types=1);
require __DIR__ . '/_base.php';

header('X-Content-Type-Options: nosniff');
date_default_timezone_set('America/Sao_Paulo');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') cp_erro(405, 'Método não aceito.');

const TR_INTERVALO = 15;          // dias entre rodadas
const TR_MAX_RODADAS = 26;
const TR_MAX_POR_RODADA = 20;
const TR_ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

$e = cp_entrada();
$acao = (string) ($e['acao'] ?? '');

// ------------------------------------------------------------------ utilitários
function tr_hoje(): string {
    $t = getenv('SIMULAPRO_HOJE'); // só para testes automáticos
    return ($t && preg_match('/^\d{4}-\d{2}-\d{2}$/', $t)) ? $t : date('Y-m-d');
}
function tr_mais_dias(string $iso, int $d): string { return date('Y-m-d', strtotime($iso . ' 12:00:00 ' . ($d >= 0 ? '+' : '') . $d . ' days')); }
function tr_pasta(string $uid): string { return cp_pasta('trilhas/' . $uid); }
function tr_arq(string $uid, string $tid): string { return tr_pasta($uid) . '/' . $tid . '.json'; }
function tr_arq_codigos(): string { return cp_pasta('trilhas') . '/_codigos.json'; }
function tr_id_ok(string $id): bool { return (bool) preg_match('/^[a-f0-9]{16}$/', $id); }
function tr_texto($x, int $max): string { return mb_substr(trim((string) $x), 0, $max); }

/** Calendário da rodada k (0, 1, 2...): abre no dia "abre" e aceita respostas até o fim do dia "ate". */
function tr_cal(array $t, int $k): array {
    $abre = tr_mais_dias($t['inicio'], $k * TR_INTERVALO);
    $ate = tr_mais_dias($t['inicio'], ($k + 1) * TR_INTERVALO - 1);
    $hoje = tr_hoje();
    $estado = $hoje < $abre ? 'futura' : ($hoje > $ate ? 'fechada' : 'aberta');
    return ['k' => $k, 'abre' => $abre, 'ate' => $ate, 'estado' => $estado];
}

/** Banco aceito pelo servidor: só questões objetivas (2 a 5 alternativas e uma correta). */
function tr_limpar_banco($banco): array {
    $out = [];
    foreach (array_slice(is_array($banco) ? $banco : [], 0, 1000) as $q) {
        if (!is_array($q) || (($q['tipo'] ?? '') === 'D')) continue;
        $alts = array_values(array_map(fn($a) => tr_texto($a, 2000), array_slice((array) ($q['alts'] ?? []), 0, 5)));
        $cor = (int) ($q['correta'] ?? -1);
        $enun = tr_texto($q['enunciado'] ?? '', 8000);
        if ($enun === '' || count($alts) < 2 || $cor < 0 || $cor >= count($alts) || in_array('', $alts, true)) continue;
        $item = ['tema' => tr_texto($q['tema'] ?? '', 120) ?: 'Geral', 'enunciado' => $enun, 'alts' => $alts, 'correta' => $cor,
                 'comentario' => tr_texto($q['comentario'] ?? '', 4000)];
        $img = $q['img']['dataUrl'] ?? '';
        if (is_string($img) && strlen($img) < 1500000 && preg_match('#^data:image/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$#', $img)) $item['img'] = $img;
        // id estável: o mesmo enunciado mantém o id quando o banco é trocado (as respostas antigas continuam válidas)
        $qid = 'q' . substr(sha1(mb_strtolower(preg_replace('/\s+/', ' ', $enun))), 0, 12);
        if (isset($out[$qid])) continue;
        $out[$qid] = $item + ['id' => $qid, 'ativa' => true];
    }
    return $out;
}

function tr_novo_codigo(array $usados): string {
    do {
        $c = '';
        for ($i = 0; $i < 8; $i++) $c .= TR_ALFABETO[random_int(0, strlen(TR_ALFABETO) - 1)];
        $c = substr($c, 0, 4) . '-' . substr($c, 4);
    } while (isset($usados[$c]));
    return $c;
}
function tr_norm_codigo(string $c): string {
    $c = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $c));
    return strlen($c) === 8 ? substr($c, 0, 4) . '-' . substr($c, 4) : '';
}

/** Acrescenta alunos à trilha e cria os códigos deles. */
function tr_incluir_alunos(array &$t, array $lista): int {
    $ja = [];
    foreach ($t['alunos'] as $al) $ja[mb_strtolower($al['nome'])] = true;
    $novos = 0;
    cp_alterar(tr_arq_codigos(), function (array &$cods) use (&$t, $lista, &$ja, &$novos) {
        foreach (array_slice($lista, 0, 400) as $x) {
            $nome = tr_texto(preg_replace('/\s+/', ' ', (string) ($x['nome'] ?? '')), 120);
            if (mb_strlen($nome) < 2 || isset($ja[mb_strtolower($nome)])) continue;
            $aid = cp_id(6);
            $cod = tr_novo_codigo($cods);
            $cods[$cod] = ['uid' => $t['uid'], 'tid' => $t['id'], 'aid' => $aid];
            $t['alunos'][$aid] = ['id' => $aid, 'nome' => $nome, 'ra' => tr_texto($x['ra'] ?? '', 40), 'codigo' => $cod, 'ativo' => true, 'aceite' => 0];
            $ja[mb_strtolower($nome)] = true; $novos++;
        }
    });
    return $novos;
}

function tr_resumo(array $t): array {
    $cal = []; $nAl = 0;
    foreach ($t['alunos'] as $al) if (!empty($al['ativo'])) $nAl++;
    for ($k = 0; $k < $t['rodadas']; $k++) {
        $c = tr_cal($t, $k); $resp = 0;
        foreach (($t['resp'][$k] ?? []) as $r) if (!empty($r['enviado'])) $resp++;
        $cal[] = $c + ['responderam' => $resp];
    }
    $ativas = 0; foreach ($t['banco'] as $q) if (!empty($q['ativa'])) $ativas++;
    return ['id' => $t['id'], 'nome' => $t['nome'], 'curso' => $t['curso'], 'disciplina' => $t['disciplina'], 'inicio' => $t['inicio'],
            'rodadas' => $t['rodadas'], 'porRodada' => $t['porRodada'], 'alunos' => $nAl, 'questoes' => $ativas, 'calendario' => $cal,
            'turmaId' => $t['turmaId'] ?? '', 'criada' => $t['criada']];
}

/** Sorteia as questões da rodada k para o aluno: sem repetir as que ele já fez; a partir da 3ª rodada
 *  os temas em que ele mais errou têm mais chance. Também espalha os temas dentro da rodada. */
function tr_sortear(array $t, string $aid, int $k): array {
    $vistas = []; $temaCerto = []; $temaTotal = [];
    foreach ($t['resp'] as $kk => $porAluno) {
        $r = $porAluno[$aid] ?? null; if (!$r) continue;
        foreach ($r['qs'] as $i => $q) {
            $vistas[$q['qid']] = ($vistas[$q['qid']] ?? 0) + 1;
            if (!empty($r['enviado']) && isset($t['banco'][$q['qid']])) {
                $tema = $t['banco'][$q['qid']]['tema'];
                $temaTotal[$tema] = ($temaTotal[$tema] ?? 0) + 1;
                $temaCerto[$tema] = ($temaCerto[$tema] ?? 0) + (!empty($r['certas'][$i]) ? 1 : 0);
            }
        }
    }
    $ativas = array_filter($t['banco'], fn($q) => !empty($q['ativa']));
    $n = min($t['porRodada'], count($ativas));
    $novas = array_filter($ativas, fn($q) => !isset($vistas[$q['id']]));
    $pool = count($novas) >= $n ? $novas : $ativas; // banco esgotado: volta a usar, priorizando as menos vistas
    $porTema = [];
    foreach ($pool as $q) $porTema[$q['tema']][] = $q;
    foreach ($porTema as &$lista) {
        shuffle($lista);
        usort($lista, fn($a, $b) => ($vistas[$a['id']] ?? 0) <=> ($vistas[$b['id']] ?? 0));
    }
    unset($lista);
    $peso = [];
    foreach ($porTema as $tema => $_) {
        $p = 1.0;
        if ($k >= 2 && !empty($temaTotal[$tema])) $p += 4.0 * (1 - $temaCerto[$tema] / $temaTotal[$tema]); // erra mais = aparece mais
        elseif ($k >= 2) $p += 1.5; // tema que ainda não caiu para ele
        $peso[$tema] = $p;
    }
    $escolhidas = [];
    while (count($escolhidas) < $n && $peso) {
        $soma = array_sum($peso); $x = random_int(0, 1000000) / 1000000 * $soma; $tema = array_key_first($peso);
        foreach ($peso as $tm => $p) { $x -= $p; if ($x <= 0) { $tema = $tm; break; } }
        $escolhidas[] = array_shift($porTema[$tema]);
        if (!$porTema[$tema]) unset($peso[$tema], $porTema[$tema]); else $peso[$tema] *= 0.75; // espalha os temas
    }
    shuffle($escolhidas);
    $qs = [];
    foreach ($escolhidas as $q) { $perm = range(0, count($q['alts']) - 1); shuffle($perm); $qs[] = ['qid' => $q['id'], 'perm' => $perm]; }
    return $qs;
}

// ------------------------------------------------------------------ aluno: código e limite de tentativas
function tr_ip(): string { return hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|simulapro'); }
function tr_checar_tentativas(): void {
    $t = cp_ler(cp_pasta('trilhas') . '/_tentativas.json')[tr_ip()] ?? null;
    if ($t && ($t['ate'] ?? 0) > time()) cp_erro(429, 'Muitos códigos errados. Espere 10 minutos e tente de novo.');
}
function tr_errou_codigo(): void {
    cp_alterar(cp_pasta('trilhas') . '/_tentativas.json', function (array &$x) {
        $agora = time();
        foreach ($x as $k => $v) if (($v['ate'] ?? 0) < $agora && ($v['desde'] ?? 0) < $agora - 600) unset($x[$k]);
        $ip = tr_ip();
        $v = $x[$ip] ?? ['n' => 0, 'desde' => $agora, 'ate' => 0];
        if ($v['desde'] < $agora - 600) $v = ['n' => 0, 'desde' => $agora, 'ate' => 0];
        $v['n']++;
        if ($v['n'] >= 10) { $v['ate'] = $agora + 600; $v['n'] = 0; $v['desde'] = $agora; }
        $x[$ip] = $v;
    });
    usleep(300000);
}
/** Localiza o aluno pelo código: devolve [uid, tid, aid]. */
function tr_aluno_do_codigo(array $e): array {
    tr_checar_tentativas();
    $cod = tr_norm_codigo((string) ($e['codigo'] ?? ''));
    $ref = $cod !== '' ? (cp_ler(tr_arq_codigos())[$cod] ?? null) : null;
    if (!$ref) { tr_errou_codigo(); cp_erro(404, 'Código não encontrado. Confira as letras e os números com o seu professor.'); }
    $t = cp_ler(tr_arq($ref['uid'], $ref['tid']));
    $al = $t['alunos'][$ref['aid']] ?? null;
    if (!$t || !empty($t['excluida']) || !$al || empty($al['ativo']) || ($al['codigo'] ?? '') !== $cod) cp_erro(404, 'Este código não está mais ativo. Fale com o seu professor.');
    $u = cp_ler(cp_arq_usuarios())[$ref['uid']] ?? null;
    if (!$u || $u['status'] !== 'ativo') cp_erro(403, 'A trilha deste professor não está disponível no momento.');
    return [$ref['uid'], $ref['tid'], $ref['aid'], $t];
}
function tr_nota(int $acertos, int $n): float { return $n ? round(10 * $acertos / $n, 1) : 0.0; }

// ------------------------------------------------------------------ ações
switch ($acao) {

// ============ professor
case 'trilha_listar': {
    $u = cp_usuario();
    $lista = [];
    foreach (glob(tr_pasta($u['id']) . '/*.json') ?: [] as $arq) {
        $t = cp_ler($arq);
        if (!isset($t['id']) || !empty($t['excluida'])) continue;
        $lista[] = tr_resumo($t);
    }
    usort($lista, fn($a, $b) => $b['criada'] <=> $a['criada']);
    cp_json(200, ['ok' => true, 'trilhas' => $lista, 'hoje' => tr_hoje()]);
}

case 'trilha_criar': {
    $u = cp_usuario();
    $nome = tr_texto($e['nome'] ?? '', 120);
    $inicio = (string) ($e['inicio'] ?? '');
    $rod = (int) ($e['rodadas'] ?? 0); $por = (int) ($e['porRodada'] ?? 0);
    if (mb_strlen($nome) < 3) cp_erro(400, 'Dê um nome para a trilha.');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $inicio) || !strtotime($inicio)) cp_erro(400, 'Informe a data da primeira rodada.');
    if ($rod < 1 || $rod > TR_MAX_RODADAS) cp_erro(400, 'O número de rodadas deve ficar entre 1 e ' . TR_MAX_RODADAS . '.');
    if ($por < 1 || $por > TR_MAX_POR_RODADA) cp_erro(400, 'As questões por rodada devem ficar entre 1 e ' . TR_MAX_POR_RODADA . '.');
    $banco = tr_limpar_banco($e['banco'] ?? []);
    if (count($banco) < $por) cp_erro(400, 'O banco tem ' . count($banco) . ' questão(ões) objetiva(s) válida(s); são necessárias pelo menos ' . $por . '.');
    $t = ['id' => cp_id(8), 'uid' => $u['id'], 'nome' => $nome, 'curso' => tr_texto($e['curso'] ?? '', 120), 'disciplina' => tr_texto($e['disciplina'] ?? '', 120),
          'turmaId' => tr_texto($e['turmaId'] ?? '', 40), 'inicio' => $inicio, 'rodadas' => $rod, 'porRodada' => $por, 'criada' => time(),
          'banco' => $banco, 'alunos' => [], 'resp' => []];
    tr_incluir_alunos($t, (array) ($e['alunos'] ?? []));
    if (!$t['alunos']) cp_erro(400, 'A turma não tem alunos.');
    cp_alterar(tr_arq($u['id'], $t['id']), function (array &$x) use ($t) { $x = $t; });
    cp_json(200, ['ok' => true, 'trilha' => tr_resumo($t)]);
}

case 'trilha_ver': {
    $u = cp_usuario();
    $tid = (string) ($e['id'] ?? '');
    if (!tr_id_ok($tid)) cp_erro(400, 'Trilha inválida.');
    $t = cp_ler(tr_arq($u['id'], $tid));
    if (!$t || !empty($t['excluida'])) cp_erro(404, 'Trilha não encontrada.');
    $banco = [];
    foreach ($t['banco'] as $q) $banco[$q['id']] = ['tema' => $q['tema'], 'ativa' => !empty($q['ativa']), 'enunciado' => mb_substr($q['enunciado'], 0, 200)];
    $resp = [];
    foreach ($t['resp'] as $k => $porAluno) foreach ($porAluno as $aid => $r) {
        $resp[$k][$aid] = ['enviado' => $r['enviado'] ?? 0, 'acertos' => $r['acertos'] ?? 0, 'n' => count($r['qs']),
                           'qs' => array_column($r['qs'], 'qid'), 'certas' => $r['certas'] ?? []];
    }
    $alunos = array_values(array_map(fn($a) => ['id' => $a['id'], 'nome' => $a['nome'], 'ra' => $a['ra'], 'codigo' => $a['codigo'], 'ativo' => !empty($a['ativo']), 'aceite' => $a['aceite'] ?? 0], $t['alunos']));
    usort($alunos, fn($a, $b) => strcoll($a['nome'], $b['nome']));
    cp_json(200, ['ok' => true, 'trilha' => tr_resumo($t), 'alunos' => $alunos, 'banco' => $banco, 'resp' => (object) $resp, 'hoje' => tr_hoje()]);
}

case 'trilha_mudar': {
    $u = cp_usuario();
    $tid = (string) ($e['id'] ?? '');
    if (!tr_id_ok($tid)) cp_erro(400, 'Trilha inválida.');
    $ret = cp_alterar(tr_arq($u['id'], $tid), function (array &$t) use ($e) {
        if (!$t || !empty($t['excluida'])) return ['erro' => 'Trilha não encontrada.'];
        $msg = [];
        if (isset($e['nome']) && mb_strlen(trim((string) $e['nome'])) >= 3) $t['nome'] = tr_texto($e['nome'], 120);
        if (isset($e['rodadas'])) {
            $r = (int) $e['rodadas'];
            $usadas = 0; foreach ($t['resp'] as $k => $x) if ($x) $usadas = max($usadas, (int) $k + 1);
            if ($r < max(1, $usadas) || $r > TR_MAX_RODADAS) return ['erro' => 'O número de rodadas deve ficar entre ' . max(1, $usadas) . ' e ' . TR_MAX_RODADAS . '.'];
            $t['rodadas'] = $r;
        }
        if (isset($e['porRodada'])) {
            $p = (int) $e['porRodada'];
            if ($p < 1 || $p > TR_MAX_POR_RODADA) return ['erro' => 'As questões por rodada devem ficar entre 1 e ' . TR_MAX_POR_RODADA . '.'];
            $t['porRodada'] = $p; // vale para os próximos sorteios
        }
        if (isset($e['banco'])) {
            $novo = tr_limpar_banco($e['banco']);
            if (count($novo) < $t['porRodada']) return ['erro' => 'O banco novo tem só ' . count($novo) . ' questão(ões) objetiva(s) válida(s).'];
            // questões que saíram do banco ficam guardadas (inativas) para as respostas antigas continuarem corretas
            foreach ($t['banco'] as $qid => $q) if (!isset($novo[$qid])) { $q['ativa'] = false; $novo[$qid] = $q; }
            $t['banco'] = $novo; $msg[] = 'banco';
        }
        if (isset($e['incluir'])) $msg[] = tr_incluir_alunos($t, (array) $e['incluir']) . ' aluno(s) incluído(s)';
        if (isset($e['aluno'], $e['ativo'])) {
            $aid = (string) $e['aluno'];
            if (isset($t['alunos'][$aid])) $t['alunos'][$aid]['ativo'] = (bool) $e['ativo'];
        }
        if (!empty($e['novoCodigo'])) {
            $aid = (string) $e['novoCodigo'];
            if (isset($t['alunos'][$aid])) cp_alterar(tr_arq_codigos(), function (array &$cods) use (&$t, $aid) {
                unset($cods[$t['alunos'][$aid]['codigo']]);
                $c = tr_novo_codigo($cods); $cods[$c] = ['uid' => $t['uid'], 'tid' => $t['id'], 'aid' => $aid];
                $t['alunos'][$aid]['codigo'] = $c;
            });
        }
        return ['ok' => true, 'resumo' => tr_resumo($t), 'msg' => implode(', ', $msg)];
    });
    if (isset($ret['erro'])) cp_erro(400, $ret['erro']);
    cp_json(200, ['ok' => true, 'trilha' => $ret['resumo'], 'msg' => $ret['msg']]);
}

case 'trilha_excluir': {
    $u = cp_usuario();
    $tid = (string) ($e['id'] ?? '');
    if (!tr_id_ok($tid)) cp_erro(400, 'Trilha inválida.');
    $arq = tr_arq($u['id'], $tid);
    $t = cp_ler($arq);
    if (!$t) cp_erro(404, 'Trilha não encontrada.');
    cp_alterar(tr_arq_codigos(), function (array &$cods) use ($u, $tid) { foreach ($cods as $c => $r) if ($r['uid'] === $u['id'] && $r['tid'] === $tid) unset($cods[$c]); });
    @unlink($arq);
    cp_json(200, ['ok' => true]);
}

// ============ aluno
case 'aluno_entrar': {
    [$uid, $tid, $aid, $t] = tr_aluno_do_codigo($e);
    if (!empty($e['aceitar'])) {
        cp_alterar(tr_arq($uid, $tid), function (array &$x) use ($aid) { if (isset($x['alunos'][$aid]) && empty($x['alunos'][$aid]['aceite'])) $x['alunos'][$aid]['aceite'] = time(); });
        $t['alunos'][$aid]['aceite'] = time();
    }
    $prof = cp_ler(cp_arq_usuarios())[$uid]['nome'] ?? '';
    $rods = [];
    for ($k = 0; $k < $t['rodadas']; $k++) {
        $c = tr_cal($t, $k); $r = $t['resp'][$k][$aid] ?? null;
        $rods[] = $c + ['enviada' => !empty($r['enviado']), 'acertos' => !empty($r['enviado']) ? $r['acertos'] : null,
                        'n' => $r ? count($r['qs']) : $t['porRodada'], 'nota' => !empty($r['enviado']) ? tr_nota($r['acertos'], count($r['qs'])) : null];
    }
    cp_json(200, ['ok' => true, 'aluno' => $t['alunos'][$aid]['nome'], 'aceite' => (bool) $t['alunos'][$aid]['aceite'],
        'trilha' => ['nome' => $t['nome'], 'curso' => $t['curso'], 'disciplina' => $t['disciplina'], 'professor' => $prof], 'rodadas' => $rods, 'hoje' => tr_hoje()]);
}

case 'aluno_rodada': {
    [$uid, $tid, $aid, $t] = tr_aluno_do_codigo($e);
    if (empty($t['alunos'][$aid]['aceite'])) cp_erro(403, 'Leia e aceite o aviso de privacidade antes de começar.');
    $k = (int) ($e['k'] ?? -1);
    if ($k < 0 || $k >= $t['rodadas']) cp_erro(400, 'Rodada inválida.');
    $cal = tr_cal($t, $k);
    if ($cal['estado'] === 'futura') cp_erro(400, 'Esta rodada abre em ' . date('d/m/Y', strtotime($cal['abre'])) . '.');
    $r = $t['resp'][$k][$aid] ?? null;
    if (!$r && $cal['estado'] === 'aberta') {
        $r = cp_alterar(tr_arq($uid, $tid), function (array &$x) use ($aid, $k) {
            if (!isset($x['resp'][$k][$aid])) $x['resp'][$k][$aid] = ['qs' => tr_sortear($x, $aid, $k), 'inicio' => time(), 'enviado' => 0];
            return $x['resp'][$k][$aid];
        });
        $t = cp_ler(tr_arq($uid, $tid));
    }
    if (!$r) cp_json(200, ['ok' => true, 'rodada' => $cal, 'perdida' => true, 'questoes' => []]);
    $mostrarGabarito = $cal['estado'] === 'fechada';
    $qs = [];
    foreach ($r['qs'] as $i => $item) {
        $q = $t['banco'][$item['qid']] ?? null; if (!$q) continue;
        $saida = ['tema' => $q['tema'], 'enunciado' => $q['enunciado'], 'alts' => array_map(fn($p) => $q['alts'][$p], $item['perm'])];
        if (!empty($q['img'])) $saida['img'] = $q['img'];
        if (!empty($r['enviado'])) { $saida['marcada'] = $r['marcadas'][$i] ?? -1; $saida['certa'] = !empty($r['certas'][$i]); }
        if ($mostrarGabarito) { $saida['correta'] = array_search($q['correta'], $item['perm'], true); $saida['comentario'] = $q['comentario']; }
        $qs[] = $saida;
    }
    cp_json(200, ['ok' => true, 'rodada' => $cal, 'enviada' => !empty($r['enviado']), 'questoes' => $qs,
        'acertos' => !empty($r['enviado']) ? $r['acertos'] : null, 'nota' => !empty($r['enviado']) ? tr_nota($r['acertos'], count($r['qs'])) : null]);
}

case 'aluno_enviar': {
    [$uid, $tid, $aid, $t] = tr_aluno_do_codigo($e);
    $k = (int) ($e['k'] ?? -1);
    if ($k < 0 || $k >= $t['rodadas']) cp_erro(400, 'Rodada inválida.');
    if (tr_cal($t, $k)['estado'] !== 'aberta') cp_erro(400, 'Esta rodada não está aberta.');
    $marc = array_map('intval', (array) ($e['respostas'] ?? []));
    $ret = cp_alterar(tr_arq($uid, $tid), function (array &$x) use ($aid, $k, $marc) {
        $r = $x['resp'][$k][$aid] ?? null;
        if (!$r) return ['erro' => 'Abra a rodada antes de enviar.'];
        if (!empty($r['enviado'])) return ['erro' => 'Você já enviou esta rodada.'];
        $certas = []; $ac = 0; $m = [];
        foreach ($r['qs'] as $i => $item) {
            $q = $x['banco'][$item['qid']];
            $mi = $marc[$i] ?? -1; if ($mi < 0 || $mi >= count($item['perm'])) $mi = -1;
            $ok = $mi >= 0 && $item['perm'][$mi] === $q['correta'];
            $certas[] = $ok; $m[] = $mi; if ($ok) $ac++;
        }
        $x['resp'][$k][$aid] = $r + ['marcadas' => $m, 'certas' => $certas, 'acertos' => $ac];
        $x['resp'][$k][$aid]['enviado'] = time();
        return ['acertos' => $ac, 'n' => count($r['qs']), 'certas' => $certas];
    });
    if (isset($ret['erro'])) cp_erro(400, $ret['erro']);
    cp_json(200, ['ok' => true, 'acertos' => $ret['acertos'], 'n' => $ret['n'], 'nota' => tr_nota($ret['acertos'], $ret['n']), 'certas' => $ret['certas']]);
}

default:
    cp_erro(400, 'Ação desconhecida.');
}
