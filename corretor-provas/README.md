# Corretor de Provas

Aplicativo para professores: gera provas objetivas individuais em PDF a partir de um banco de questões, corrige pela câmera do celular e emite o relatório de notas. Serve para qualquer curso e disciplina.

**Abrir:** https://allanleoncas.github.io/aplicativosalunos/corretor-provas/

## Fluxo
1. **Avaliações** – crie uma avaliação (curso, disciplina, título, data, valor, questões por prova).
2. **Cabeçalho** – envie o cabeçalho da instituição como imagem ou PDF (as margens brancas são recortadas).
3. **Banco de questões** – baixe a planilha modelo, preencha (Tema, Nível, Enunciado, A–E, Correta, Comentário) e envie.
4. **Alunos** – envie uma planilha (Nome, RA) ou cole a lista.
5. **Provas** – o app sorteia uma prova diferente para cada aluno, cobrindo todos os temas, com questões e alternativas embaralhadas, e gera um PDF único: questões em duas colunas e folha de respostas compacta no rodapé da última página, de modo que cada prova caiba numa folha frente e verso e o gabarito do professor.
6. **Corrigir** – aponte a câmera para a folha de respostas; o app lê o QR code, os 4 marcadores e as bolhas, e calcula a nota. Questões em branco, com dupla marcação ou marcação fraca ficam em amarelo para conferência.
7. **Relatório** – PDF com as notas da turma (média, maior, menor, abaixo da média) e exportação em planilha CSV.

Tudo fica no navegador do aparelho (IndexedDB). Use **Exportar backup** para guardar uma cópia ou levar a avaliação para outro aparelho.

## Arquivos
- `index.html`, `ui.js`, `app.js` – interface, armazenamento, importações e sorteio das provas.
- `pdfgen.js` – provas, folha de respostas, gabarito e relatório em PDF.
- `omr.js` – leitura óptica da folha (QR code, marcadores, homografia, bolhas).
- `lib/` – bibliotecas: jsQR (Apache-2.0), jsPDF (MIT), qrcode-generator (MIT), SheetJS (Apache-2.0), pdf.js (Apache-2.0).
- `kit_teste.pdf` – folhas da avaliação de demonstração.
- `gerador/` – `layouts.json` com os dois layouts de folha que o app lê: OMR2 (compacta, no rodapé da última página, usada nas provas geradas) e OMR1 (página inteira, das folhas de teste). `folha.py` desenha a OMR1.

O QR code da folha contém `OMR1|<id da avaliação>|<código do aluno>|<nº de questões>` e nunca as respostas.
