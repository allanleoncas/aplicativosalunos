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
  function folha(doc, L, ox, oy, aluno, avId, n, titulo) {
    var W = L.largura, H = L.altura, S = L.marcador, g = S / 2 + 3;
    var P = function (x, y) { return [ox + x, oy + y]; };
    cor(doc, 'Draw', LINHA); doc.setLineWidth(0.25);
    [[g, 0, W - g, 0], [g, H, W - g, H], [0, g, 0, H - g], [W, g, W, H - g]].forEach(function (s) {
      doc.line(ox + s[0], oy + s[1], ox + s[2], oy + s[3]);
    });
    cor(doc, 'Fill', [0, 0, 0]);
    [[0, 0], [W, 0], [0, H], [W, H]].forEach(function (c) { doc.rect(ox + c[0] - S / 2, oy + c[1] - S / 2, S, S, 'F'); });
    var Q = L.qr;
    desenharQR(doc, L.versao + '|' + avId + '|' + aluno.codigo + '|' + n, ox + Q.x, oy + Q.y, Q.lado);
    fonte(doc, 'bold', 12, NAVY); doc.text('FOLHA DE RESPOSTAS', ox + 9, oy + 12);
    fonte(doc, 'normal', 9.5);
    var nome = doc.splitTextToSize(san('Aluno(a): ' + aluno.nome), 112)[0];
    doc.text(nome, ox + 9, oy + 19.5);
    doc.text(san('RA: ' + (aluno.ra || '') + '     Prova: ' + aluno.codigo), ox + 9, oy + 25.5);
    if (titulo) { fonte(doc, 'normal', 8, CINZA); doc.text(doc.splitTextToSize(san(titulo), 112)[0], ox + 9, oy + 31); }
    fonte(doc, 'normal', 8, [68, 74, 85]);
    doc.text('Preencha totalmente uma bolha por questão, com caneta azul ou preta.', ox + 9, oy + 38);
    doc.text('Não rasure, não dobre a folha e não escreva sobre o QR code ou os quadrados pretos.', ox + 9, oy + 42.5);
    var B = L.bolhas, r = B.raio;
    for (var i = 0; i < n; i++) {
      var y = B.y0 + i * B.dy;
      fonte(doc, 'bold', 10, NAVY); doc.text((i < 9 ? '0' : '') + (i + 1), ox + B.x0 - 7, oy + y + 1.3, { align: 'right' });
      for (var j = 0; j < B.letras.length; j++) {
        var x = B.x0 + j * B.dx;
        cor(doc, 'Draw', [90, 96, 112]); cor(doc, 'Fill', [255, 255, 255]); doc.setLineWidth(0.28);
        doc.circle(ox + x, oy + y, r, 'FD');
        fonte(doc, 'normal', 7.5, [160, 165, 176]); doc.text(B.letras[j], ox + x, oy + y + 0.95, { align: 'center' });
      }
    }
    var ex = 112, ey = 60;
    fonte(doc, 'bold', 8, [68, 74, 85]); doc.text('Como marcar', ox + ex, oy + ey - 6);
    cor(doc, 'Fill', [0, 0, 0]); doc.circle(ox + ex + 3, oy + ey, r, 'F');
    fonte(doc, 'normal', 8, [23, 116, 74]); doc.text('Certo', ox + ex + 8, oy + ey + 1.2);
    cor(doc, 'Draw', [90, 96, 112]); cor(doc, 'Fill', [255, 255, 255]); doc.circle(ox + ex + 3, oy + ey + 8, r, 'FD');
    cor(doc, 'Draw', [0, 0, 0]); doc.setLineWidth(0.35);
    doc.line(ox + ex + 1.2, oy + ey + 6.2, ox + ex + 4.8, oy + ey + 9.8); doc.line(ox + ex + 1.2, oy + ey + 9.8, ox + ex + 4.8, oy + ey + 6.2);
    fonte(doc, 'normal', 8, [184, 50, 40]); doc.text('Errado (não marque com X)', ox + ex + 8, oy + ey + 9.2);
    fonte(doc, 'normal', 8, [68, 74, 85]); doc.text('Nota:', ox + 112, oy + 112);
    cor(doc, 'Draw', LINHA); doc.setLineWidth(0.25); doc.line(ox + 121, oy + 112.5, ox + 154, oy + 112.5);
  }

  // ---------------- provas ----------------
  function cabecalhoImg(doc, cab, y) {
    if (!cab) return y;
    var w = CW, h = w * cab.h / cab.w, maxH = 55;
    if (h > maxH) { h = maxH; w = h * cab.w / cab.h; }
    doc.addImage(cab.dataUrl, cab.tipo || 'PNG', M + (CW - w) / 2, y, w, h, undefined, 'FAST');
    return y + h + 4;
  }
  function blocoQuestao(doc, num, q, perm, valor, mostrarTema) {
    // devolve {altura, desenhar(y)}
    var tamE = 10.5, tamA = 10, ind = 8;
    fonte(doc, 'normal', tamE);
    var enun = doc.splitTextToSize(san(q.enunciado), CW);
    fonte(doc, 'normal', tamA);
    var alts = perm.map(function (pi, k) { return doc.splitTextToSize(san(q.alts[pi]), CW - ind); });
    var hT = 6, hE = alturaLinhas(enun.length, tamE) + 1.5, hA = 0;
    alts.forEach(function (a) { hA += alturaLinhas(a.length, tamA) + 1.2; });
    var total = hT + hE + hA + 4;
    return {
      altura: total,
      desenhar: function (y) {
        fonte(doc, 'bold', 10.5, NAVY); doc.text('Questão ' + num, M, y + 3.6);
        var tx = M + doc.getTextWidth('Questão ' + num) + 3;
        fonte(doc, 'normal', 8.5, CINZA);
        var info = (valor ? '(' + fmtNum(valor) + ' ponto' + (valor === 1 ? '' : 's') + ')' : '') + (mostrarTema && q.tema ? '   ' + san(q.tema) : '');
        doc.text(doc.splitTextToSize(info, CW - (tx - M))[0] || '', tx, y + 3.6);
        y += hT;
        fonte(doc, 'normal', tamE); doc.text(enun, M, y + 3.4, { lineHeightFactor: 1.3 }); y += hE;
        alts.forEach(function (a, k) {
          fonte(doc, 'bold', tamA, NAVY); doc.text('(' + 'ABCDE'[k] + ')', M + 1, y + 3.3);
          fonte(doc, 'normal', tamA); doc.text(a, M + ind, y + 3.3, { lineHeightFactor: 1.3 });
          y += alturaLinhas(a.length, tamA) + 1.2;
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

  function gerarProvas(av, L, opcoes) {
    opcoes = opcoes || {};
    var doc = new root.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    var banco = {}; av.banco.forEach(function (q) { banco[q.id] = q; });
    var alunos = av.gerado.alunos, primeira = true;
    var titulo = [av.disciplina, av.titulo].filter(Boolean).join(' - ');
    alunos.forEach(function (al) {
      if (!primeira) doc.addPage(); primeira = false;
      var pIni = doc.getNumberOfPages(), n = al.questoes.length;
      var valor = (+av.valor_total || 10) / n;
      var y = cabecalhoImg(doc, av.cabecalho, M);
      // faixa do aluno
      cor(doc, 'Fill', [241, 244, 250]); cor(doc, 'Draw', LINHA); doc.setLineWidth(0.25);
      doc.roundedRect(M, y, CW, 17, 2, 2, 'FD');
      fonte(doc, 'bold', 10.5); doc.text(doc.splitTextToSize(san('Aluno(a): ' + al.nome), CW - 60)[0], M + 4, y + 6.5);
      fonte(doc, 'normal', 9.5);
      doc.text(san('RA: ' + (al.ra || '-')), M + CW - 4, y + 6.5, { align: 'right' });
      doc.text(san([av.curso, titulo].filter(Boolean).join('  ·  ')).slice(0, 110), M + 4, y + 12.8);
      doc.text(san('Prova ' + al.codigo + (av.data ? '  ·  ' + fmtData(av.data) : '')), M + CW - 4, y + 12.8, { align: 'right' });
      y += 21;
      fonte(doc, 'normal', 8.8, CINZA);
      var instr = doc.splitTextToSize(san(n + ' questões objetivas, valor total ' + fmtNum(+av.valor_total || 10) + ' pontos (' + fmtNum(valor) +
        ' cada). Cada questão tem uma única alternativa correta. Marque as respostas na FOLHA DE RESPOSTAS, na última página: somente ela será corrigida.'), CW);
      doc.text(instr, M, y + 2.5, { lineHeightFactor: 1.3 }); y += alturaLinhas(instr.length, 8.8) + 4;
      al.questoes.forEach(function (qq, k) {
        var q = banco[qq.qid];
        var b = blocoQuestao(doc, k + 1, q, qq.perm, valor, opcoes.mostrarTema);
        if (y + b.altura > PH - 16) { doc.addPage(); y = M + 2; }
        b.desenhar(y); y += b.altura;
      });
      // folha de respostas
      doc.addPage();
      fonte(doc, 'bold', 13, NAVY); doc.text(san(titulo || 'Prova'), M, M + 6);
      fonte(doc, 'normal', 9, CINZA);
      doc.text(san('Entregue esta folha ao final da prova. As respostas marcadas fora dela não serão consideradas.'), M, M + 12);
      folha(doc, L, (PW - L.largura) / 2, 45, al, av.id, n, [av.curso, titulo].filter(Boolean).join(' - '));
      if (av.config.frenteVerso && (doc.getNumberOfPages() - pIni + 1) % 2 === 1) doc.addPage();
      var pFim = doc.getNumberOfPages(), tot = pFim - pIni + 1;
      for (var p = pIni; p <= pFim; p++) {
        doc.setPage(p);
        rodape(doc, (al.nome + ' · ' + al.codigo), p - pIni + 1, tot);
      }
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
      [av.curso, av.data ? fmtData(av.data) : '', av.gerado.alunos.length + ' provas'].filter(Boolean).join('  ·  '));
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
      [av.curso, av.data ? 'Aplicada em ' + fmtData(av.data) : '', 'Emitido em ' + new Date().toLocaleDateString('pt-BR')].filter(Boolean).join('  ·  '));
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
