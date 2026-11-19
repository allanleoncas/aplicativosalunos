# Contexto – Corretor de Provas

Estado em 19/11/2026 (modelo de prova aprovado pelo professor às 10h). Documento de passagem: o que o app faz, como está organizado, decisões tomadas e próximos passos.

## 1. O que é

Webapp para professores, criado pelo Prof. Dr. Allan Leon Casemiro da Silva (UNIFADAP, Tupã/SP), com três funções:

1. **Gerar provas individuais em PDF**: com o cabeçalho padrão da UNIFADAP (ou outro, opcional), um banco de questões (planilha) e a lista de alunos, sorteia uma prova diferente para cada aluno, para evitar cola.
2. **Corrigir pela câmera do celular**: lê a folha de respostas (QR code + 4 marcadores + bolhas A–E) e calcula a nota.
3. **Emitir o relatório de notas em PDF** e exportar as notas em planilha (CSV).

- Endereço: https://allanleoncas.github.io/aplicativosalunos/corretor-provas/
- Repositório: `allanleoncas/aplicativosalunos`, pasta `corretor-provas/`. O mesmo repositório tem outros apps (ex.: `mei-financeiro/`), um por pasta, listados no `README.md` da raiz.
- Primeiro uso real previsto: prova de **Introdução à Economia**, curso de **Direito**, **Primeira chamada**, **27/11/2026**, valendo **8 pontos**, com 8 questões sorteadas de um banco de 40 (Unidades 06 a 08: economia brasileira da substituição de importações ao Plano Real).

## 2. Como o professor usa

Abas: **Início**, **Avaliações**, **Corrigir**, **Turma**.

0. **Início** (abre ao entrar no app, `renderInicio()` em `ui.js`): saudação com o primeiro nome do professor e a data; 4 números (avaliações, provas geradas, corrigidas, falta corrigir); botões *+ Nova avaliação* e *Corrigir provas*; listas **Próximas provas** (data ≥ hoje, com dia/mês, "em N dias" e situação: falta o banco / faltam alunos / gerar provas / provas prontas / x/y corrigidas → abre a avaliação), **Para corrigir** (provas geradas com data ≤ hoje ou sem data e correção incompleta, com barra de progresso → abre a correção), **Corrigidas** (média → abre a Turma) e **Rascunhos** (sem data). Sem nenhuma avaliação: passo a passo + *Nova avaliação* + exemplo.

1. **Avaliações** → *Nova avaliação*. As avaliações ficam agrupadas por curso e disciplina.
2. Na avaliação, cinco passos:
   1. **Dados**: curso, disciplina, nome do(a) professor(a) (lembrado nas próximas avaliações em `db.professor`), título, chamada (Primeira chamada, Segunda chamada, Exame, Recuperação), data, valor da prova, questões por prova (1 a 10), embaralhar questões, frente e verso, mostrar tema.
   2. **Cabeçalho**: por padrão, o **cabeçalho UNIFADAP** do modelo do professor (logo à esquerda; à direita, tudo em maiúsculas, `CURSO - ANO` (ano = ano da data da prova, ex.: 2026), `TÍTULO - CHAMADA` e `DISCIPLINA` em itálico; linha azul abaixo), desenhado pelo app com os dados do passo 1 (`cabecalhoPadrao()` em `pdfgen.js`; logo em `img/logo_unifadap.png` e `logo.js`). Não é preciso enviar nada. Opcional: enviar outra imagem ou PDF (recorta as margens brancas) e depois *Voltar ao padrão UNIFADAP*.
   3. **Banco de questões**: planilha modelo (o app oferece para baixar) com colunas `Tema | Nível | Enunciado | A | B | C | D | E | Correta | Comentário`. Aceita .xlsx, .xls, .csv (UTF-8 ou Windows-1252), .ods. Questões com 4 alternativas: coluna E vazia.
   4. **Alunos**: planilha (Nome, RA, CPF) ou lista colada (nome, RA e/ou CPF separados por tabulação ou ponto e vírgula; CPF reconhecido por ter 11 dígitos). O CPF é mascarado na importação (`mascararCPF()`: `123.***.***-45`) e o número completo nunca é guardado.
   5. **Provas**: *Gerar provas (PDF)*, *Gabarito do professor (PDF)*, *Sortear de novo*.
   6. **Correção e relatório** (depois de gerar): corrigir, *Relatório de notas (PDF)*, *Exportar notas (CSV)*.
   7. **Backup**: exportar a avaliação em .json (para guardar ou passar para outro aparelho) e excluir.
