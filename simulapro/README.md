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
| `apresentacao.html` | Página pública de apresentação, que abre em allanleon.com.br/SimulaPro/ (botão *Entrar* leva ao app; quem já entrou no aparelho vai direto ao app; o botão *Sou aluno* aparece sozinho quando existir `aluno.html`) |
| `index.html`, `*.js`, `lib/`, `img/` | O app (o mesmo que roda no celular e no computador) |
| `analises.js`, `pdfanalise.js` | Análises de desempenho: acerto por questão, tema e competência, boletim do aluno, evolução entre provas e painel do curso (calculadas no aparelho a partir das correções) |
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

## Trilha ENADE (treino quinzenal online)

- **Professor** (Início › Trilhas ENADE, `trilhas.js`): escolhe uma turma salva, o banco (de uma avaliação ou planilha;
  só objetivas), a data da 1ª rodada, o nº de rodadas e de questões por rodada. O app gera um código individual por
  aluno (PDF com recortes e QR), mostra o calendário, quem respondeu, notas por rodada e acerto da turma por tema,
  e exporta relatório (PDF) e planilha (CSV).
- **Aluno** (`aluno/`, ou seja, `allanleon.com.br/SimulaPro/aluno`): entra com o código (ou pelo QR), aceita o aviso de
  privacidade (LGPD) no 1º acesso e responde a rodada aberta. Vê a nota na hora; o gabarito comentado aparece quando a
  rodada fecha.
- **Servidor** (`api/trilha.php`): rodada k abre em início + 15·k dias e fica aberta 15 dias (fuso de São Paulo).
  O sorteio é por aluno, sem repetir questões já vistas; a partir da 3ª rodada os temas em que ele mais errou têm mais
  peso. A correção é feita no servidor: o celular nunca recebe o gabarito de rodada aberta. Dados em
  `simulapro-dados/trilhas/<professor>/<trilha>.json` e `trilhas/_codigos.json`; 10 códigos errados por IP = 10 min de espera.
