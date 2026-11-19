/* Corretor de Provas – geração de PDFs (provas individuais, gabarito do professor, relatório de notas).
   Depende de jsPDF (window.jspdf) e qrcode-generator (window.qrcode). Unidades em mm, A4 retrato. */
(function (root) {
  'use strict';
  var PW = 210, PH = 297, M = 15, CW = PW - 2 * M;
  var NAVY = [31, 56, 100], CORAL = [255, 59, 95], CINZA = [94, 99, 120], LINHA = [205, 210, 220], TINTA = [20, 26, 43];
  var PT = 0.3528; // mm por ponto

  // fontes padrão do PDF usam Latin-1: troca caracteres tipográficos fora dele
  function san(s) {
    return String(s == null ? '' : s)
      .replace(/[–—−]/g, '-').replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'")
      .replace(/…/g, '...').replace(/[•●]/g, '·').replace(/ /g, ' ').replace(/[→]/g, '->')
      .replace(/[^\u0009\u000A\u000D -ÿ]/g, '');
  }
  function cor(doc, tipo, c) { doc['set' + tipo + 'Color'](c[0], c[1], c[2]); }
  function fonte(doc, estilo, tam, c) { doc.setFont('helvetica', estilo); doc.setFontSize(tam); cor(doc, 'Text', c || TINTA); }
  function alturaLinhas(n, tam, fator) { return n * tam * PT * (fator || 1.3); }
  function fmtNum(x) { return (Math.round(x * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }
  function fmtData(iso) { if (!iso) return ''; var p = iso.split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }

  // ---------------- folha de respostas (mesmo layout de omr.js / folha.py) ----------------
  function desenharQR(doc, texto, x, y, lado) {
    var q = root.qrcode(0, 'M'); q.addData(texto); q.make();
    var n = q.getModuleCount(), m = lado / n;
    cor(doc, 'Fill', [0, 0, 0]);
    for (var r = 0; r < n; r++) {
      var c = 0;
      while (c < n) {
        if (q.isDark(r, c)) { var c0 = c; while (c < n && q.isDark(r, c)) c++; doc.rect(x + c0 * m, y + r * m, (c - c0) * m + 0.01, m + 0.01, 'F'); }
        else c++;
      }
    }
  }
  function posBolha(B, q, j) {
    if (B.blocos) { var b = B.blocos[Math.floor(q / B.porBloco)], r = q % B.porBloco; return [b.x0 + j * B.dx, b.y0 + r * B.dy]; }
    return [B.x0 + j * B.dx, B.y0 + q * B.dy];
  }
  function folha(doc, L, ox, oy, aluno, avId, n, titulo) {
    var W = L.largura, H = L.altura, S = L.marcador, g = S / 2 + 3, compacta = !!L.bolhas.blocos;
    cor(doc, 'Draw', LINHA); doc.setLineWidth(0.25);
    [[g, 0, W - g, 0], [g, H, W - g, H], [0, g, 0, H - g], [W, g, W, H - g]].forEach(function (s) {
      doc.line(ox + s[0], oy + s[1], ox + s[2], oy + s[3]);
    });
    cor(doc, 'Fill', [0, 0, 0]);
    [[0, 0], [W, 0], [0, H], [W, H]].forEach(function (c) { doc.rect(ox + c[0] - S / 2, oy + c[1] - S / 2, S, S, 'F'); });
    var Q = L.qr;
    desenharQR(doc, L.versao + '|' + avId + '|' + aluno.codigo + '|' + n, ox + Q.x, oy + Q.y, Q.lado);
    var tx = compacta ? 7 : 9, larg = Q.x - tx - 4;
    if (compacta) {
      fonte(doc, 'bold', 10.5, NAVY); doc.text('FOLHA DE RESPOSTAS', ox + tx, oy + 8.5);
      fonte(doc, 'normal', 8.5);
      doc.text(doc.splitTextToSize(san('Aluno(a): ' + aluno.nome), larg)[0], ox + tx, oy + 14);
      doc.text(san('RA: ' + (aluno.ra || '') + '     Prova: ' + aluno.codigo), ox + tx, oy + 18.6);
      fonte(doc, 'normal', 7, [68, 74, 85]);
      doc.text('Preencha totalmente uma bolha por questão, com caneta azul ou preta. Não marque com X.', ox + tx, oy + 23.4);
      doc.text('Não rasure e não escreva sobre o QR code ou os quadrados pretos.', ox + tx, oy + 26.6);
    } else {
      fonte(doc, 'bold', 12, NAVY); doc.text('FOLHA DE RESPOSTAS', ox + 9, oy + 12);
      fonte(doc, 'normal', 9.5);
      doc.text(doc.splitTextToSize(san('Aluno(a): ' + aluno.nome), 112)[0], ox + 9, oy + 19.5);
      doc.text(san('RA: ' + (aluno.ra || '') + '     Prova: ' + aluno.codigo), ox + 9, oy + 25.5);
      if (titulo) { fonte(doc, 'normal', 8, CINZA); doc.text(doc.splitTextToSize(san(titulo), 112)[0], ox + 9, oy + 31); }
      fonte(doc, 'normal', 8, [68, 74, 85]);
      doc.text('Preencha totalmente uma bolha por questão, com caneta azul ou preta.', ox + 9, oy + 38);
      doc.text('Não rasure, não dobre a folha e não escreva sobre o QR code ou os quadrados pretos.', ox + 9, oy + 42.5);
    }
    var B = L.bolhas, r = B.raio, tl = compacta ? 6.6 : 7.5;
    for (var i = 0; i < n; i++) {
      var p0 = posBolha(B, i, 0);
      fonte(doc, 'bold', compacta ? 9 : 10, NAVY); doc.text((i < 9 ? '0' : '') + (i + 1), ox + p0[0] - (compacta ? 5.5 : 7), oy + p0[1] + 1.2, { align: 'right' });
      for (var j = 0; j < B.letras.length; j++) {
        var p = posBolha(B, i, j);
        cor(doc, 'Draw', [90, 96, 112]); cor(doc, 'Fill', [255, 255, 255]); doc.setLineWidth(0.28);
        doc.circle(ox + p[0], oy + p[1], r, 'FD');
        fonte(doc, 'normal', tl, [160, 165, 176]); doc.text(B.letras[j], ox + p[0], oy + p[1] + tl * PT * 0.36, { align: 'center' });
      }
    }
    var ex = compacta ? 132 : 112, ey = compacta ? 41 : 60, dy = compacta ? 6.5 : 8;
    fonte(doc, 'bold', compacta ? 7.5 : 8, [68, 74, 85]); doc.text('Como marcar', ox + ex, oy + ey - (compacta ? 4.5 : 6));
    cor(doc, 'Fill', [0, 0, 0]); doc.circle(ox + ex + 3, oy + ey, r, 'F');
    fonte(doc, 'normal', compacta ? 7.5 : 8, [23, 116, 74]); doc.text('Certo', ox + ex + 7.5, oy + ey + 1.2);
    cor(doc, 'Draw', [90, 96, 112]); cor(doc, 'Fill', [255, 255, 255]); doc.circle(ox + ex + 3, oy + ey + dy, r, 'FD');
    cor(doc, 'Draw', [0, 0, 0]); doc.setLineWidth(0.35);
    var k = r * 0.62;
    doc.line(ox + ex + 3 - k, oy + ey + dy - k, ox + ex + 3 + k, oy + ey + dy + k); doc.line(ox + ex + 3 - k, oy + ey + dy + k, ox + ex + 3 + k, oy + ey + dy - k);
    fonte(doc, 'normal', compacta ? 7.5 : 8, [184, 50, 40]); doc.text(compacta ? 'Errado' : 'Errado (não marque com X)', ox + ex + 7.5, oy + ey + dy + 1.2);
    var nx = compacta ? 132 : 112, ny = compacta ? 58 : 112;
    fonte(doc, 'normal', 8, [68, 74, 85]); doc.text('Nota:', ox + nx, oy + ny);
    cor(doc, 'Draw', LINHA); doc.setLineWidth(0.25); doc.line(ox + nx + 9, oy + ny + 0.5, ox + nx + (compacta ? 38 : 42), oy + ny + 0.5);
  }

  // ---------------- provas ----------------
  // texto alinhado à direita, reduzindo a fonte se não couber na largura
  function textoDir(doc, txt, x, y, larg, estilo, tam) {
    fonte(doc, estilo, tam);
    while (tam > 7 && doc.getTextWidth(txt) > larg) { tam -= 0.5; fonte(doc, estilo, tam); }
    doc.text(txt, x, y, { align: 'right' });
  }
  function anoAv(av) {
    if (av.data && /^\d{4}/.test(av.data)) return av.data.slice(0, 4);
    return String(new Date().getFullYear());
  }
  // cabeçalho padrão UNIFADAP (modelo do professor): logo à esquerda; curso – ano, tipo de prova e disciplina à direita; linha azul
  function cabecalhoPadrao(doc, av, y) {
    var L = root.LOGO_UNIFADAP, lw = 52, lh = L ? lw * L.h / L.w : 18;
    if (L) doc.addImage(L.dataUrl, 'PNG', M, y, lw, lh, undefined, 'FAST');
    var xr = PW - M, larg = CW - lw - 6;
    var l1 = san([(av.curso || '').toUpperCase(), anoAv(av)].filter(Boolean).join(' - '));
    var l2 = san([av.titulo, av.chamada].filter(Boolean).join(' - ').toUpperCase());
    var l3 = san((av.disciplina || '').toUpperCase());
    textoDir(doc, l1, xr, y + 5.2, larg, 'bold', 12.5);
    textoDir(doc, l2, xr, y + 10.7, larg, 'bold', 12);
    textoDir(doc, l3, xr, y + 16.2, larg, 'bolditalic', 12.5);
    var yl = y + lh + 3.5;
    cor(doc, 'Draw', NAVY); doc.setLineWidth(0.5); doc.line(M, yl, PW - M, yl);
    return yl + 4;
  }
  function cabecalhoImg(doc, cab, y, av) {
    if (!cab) return cabecalhoPadrao(doc, av, y);
    var w = CW, h = w * cab.h / cab.w, maxH = 55;
    if (h > maxH) { h = maxH; w = h * cab.w / cab.h; }
    doc.addImage(cab.dataUrl, cab.tipo || 'PNG', M + (CW - w) / 2, y, w, h, undefined, 'FAST');
    return y + h + 4;
  }
  function blocoQuestao(doc, num, q, perm, valor, mostrarTema, larg) {
    var tamE = 9.5, tamA = 9, ind = 6.5;
    fonte(doc, 'normal', tamE);
    var enun = doc.splitTextToSize(san(q.enunciado), larg);
    fonte(doc, 'normal', tamA);
    var alts = perm.map(function (pi) { return doc.splitTextToSize(san(q.alts[pi]), larg - ind); });
    var hT = 5.2, hE = alturaLinhas(enun.length, tamE, 1.25) + 1.2, hA = 0;
    alts.forEach(function (a) { hA += alturaLinhas(a.length, tamA, 1.22) + 0.9; });
    var total = hT + hE + hA + 3.2;
    return {
      altura: total,
      desenhar: function (x, y) {
        fonte(doc, 'bold', 9.5, NAVY); doc.text('Questão ' + num, x, y + 3.3);
        var tx = x + doc.getTextWidth('Questão ' + num) + 2.5;
        fonte(doc, 'normal', 7.8, CINZA);
        var info = (valor ? '(' + fmtNum(valor) + ' pt)' : '') + (mostrarTema && q.tema ? '  ' + san(q.tema) : '');
        doc.text(doc.splitTextToSize(info, larg - (tx - x))[0] || '', tx, y + 3.3);
        y += hT;
        fonte(doc, 'normal', tamE); doc.text(enun, x, y + 3.1, { lineHeightFactor: 1.25 }); y += hE;
        alts.forEach(function (a, k) {
          fonte(doc, 'bold', tamA, NAVY); doc.text('ABCDE'[k] + ')', x + 0.5, y + 3);
          fonte(doc, 'normal', tamA); doc.text(a, x + ind, y + 3, { lineHeightFactor: 1.22 });
          y += alturaLinhas(a.length, tamA, 1.22) + 0.9;
        });
      }
    };
  }
  function rodape(doc, texto, pagina, total) {
    fonte(doc, 'normal', 7.5, CINZA);
    doc.text(san(texto), M, PH - 8);
    doc.text('Página ' + pagina + ' de ' + total, PW - M, PH - 8, { align: 'right' });
    cor(doc, 'Draw', LINHA); doc.setLineWidth(0.2); doc.line(M, PH - 11.5, PW - M, PH - 11.5);
  }

  function gerarProvas(av, Ls, opcoes) {
    opcoes = opcoes || {};
    var L = Ls[av.gerado.layout || 'OMR2'] || Ls.OMR2;
    var doc = new root.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    var banco = {}; av.banco.forEach(function (q) { banco[q.id] = q; });
    var primeira = true, GAP = 6, COL = (CW - GAP) / 2, FIM = PH - 15;
    var titulo = [av.disciplina, av.titulo].filter(Boolean).join(' - ');
    // folha compacta no rodapé da última página
    var oyFolha = PH - 14 - L.marcador / 2 - L.altura, topoFolha = oyFolha - L.marcador / 2 - 9;
    av.gerado.alunos.forEach(function (al) {
      if (!primeira) doc.addPage(); primeira = false;
      var pIni = doc.getNumberOfPages(), n = al.questoes.length;
      var valor = (+av.valor_total || 10) / n;
      var y = cabecalhoImg(doc, av.cabecalho, M, av);
      // quadro do aluno
      var xL = M + 4, xR = M + CW - 4, CINZAL = [120, 126, 140];
      function caixa(yy, h) { cor(doc, 'Fill', [241, 244, 250]); cor(doc, 'Draw', LINHA); doc.setLineWidth(0.25); doc.roundedRect(M, yy, CW, h, 2, 2, 'FD'); }
      function linha(x1, x2, yy) { cor(doc, 'Draw', CINZAL); doc.setLineWidth(0.3); doc.line(x1, yy + 0.4, x2, yy + 0.4); }
      function rotulo(t, x, yy, estilo, tam, c) { fonte(doc, estilo || 'bold', tam || 9, c); doc.text(san(t), x, yy); return x + doc.getTextWidth(san(t)) + 1.5; }
      var H1 = 18;
      caixa(y, H1);
      var doc2 = al.cpf ? 'CPF: ' + al.cpf : (al.ra ? 'RA: ' + al.ra : 'CPF: ______________');
      fonte(doc, 'bold', 11); var wDoc = doc.getTextWidth(san(doc2));
      doc.text(san(doc2), xR, y + 7, { align: 'right' });
      var nomeTxt = 'NOME: ' + String(al.nome || '').toUpperCase(), tamN = 13;
      fonte(doc, 'bold', tamN);
      while (tamN > 7.5 && doc.getTextWidth(san(nomeTxt)) > CW - 8 - wDoc - 6) { tamN -= 0.5; fonte(doc, 'bold', tamN); }
      doc.text(san(nomeTxt), xL, y + 7);
      var dt = 'Data da prova: ' + (av.data ? fmtData(av.data) : '____/____/______');
      fonte(doc, 'bold', 9); var wDt = doc.getTextWidth(san(dt));
      var xa = rotulo('Assinatura do(a) aluno(a):', xL, y + 14.5);
      linha(xa, xR - wDt - 6, y + 14.5);
      fonte(doc, 'bold', 9); doc.text(san(dt), xR, y + 14.5, { align: 'right' });
      y += H1 + 2.5;
      // quadro do professor
      var H2 = 21;
      caixa(y, H2);
      var vt = 'VALOR DA PROVA: ' + fmtNum(+av.valor_total || 10) + ' PONTOS';
      fonte(doc, 'bold', 10.5, CORAL); var wV = doc.getTextWidth(san(vt)); doc.text(san(vt), xR, y + 6, { align: 'right' });
      var xp = rotulo('Professor(a):', xL, y + 6, 'normal');
      if (av.professor) { fonte(doc, 'bold', 9.5); doc.text(doc.splitTextToSize(san(av.professor), xR - wV - 6 - xp)[0] || '', xp, y + 6); }
      else linha(xp, xR - wV - 6, y + 6);
      var x2 = rotulo('Nota da prova:', xL, y + 12.5); linha(x2, x2 + 25, y + 12.5);
      x2 = rotulo('Nota dos trabalhos:', x2 + 32, y + 12.5); linha(x2, x2 + 25, y + 12.5);
      // nota final (número entre parênteses e campo largo para escrever por extenso) e assinatura
      var xa2 = xR - 52;
      x2 = rotulo('NOTA FINAL (', xL, y + 18.5);
      x2 = rotulo(')', x2 + 12, y + 18.5); linha(x2 + 1, xa2 - 6, y + 18.5);
      var xs = rotulo('Assinatura:', xa2, y + 18.5); linha(xs, xR, y + 18.5);
      y += H2 + 3;
      fonte(doc, 'normal', 8.3, CINZA);
      var instr = doc.splitTextToSize(san(n + ' questões objetivas, valor total ' + fmtNum(+av.valor_total || 10) + ' pontos (' + fmtNum(valor) +
        ' cada), com uma única alternativa correta. Marque as respostas na FOLHA DE RESPOSTAS, no final da prova: somente ela será corrigida.'), CW);
      doc.text(instr, M, y + 2.4, { lineHeightFactor: 1.25 }); y += alturaLinhas(instr.length, 8.3, 1.25) + 3;
      // fluxo em duas colunas
      var blocos = al.questoes.map(function (qq, k) { return blocoQuestao(doc, k + 1, banco[qq.qid], qq.perm, valor, opcoes.mostrarTema, COL); });
      // simula para saber em que página a folha cabe
      function distribuir() {
        var pos = [], pag = 0, col = 0, yy = y, topo = y;
        for (var k = 0; k < blocos.length; k++) {
          var h = blocos[k].altura;
          for (;;) {
            var lim = FIM;
            if (yy + h <= lim) { pos.push({ pag: pag, col: col, y: yy }); yy += h; break; }
            if (col === 0) { col = 1; yy = topo; } else { pag++; col = 0; topo = M + 2; yy = topo; }
          }
        }
        return pos;
      }
      var pos = distribuir(), ultima = pos.length ? pos[pos.length - 1].pag : 0;
      // a folha vai no rodapé da última página; se as questões da última página invadem a área da folha, redistribui com limite
      function cabeFolha(p, pg) { return p.every(function (o, k) { return o.pag < pg || o.y + blocos[k].altura <= topoFolha; }); }
      var pgFolha = ultima;
      if (!cabeFolha(pos, ultima)) {
        // tenta empurrar as questões da última página para respeitar o limite da folha
        var pos2 = [], pag = 0, col = 0, topo = y, yy = y;
        for (var k = 0; k < blocos.length; k++) {
          var h = blocos[k].altura;
          for (;;) {
            var lim = (pag >= ultima) ? topoFolha : FIM;
            if (yy + h <= lim) { pos2.push({ pag: pag, col: col, y: yy }); yy += h; break; }
            if (col === 0) { col = 1; yy = topo; } else { pag++; col = 0; topo = M + 2; yy = topo; }
          }
        }
        pos = pos2; pgFolha = pos[pos.length - 1].pag;
        if (!cabeFolha(pos, pgFolha)) pgFolha++;
      }
      pos.forEach(function (o, k) {
        while (doc.getNumberOfPages() < pIni + o.pag) doc.addPage();
        doc.setPage(pIni + o.pag);
        blocos[k].desenhar(M + o.col * (COL + GAP), o.y);
      });
      while (doc.getNumberOfPages() < pIni + pgFolha) doc.addPage();
      doc.setPage(pIni + pgFolha);
      cor(doc, 'Draw', CORAL); doc.setLineWidth(0.5); doc.line(M, topoFolha - 1.5, M + CW, topoFolha - 1.5);
      fonte(doc, 'normal', 7.8, CINZA);
      doc.text(san('Marque suas respostas na folha abaixo. Somente as marcações feitas nela serão consideradas.'), M, topoFolha + 3);
      folha(doc, L, (PW - L.largura) / 2, oyFolha, al, av.id, n, [av.curso, titulo].filter(Boolean).join(' - '));
      if (av.config.frenteVerso && (doc.getNumberOfPages() - pIni + 1) % 2 === 1) doc.addPage();
      var pFim = doc.getNumberOfPages(), tot = pFim - pIni + 1;
      for (var p = pIni; p <= pFim; p++) { doc.setPage(p); rodape(doc, (al.nome + ' · ' + al.codigo), p - pIni + 1, tot); }
      doc.setPage(pFim);
    });
    return doc;
  }

  // ---------------- tabelas ----------------
  function tabela(doc, y, colunas, linhas, opts) {
    // colunas: [{t, w, al}] ; linhas: arrays de strings
    opts = opts || {};
    var tam = opts.tam || 9, hL = opts.hL || 6.4;
    function cab(yy) {
      cor(doc, 'Fill', NAVY); doc.rect(M, yy, CW, hL, 'F');
      fonte(doc, 'bold', tam, [255, 255, 255]);
      var x = M; colunas.forEach(function (c) { escreve(c.t, x, yy, c); x += c.w; });
      return yy + hL;
    }
    function escreve(t, x, yy, c) {
      var txt = doc.splitTextToSize(san(t), c.w - 3)[0] || '';
      var tx = c.al === 'c' ? x + c.w / 2 : c.al === 'r' ? x + c.w - 1.5 : x + 1.5;
      doc.text(txt, tx, yy + hL / 2 + tam * PT * 0.35, { align: c.al === 'c' ? 'center' : c.al === 'r' ? 'right' : 'left' });
    }
    y = cab(y);
    linhas.forEach(function (l, i) {
      if (y + hL > PH - 16) { doc.addPage(); y = cab(M); }
      if (i % 2) { cor(doc, 'Fill', [244, 246, 251]); doc.rect(M, y, CW, hL, 'F'); }
      var x = M;
      l.forEach(function (v, k) {
        var c = colunas[k], st = (opts.estilo && opts.estilo(i, k, v)) || {};
        fonte(doc, st.b ? 'bold' : 'normal', tam, st.cor || TINTA);
        escreve(v, x, y, c); x += c.w;
      });
      y += hL;
    });
    cor(doc, 'Draw', LINHA); doc.setLineWidth(0.2); doc.line(M, y, M + CW, y);
    return y;
  }
  function titulo(doc, sup, tit, sub) {
    cor(doc, 'Fill', NAVY); doc.rect(0, 0, PW, 30, 'F');
    cor(doc, 'Fill', CORAL); doc.rect(0, 30, PW, 1.2, 'F');
    fonte(doc, 'bold', 8.5, [255, 160, 178]); doc.text(san(sup).toUpperCase(), M, 11);
    fonte(doc, 'bold', 17, [255, 255, 255]); doc.text(san(tit), M, 20);
    fonte(doc, 'normal', 9.5, [210, 220, 240]); doc.text(san(sub), M, 26.3);
    return 40;
  }
  function numerarRodapes(doc, texto) {
    var n = doc.getNumberOfPages();
    for (var p = 1; p <= n; p++) { doc.setPage(p); rodape(doc, texto, p, n); }
  }

  function gerarGabarito(av) {
    var doc = new root.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    var nmax = Math.max.apply(null, av.gerado.alunos.map(function (a) { return a.gabarito.length; }));
    var y = titulo(doc, 'Gabarito do professor', [av.disciplina, av.titulo].filter(Boolean).join(' - ') || 'Avaliação',
      [av.curso, av.chamada, av.data ? fmtData(av.data) : '', av.gerado.alunos.length + ' provas'].filter(Boolean).join('  ·  '));
    var wq = Math.min(9.5, (CW - 12 - 64 - 14) / nmax), cols = [{ t: 'Nº', w: 12, al: 'c' }, { t: 'Aluno(a)', w: CW - 12 - 14 - wq * nmax }, { t: 'Prova', w: 14, al: 'c' }];
    for (var i = 0; i < nmax; i++) cols.push({ t: String(i + 1), w: wq, al: 'c' });
    var linhas = av.gerado.alunos.map(function (a, k) { return [String(k + 1), a.nome, a.codigo].concat(a.gabarito.split('')); });
    y = tabela(doc, y, cols, linhas, { estilo: function (i, k) { return k >= 3 ? { b: true, cor: NAVY } : null; } });
    fonte(doc, 'normal', 8.5, CINZA);
    doc.text(san('As alternativas foram embaralhadas em cada prova: use sempre a linha do aluno. Documento de uso exclusivo do professor.'), M, y + 6);
    numerarRodapes(doc, 'Gabarito · ' + (av.disciplina || '') + ' · ' + (av.titulo || ''));
    return doc;
  }

  function gerarRelatorio(av) {
    var doc = new root.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    var alunos = av.gerado.alunos.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    var res = av.resultados || {};
    var notas = alunos.filter(function (a) { return res[a.codigo]; }).map(function (a) { return res[a.codigo].nota; });
    var media = notas.length ? notas.reduce(function (s, x) { return s + x; }, 0) / notas.length : null;
    var y = titulo(doc, 'Relatório de notas', [av.disciplina, av.titulo].filter(Boolean).join(' - ') || 'Avaliação',
      [av.curso, av.chamada, av.data ? 'Aplicada em ' + fmtData(av.data) : '', 'Emitido em ' + new Date().toLocaleDateString('pt-BR')].filter(Boolean).join('  ·  '));
    var kp = [
      ['Provas corrigidas', notas.length + ' de ' + alunos.length],
      ['Média da turma', media == null ? '-' : fmtNum(media)],
      ['Maior nota', notas.length ? fmtNum(Math.max.apply(null, notas)) : '-'],
      ['Menor nota', notas.length ? fmtNum(Math.min.apply(null, notas)) : '-'],
      ['Abaixo da média', media == null ? '-' : String(notas.filter(function (x) { return x < media; }).length)]
    ];
    var bw = (CW - 4 * 3) / 5;
    kp.forEach(function (k, i) {
      var x = M + i * (bw + 3);
      cor(doc, 'Fill', [241, 244, 250]); doc.roundedRect(x, y, bw, 19, 2, 2, 'F');
      fonte(doc, 'normal', 7.8, CINZA); doc.text(k[0], x + 3, y + 6);
      fonte(doc, 'bold', 15, NAVY); doc.text(k[1], x + 3, y + 15);
    });
    y += 25;
    fonte(doc, 'normal', 8.5, CINZA);
    doc.text(san('Valor total da avaliação: ' + fmtNum(+av.valor_total || 10) + ' pontos.'), M, y); y += 5;
    var cols = [{ t: 'Nº', w: 10, al: 'c' }, { t: 'Aluno(a)', w: 66 }, { t: 'RA', w: 24, al: 'c' }, { t: 'Prova', w: 14, al: 'c' },
                { t: 'Acertos', w: 16, al: 'c' }, { t: 'Nota', w: 15, al: 'c' }, { t: 'Situação', w: CW - 145 }];
    var linhas = alunos.map(function (a, i) {
      var r = res[a.codigo];
      return [String(i + 1), a.nome, a.ra || '-', a.codigo, r ? r.acertos + '/' + r.n : '-', r ? fmtNum(r.nota) : '-',
              r ? (r.pendencias ? 'conferir (' + r.pendencias + ')' : 'corrigida') : 'não corrigida'];
    });
    tabela(doc, y, cols, linhas, {
      estilo: function (i, k, v) {
        if (k === 5 && v !== '-') { var x = parseFloat(v.replace(',', '.')); return { b: true, cor: media != null && x < media ? [184, 50, 40] : NAVY }; }
        if (k === 6 && v !== 'corrigida') return { cor: CINZA };
        return null;
      }
    });
    numerarRodapes(doc, 'Relatório de notas · ' + (av.disciplina || '') + ' · ' + (av.titulo || ''));
    return doc;
  }

  root.PDFGEN = { gerarProvas: gerarProvas, gerarGabarito: gerarGabarito, gerarRelatorio: gerarRelatorio, san: san };
})(this);
