# SimulaPro

Versão do app com **login de professores** e **dados no servidor**, publicada em
**https://allanleon.com.br/SimulaPro/** (Hostinger). Serve para provas bimestrais, exames e simulados:
monta a prova no computador e corrige pela câmera do celular.

- Só entram professores cadastrados pelo administrador.
- Os dados (usuários com senha embaralhada, avaliações, turmas e notas) ficam no servidor, em arquivos
  na pasta `simulapro-dados`, **fora** do `public_html`. Nada disso vem para este repositório.
- A versão antiga, só no navegador, continua em `../corretor-provas/` (GitHub Pages). As folhas já
  impressas continuam valendo nas duas, porque a leitura óptica é a mesma.

## O que tem aqui

| Pasta/arquivo | Para que serve |
|---|---|
| `index.html`, `*.js`, `lib/`, `img/` | O app (o mesmo que roda no celular e no computador) |
| `api/` | O servidor em PHP: login, cadastro de professores e gravação dos dados |
| `.htaccess` | Regras da Hostinger (HTTPS, câmera, bloqueio de pastas internas) |
| `redirecionar-minusculas/` | Vira a pasta `simulapro/` no servidor e leva quem digita em minúsculas para `/SimulaPro/` |
| `config.exemplo.php` | Exemplo de configuração opcional do servidor (o de verdade nunca vem para o GitHub) |
| `gerar-zip.sh` | Gera o `SimulaPro-hostinger.zip` para enviar à Hostinger |

## Como publicar uma versão nova

1. Faça a mudança nesta pasta e aumente `VERSAO` no `sw.js`.
2. Gere o pacote: `sh simulapro/gerar-zip.sh SimulaPro-hostinger.zip`
3. Na Hostinger, envie o zip para `public_html` e extraia, aceitando substituir os arquivos.

## Segurança

Este repositório é público. **Nunca** coloque aqui senhas, a pasta de dados (`_dados`, `simulapro-dados`),
o `simulapro-config.php` ou listas de alunos. O `.gitignore` desta pasta já bloqueia esses arquivos.
