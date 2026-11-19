# Corretor de Provas

Correção de provas objetivas pelo celular. O app lê a folha de respostas com a câmera (QR code + 4 marcadores + bolhas A–E), compara com o gabarito de cada aluno e exporta as notas da turma em planilha.

**Abrir:** https://allanleoncas.github.io/aplicativosalunos/corretor-provas/

## Como funciona
1. Cada prova sai com uma folha de respostas própria, com um QR code que identifica o aluno.
2. No app, carregue o arquivo de gabaritos da turma (`.json`), gerado junto com as provas.
3. Aponte a câmera para a folha. O app lê as marcações, mostra a nota e destaca em amarelo as questões em branco, com dupla marcação ou com marcação fraca, para conferência.
4. Exporte a planilha (`.csv`, abre no Excel) na aba **Turma**.

Os gabaritos e as notas ficam só no navegador do aparelho (localStorage). Nada é enviado para servidor.

## Arquivos
- `index.html` – o aplicativo.
- `omr.js` – leitura óptica: QR code, localização dos marcadores, homografia e leitura das bolhas.
- `jsQR.js` – biblioteca de leitura de QR code ([jsQR](https://github.com/cozmo/jsQR), Apache-2.0).
- `kit_teste.pdf` – folhas de teste para a prova de demonstração.
- `gerador/` – `folha.py` desenha a folha de respostas a partir de `layout.json` (o mesmo layout que o app usa); `demo.json` é o exemplo de arquivo de gabaritos.

## Formato do arquivo de gabaritos
```json
{
  "formato": "corretor-provas-1",
  "id": "DIR2611",
  "prova": "Economia – Direito – Unidades 06 a 08",
  "valor_total": 10,
  "alunos": [
    {"codigo": "P01", "nome": "Nome do aluno", "ra": "12345", "gabarito": "CAEBDACE"}
  ]
}
```
O QR code da folha contém `OMR1|<id da prova>|<código do aluno>|<nº de questões>` e nunca as respostas.