3. **Corrigir**: abre com a **lista das provas já geradas** no aparelho (curso, disciplina, título · chamada · data e "x/y corrigidas"); tocar numa prova abre a correção dela (*‹ Provas* volta à lista; o botão *Corrigir provas* do editor vai direto). Na correção: *Corrigir com a câmera* (leitura contínua; precisa de 2 leituras iguais seguidas) ou *Corrigir a partir de uma foto*. A tela de resultado mostra nota, acertos e cada questão; questões em branco, com dupla marcação ou marcação fraca ficam em amarelo, e o professor toca para escolher a letra. *Salvar e próxima* reabre a câmera. Se a folha for de outra avaliação salva no aparelho, o app troca sozinho.
4. **Turma**: lista de alunos com nota ou "pendente", busca, relatório PDF e CSV.

Também há um **exemplo de demonstração** (avaliação `DEMO`, 3 alunos) e o `kit_teste.pdf` com as folhas dele (layout OMR1).

## 3. A prova gerada (PDF)

- Cada prova tem **2 páginas** (uma folha frente e verso) no caso normal de 8 questões.
- Página 1: cabeçalho (padrão UNIFADAP ou o enviado); dois quadros (pedido do professor em 19/11/2026): **quadro do aluno** — linha 1: `NOME: ...` em maiúsculas, fonte maior (13 pt, reduz sozinha se o nome for longo) e `CPF: 123.***.***-45` (ou RA, se não houver CPF); leve espaço; linha 2: assinatura do(a) aluno(a) e data da prova; **quadro do professor** — linha 1: `Professor(a):` + nome em negrito e `VALOR DA PROVA: X PONTOS` (vermelho); linha 2: `Nota da prova ___  Nota dos trabalhos ___`; linha 3: `NOTA FINAL (   )` + campo largo para a nota por extenso e `Assinatura: ___` (campo menor). O código da prova (P01...) aparece no rodapé e no QR; instruções; questões em **duas colunas**.
- Página 2: restante das questões e, no rodapé, a **folha de respostas compacta (OMR2)**.
- Se as questões não couberem, a prova ganha páginas e a folha vai para o rodapé da última; com "frente e verso", o app completa o número par de páginas.
- Rodapé de cada página: nome do aluno, código e "Página x de y".
- Fontes padrão do PDF (Helvetica, Latin-1): `san()` em `pdfgen.js` troca travessões, aspas curvas etc. por equivalentes.

## 4. Sorteio das provas (`sortear()` em `app.js`)

- **Prova extra em branco**: o sorteio sempre acrescenta, no fim, uma prova a mais (`extra: true`, nome interno `ALUNO(A) NÃO LISTADO(A)`, próximo código, ex.: P54) para aluno que não está na lista. No PDF ela sai com `NOME: ____` e `CPF: ____` para preencher à mão, "Aluno(a): ____" na folha e rodapé "Prova extra (aluno fora da lista)". Na correção, a tela pede o nome do aluno (salvo em maiúsculas). `alunosGerados()` ignora a extra enquanto não for corrigida (contagens, turma, relatório); `todosGerados()` a inclui (leitura da folha).

- Cotas por tema: todos os temas aparecem quando o nº de questões ≥ nº de temas; o que sobra gira entre os alunos.
- Dentro do tema, prioriza as questões menos usadas e evita repetir as do aluno anterior da lista (vizinhos de carteira).
- Garante combinações diferentes (até 40 tentativas por aluno); se o banco não permitir, avisa na tela.
- Embaralha a ordem das questões (opcional) e **sempre** as alternativas; o gabarito de cada aluno é derivado da permutação.
- Determinístico: semente = `hash(id da avaliação + config.semente)`. *Sortear de novo* incrementa a semente e apaga as correções.
- Mudar banco, alunos, nº de questões ou embaralhamento depois de gerar exige novo sorteio (o app pede confirmação).

## 4b. Questões discursivas (19/11/2026)

