# -*- coding: utf-8 -*-
"""Folha de respostas OMR1: QR code + 4 marcadores + bolhas A-E.
As coordenadas vêm de layout.json, o mesmo arquivo usado pelo app de correção."""
import json, io, os
import qrcode
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

AQUI = os.path.dirname(os.path.abspath(__file__))
LAY = json.load(open(os.path.join(AQUI, 'layout.json'), encoding='utf-8'))
NAVY = HexColor('#1F3864')
CINZA = HexColor('#8A8F99')

def qr_png(texto):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=0)
    q.add_data(texto); q.make(fit=True)
    img = q.make_image(fill_color='black', back_color='white')
    b = io.BytesIO(); img.save(b, format='PNG'); b.seek(0)
    return ImageReader(b)

def texto_qr(prova_id, codigo, n):
    return f"{LAY['versao']}|{prova_id}|{codigo}|{n}"

def desenhar_folha(c, ox, oy, aluno, prova_id, n, titulo_prova=''):
    """ox, oy: posição (em pontos, origem inferior esquerda da página) do centro do marcador superior esquerdo."""
    W, H, S = LAY['largura'], LAY['altura'], LAY['marcador']
    def P(x, y):  # mm do layout -> pontos na página
        return ox + x * mm, oy - y * mm
    # moldura leve
    c.setStrokeColor(HexColor('#C9CED8')); c.setLineWidth(0.6)
    g = S / 2 + 3  # folga para a linha não encostar nos marcadores
    for (ax, ay, bx, by) in ((g, 0, W - g, 0), (g, H, W - g, H), (0, g, 0, H - g), (W, g, W, H - g)):
        c.line(*P(ax, ay), *P(bx, by))
    # marcadores
    c.setFillColor(black)
    for mx, my in ((0, 0), (W, 0), (0, H), (W, H)):
        px, py = P(mx - S / 2, my + S / 2)
        c.rect(px, py, S * mm, S * mm, stroke=0, fill=1)
    # QR
    q = LAY['qr']
    qx, qy = P(q['x'], q['y'] + q['lado'])
    c.drawImage(qr_png(texto_qr(prova_id, aluno['codigo'], n)), qx, qy, q['lado'] * mm, q['lado'] * mm)
    # cabeçalho
    c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 12)
    c.drawString(*P(9, 12), 'FOLHA DE RESPOSTAS')
    c.setFillColor(black); c.setFont('Helvetica', 9.5)
    c.drawString(*P(9, 19.5), f"Aluno(a): {aluno['nome']}")
    c.drawString(*P(9, 25.5), f"RA: {aluno.get('ra', '')}     Prova: {aluno['codigo']}")
    if titulo_prova:
        c.setFont('Helvetica', 8); c.setFillColor(CINZA)
        c.drawString(*P(9, 31), titulo_prova[:80])
    c.setFont('Helvetica', 8); c.setFillColor(HexColor('#444A55'))
    c.drawString(*P(9, 38), 'Preencha totalmente uma bolha por questão, com caneta azul ou preta.')
    c.drawString(*P(9, 42.5), 'Não rasure, não dobre a folha e não escreva sobre o QR code ou os quadrados pretos.')
    # bolhas
    b = LAY['bolhas']; r = b['raio']
    for i in range(n):
        y = b['y0'] + i * b['dy']
        c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 10)
        c.drawRightString(*P(b['x0'] - 7, y + 1.3), f'{i + 1:02d}')
        for j, L in enumerate(b['letras']):
            x = b['x0'] + j * b['dx']
            cx, cy = P(x, y)
            c.setStrokeColor(HexColor('#5A6070')); c.setLineWidth(0.8); c.setFillColor(white)
            c.circle(cx, cy, r * mm, stroke=1, fill=1)
            c.setFillColor(HexColor('#A0A5B0')); c.setFont('Helvetica', 7.5)
            c.drawCentredString(cx, cy - 2.6, L)
    # exemplo de preenchimento
    ex_x, ex_y = 112, 60
    c.setFillColor(HexColor('#444A55')); c.setFont('Helvetica-Bold', 8)
    c.drawString(*P(ex_x, ex_y - 6), 'Como marcar')
    c.setFont('Helvetica', 8)
    cx, cy = P(ex_x + 3, ex_y); c.setFillColor(black); c.circle(cx, cy, r * mm, stroke=0, fill=1)
    c.setFillColor(HexColor('#17744A')); c.drawString(*P(ex_x + 8, ex_y + 1.2), 'Certo')
    cx, cy = P(ex_x + 3, ex_y + 8); c.setStrokeColor(HexColor('#5A6070')); c.setFillColor(white)
    c.circle(cx, cy, r * mm, stroke=1, fill=1)
    c.setStrokeColor(black); c.setLineWidth(1)
    c.line(cx - 5, cy - 5, cx + 5, cy + 5); c.line(cx - 5, cy + 5, cx + 5, cy - 5)
    c.setFillColor(HexColor('#B83228')); c.drawString(*P(ex_x + 8, ex_y + 9.2), 'Errado (não marque com X)')
    # campo de nota
    c.setStrokeColor(HexColor('#C9CED8')); c.setFillColor(HexColor('#444A55'))
    nx, ny = P(112, 112); c.drawString(nx, ny + 2, 'Nota:')
    c.line(nx + 24, ny + 1, nx + 120, ny + 1)

def pagina_folha(c, aluno, prova_id, n, titulo_prova='', topo_mm=150):
    """Desenha a folha centralizada horizontalmente numa página A4, com o topo do quadro a topo_mm do alto."""
    pw, ph = A4
    W = LAY['largura']
    ox = (pw - W * mm) / 2
    oy = ph - topo_mm * mm
    desenhar_folha(c, ox, oy, aluno, prova_id, n, titulo_prova)

if __name__ == '__main__':
    import sys
    dados = json.load(open(sys.argv[1], encoding='utf-8'))
    c = canvas.Canvas(sys.argv[2], pagesize=A4)
    for a in dados['alunos']:
        c.setFont('Helvetica-Bold', 14); c.setFillColor(NAVY)
        c.drawString(20 * mm, A4[1] - 25 * mm, dados.get('prova', ''))
        c.setFont('Helvetica', 10); c.setFillColor(black)
        c.drawString(20 * mm, A4[1] - 32 * mm, 'Folha de respostas para teste do Corretor de Provas')
        pagina_folha(c, a, dados['id'], len(a['gabarito']), dados.get('prova', ''), topo_mm=60)
        c.showPage()
    c.save()
