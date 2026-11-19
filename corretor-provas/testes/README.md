# Testes do Corretor de Provas

Ferramentas usadas para validar a leitura óptica e o fluxo completo do app. Rodam fora do navegador.

## Preparação
```bash
cd corretor-provas/testes
npm init -y && npm i jsqr pngjs        # leitor no Node
pip install opencv-python qrcode reportlab playwright && playwright install chromium
```

## 1. Leitura óptica com fotos simuladas (folha OMR1, página inteira)
```bash
python3 ../gerador/folha.py demo.json kit_teste.pdf
pdftoppm -png -r 200 kit_teste.pdf base      # gera base-1.png, base-2.png, base-3.png
python3 simular.py 30                         # 90 fotos com perspectiva, sombra, ruído, dupla marcação, branco, X
node testar.js                                # compara a leitura com o esperado (casos.json)
```

## 2. Fluxo completo no navegador (folha OMR2, compacta)
Sirva a pasta do app (`python3 -m http.server 8765` dentro de `corretor-provas/`) e rode:
```bash
python3 e2e3.py
```
O script cria uma avaliação pela interface, envia cabeçalho (`cab_teste.pdf`), banco (`.xlsx`) e alunos (`alunos_teste.txt`), gera `provas.pdf` e `gabarito.pdf`, chama `sim2.py` para preencher e "fotografar" as folhas de 6 alunos, corrige pelo app e baixa `relatorio.pdf`. Ajuste os nomes desses arquivos de entrada no início do script.

`sim2.py` usa o layout OMR2 de `layouts.json` e localiza a folha no PDF pelo texto "Marque suas respostas na folha abaixo".

## Resultados da última validação (19/11/2026)
- OMR1: 90/90 fotos simuladas + 30/30 giradas (até 90°).
- OMR2: 30/30 fotos (inclusive de cabeça para baixo) + 6/6 no fluxo completo.