- **Banco**: coluna opcional `Tipo` (Objetiva/Discursiva); linha sem alternativas também vira discursiva. Discursivas recebem ids `D01, D02...` (objetivas `Q001...`) e `tipo: 'D'`; a resposta esperada fica em `Comentário`. A planilha modelo traz 2 objetivas e 2 discursivas de exemplo.
- **Config** (passo 1): `config.nd` (discursivas por prova, 0–5; mudar exige novo sorteio), `config.valorDisc` (total das discursivas; o resto do valor da prova é dividido entre as objetivas) e `config.linhas` (linhas de resposta, padrão 8). `valores(a, al)` em `app.js` calcula o valor de cada objetiva (`vq`) e de cada discursiva (`vdq`).
- **Sorteio**: cada aluno recebe `al.disc = [ids]`, priorizando as menos usadas e diferentes do aluno anterior. O gabarito/QR/OMR continuam só com as objetivas (layout OMR2 inalterado).
- **PDF**: discursivas vêm depois das objetivas (numeração continua), com "(x pt) discursiva - ref. D01" e linhas para resposta, em duas colunas. Com 8 objetivas + 2 discursivas de 8 linhas a prova fica em 2 páginas; com 10 linhas passa para 3 (4 com frente e verso). O gabarito do professor lista as discursivas usadas com a resposta esperada e as provas em que caíram.
- **Correção**: a câmera corrige as objetivas; a tela de resultado tem um campo de nota para cada discursiva (aceita vírgula, limitado a `vdq`). Nota = objetivas + discursivas. Resultado guarda `disc, notaObj, notaDisc, faltaDisc`; Turma, relatório e CSV mostram "falta discursiva" enquanto houver nota em branco. A nota pode ser lançada depois, tocando no aluno na aba Turma.

## 5. Folha de respostas e leitura óptica

**QR code**: `VERSÃO|id da avaliação|código do aluno|nº de questões` (ex.: `OMR2|AK3F9QZ1|P07|8`). Nunca contém as respostas; o gabarito fica só no aparelho do professor.

**Layouts** (mm, origem no centro do marcador superior esquerdo). O leitor escolhe o layout pela versão do QR, então folhas antigas continuam legíveis. **Não alterar layouts existentes; criar nova versão.**

| | OMR1 (página inteira) | OMR2 (compacta, atual) |
|---|---|---|
| Uso | kit de teste / demonstração | provas geradas pelo app |
| Largura × altura | 170 × 130 | 180 × 64 |
| Marcador (quadrado preto) | 9 | 7 |
| QR (x, y, lado) | 128, 8, 32 | 149, 9, 25 |
| Bolhas | 1 coluna: x0 32, dx 13, y0 52, dy 7,5, raio 2,9 | 2 blocos de 5: x0 22 e 84, y0 33, dx 9, dy 6,5, raio 2,5 |

Na prova, a OMR2 fica centralizada no rodapé da última página: canto superior esquerdo (centro do marcador) em x = 15 mm, y = 297 − 14 − 3,5 − 64 = 215,5 mm.

**Algoritmo (`omr.js`)**, roda no navegador e no Node:
1. Lê o QR com jsQR em várias escalas (1; 0,6; 0,4).
2. Homografia aproximada a partir dos 4 cantos do QR.
3. Procura os marcadores no limiar adaptativo (imagem integral, janela ~20 mm): componentes escuros com área entre 0,25× e 4× a esperada e forma quadrada medida de modo **independente da rotação** (momento de inércia normalizado ≤ 0,215 e distância máxima ao centro/√área entre 0,63 e 0,95; um círculo dá 0,564 e é descartado).
4. Associa cada canto ao candidato mais próximo da posição prevista e confere a consistência pelo QR (erro < 5 mm).
5. Homografia final pelos 4 marcadores; para cada bolha, compara a escuridão do interior (disco de 0,6 raio) com o branco local (anel a 1,33 raio) e o preto dos marcadores.
6. Decisão: marcada se escore ≥ 0,40; duas acima → "dupla" (salvo se uma for 0,35 mais escura); maior entre 0,22 e 0,40 → "dúvida"; abaixo → "branco".
- Branco ou dupla contam como erradas, a menos que o professor escolha a letra.

## 6. Arquivos

```
corretor-provas/
  index.html      interface (abas, câmera, resultado, CSS)
  ui.js           telas: lista e editor de avaliações, corrigir, turma, câmera, resultado
  app.js          LAYOUTS, IndexedDB, sorteio, leitura de planilhas, cabeçalho enviado, notas
  pdfgen.js       PDF das provas (cabeçalho padrão UNIFADAP, 2 colunas + folha), gabarito do professor, relatório de notas
  logo.js         logo da UNIFADAP em base64 (usado no PDF); img/logo_unifadap.png (usado na tela)
  omr.js          leitura óptica
  kit_teste.pdf   folhas do exemplo DEMO (OMR1)
  lib/            jsQR (Apache-2.0), jsPDF (MIT), qrcode-generator (MIT),
                  SheetJS 0.18.5 (Apache-2.0), pdf.js 3.11.174 (Apache-2.0); carregadas sob demanda
  gerador/        folha.py (desenha a OMR1 em Python), layouts.json, demo.json
  testes/         simular.py, sim2.py, testar.js, e2e3.py e README com o passo a passo
```

**Dados (IndexedDB `corretorProvas`, chave `db`)**:
`{versao: 2, ativa, professor, avaliacoes: {id: avaliação}}`.
Avaliação: `{id, curso, disciplina, professor, titulo, chamada, data, valor_total, config: {n, embaralharQuestoes, frenteVerso, mostrarTema, semente}, cabecalho: null (= padrão UNIFADAP) ou {dataUrl, tipo, w, h}, banco: [{id, tema, nivel, enunciado, alts, correta, comentario}], alunos: [{nome, ra, cpf (mascarado)}], gerado: {quando, layout, alunos: [{codigo, nome, ra, cpf, gabarito, questoes: [{qid, perm}]}]}, resultados: {codigo: {marcadas, status, acertos, n, nota, pendencias, quando}}}`.
A versão 1 (localStorage) é migrada na abertura. Também importa arquivos de gabaritos simples (`{id, prova, alunos: [{codigo, nome, ra, gabarito}]}`) e backups.

## 7. Validação feita

- OMR1: 90/90 fotos simuladas (perspectiva, sombra, borrão, ruído, JPEG, caneta azul e preta, preenchimento parcial, dupla marcação, branco, X) + 30/30 giradas até 90°.
- OMR2: 30/30 fotos (inclusive de cabeça para baixo e com questão em branco) + fluxo completo no navegador: avaliação criada pela interface, 12 provas geradas (todas com 2 páginas e combinações únicas), 6 folhas preenchidas e corrigidas com nota exata, relatório gerado.
- 19/11/2026, cabeçalho padrão UNIFADAP: fluxo completo repetido sem enviar cabeçalho (12 provas com 2 páginas, 6/6 correções exatas, PDF conferido visualmente). Repetido com os novos quadros do aluno/professor e CPF: 12 provas com 2 páginas, 6/6 correções exatas, nome muito longo reduz a fonte e cabe.
- Ainda **não** testado com papel impresso e câmera real (o professor vai testar).

## 8. Pontos de atenção e próximos passos

- **Teste real**: imprimir, preencher à mão e corrigir pelo celular; ajustar limiares se aparecerem falhas (pedir foto da folha).
- **Dados por aparelho**: o que é criado no computador não aparece no celular; usar *Exportar backup* / importar. No iPhone, o ícone da tela inicial guarda dados separados do Safari.
- **PWA** (oferecido, não feito): manifest + service worker para "Instalar app" no Android, tela cheia e funcionamento sem internet.
- Ideias não pedidas ainda: relatório de acerto por questão e por tema; boletim individual; mais de 10 questões por folha (precisaria de layout OMR3).
- Cabeçalho real (modelo UNIFADAP enviado em 19/11/2026) já embutido no app. Avaliações antigas em que foi enviado um cabeçalho fictício: clicar em *Voltar ao padrão UNIFADAP* no passo 2.
- O ambiente do Claude não acessa github.io: confirmar a publicação no navegador do professor.

## 9. Modelo de prova aprovado (19/11/2026) — não mudar sem pedido do professor

1. **Cabeçalho UNIFADAP** (automático, não pedir ao professor): logo à esquerda; à direita, em MAIÚSCULAS: `CURSO - ANO DA PROVA` (ex.: DIREITO - 2026), `TÍTULO - CHAMADA`, `DISCIPLINA` (itálico); linha azul abaixo.
2. **Quadro do aluno**: `NOME: NOME COMPLETO` (maiúsculas, fonte maior) e `CPF: 123.***.***-45` (3 primeiros números e 2 dígitos finais); abaixo, com leve espaço, `Assinatura do(a) aluno(a): ____` e `Data da prova: dd/mm/aaaa`.
3. **Quadro do professor**: `Professor(a):` + **nome em negrito** e `VALOR DA PROVA: X PONTOS` (vermelho); `Nota da prova: ___  Nota dos trabalhos: ___`; `NOTA FINAL (   ) ________` (campo largo para a nota por extenso) e `Assinatura: ____` (campo menor).
4. Instruções, questões em duas colunas e folha de respostas OMR2 no rodapé da última página; 8 questões = 2 páginas (frente e verso).
