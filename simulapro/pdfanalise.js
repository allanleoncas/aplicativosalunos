/* SimulaPro – PDFs das análises: análise da prova, boletim do aluno, evolução e painel do curso.
   Depende de jsPDF (window.jspdf) e de PDFGEN.san (pdfgen.js). Dados vêm de analises.js. Unidades em mm, A4. */
(function (root) {
  'use strict';
  var PW = 210, PH = 297, M = 15, CW = PW - 2 * M, PT = 0.3528;
  var NAVY = [31, 56, 100], CORAL = [255, 59, 95], CINZA = [94, 99, 120], LINHA = [205, 210, 220], TINTA = [20, 26, 43];
  var VERDE = [22, 120, 74], AMAR = [190, 130, 0], VERM = [184, 50, 40], FUNDO = [241, 244, 250];
  var LET = 'ABCDE';
  function san(s) { return root.PDFGEN.san(s); }
  function cor(doc, tipo, c) { doc['set' + tipo + 'Color'](c[0], c[1], c[2]); }
  function fonte(doc, estilo, tam, c) { doc.setFont('helvetica', estilo); doc.setFontSize(tam); cor(doc, 'Text', c || TINTA); }
  function num(x, d) { if (x == null || isNaN(x)) return '-'; var k = Math.pow(10, d == null ? 2 : d); return (Math.round(x * k) / k).toLocaleString('pt-BR', { maximumFractionDigits: d == null ? 2 : d }); }
  function pct(p) { return p == null || isNaN(p) ? '-' : Math.round(p * 100) + '%'; }
  function corP(p) { return p == null ? CINZA : p >= 0.7 ? VERDE : p >= 0.5 ? AMAR : VERM; }
  function situ(p) { return p == null ? '' : p >= 0.7 ? 'Bom' : p >= 0.5 ? 'Atenção' : 'Revisar'; }
  function fmtData(iso) { if (!iso) return ''; var p = iso.split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
  function novo() { return new root.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true }); }

  function titulo(doc, sup, tit, sub) {
    cor(doc, 'Fill', NAVY); doc.rect(0, 0, PW, 30, 'F');
    cor(doc, 'Fill', CORAL); doc.rect(0, 30, PW, 1.2, 'F');
    fonte(doc, 'bold', 8.5, [255, 160, 178]); doc.text(san(sup).toUpperCase(), M, 11);
    fonte(doc, 'bold', 16, [255, 255, 255]); doc.text(doc.splitTextToSize(san(tit), CW)[0], M, 20);
    fonte(doc, 'normal', 9.5, [210, 220, 240]); doc.text(doc.splitTextToSize(san(sub), CW)[0] || '', M, 26.3);
    return 40;
  }
  function rodapes(doc, texto) {
    var n = doc.getNumberOfPages();
    for (var p = 1; p <= n; p++) {
      doc.setPage(p); fonte(doc, 'normal', 7.5, CINZA);
      doc.text(san(texto), M, PH - 8); doc.text('Página ' + p + ' de ' + n, PW - M, PH - 8, { align: 'right' });
      cor(doc, 'Draw', LINHA); doc.setLineWidth(0.2); doc.line(M, PH - 11.5, PW - M, PH - 11.5);
    }
  }
  function kpis(doc, y, lista) {
    var g = 3, bw = (CW - g * (lista.length - 1)) / lista.length;
    lista.forEach(function (k, i) {
      var x = M + i * (bw + g);
      cor(doc, 'Fill', FUNDO); doc.roundedRect(x, y, bw, 19, 2, 2, 'F');
      fonte(doc, 'normal', 7.8, CINZA); doc.text(san(k[0]), x + 3, y + 6);
      fonte(doc, 'bold', 14, k[2] || NAVY); doc.text(san(k[1]), x + 3, y + 15);
    });
    return y + 25;
  }
  function secao(doc, y, txt, precisa) {
    if (y + (precisa || 20) > PH - 16) { doc.addPage(); y = M + 2; }
    fonte(doc, 'bold', 11.5, NAVY); doc.text(san(txt), M, y); return y + 5;
  }
  // barras horizontais: [{nome, p, extra}]
  function barras(doc, y, itens, opts) {
    opts = opts || {};
    var wr = opts.wr || 78, wb = CW - wr - 16, h = 6.2;
    itens.forEach(function (it) {
      if (y + h > PH - 16) { doc.addPage(); y = M + 2; }
      fonte(doc, 'normal', 8.6); doc.text(doc.splitTextToSize(san(it.nome), wr - 2)[0] || '', M, y + 4);
      cor(doc, 'Fill', [230, 234, 242]); doc.roundedRect(M + wr, y + 1.3, wb, 3.6, 1.2, 1.2, 'F');
      if (it.p > 0) { cor(doc, 'Fill', corP(it.p)); doc.roundedRect(M + wr, y + 1.3, Math.max(1.5, wb * Math.min(1, it.p)), 3.6, 1.2, 1.2, 'F'); }
      fonte(doc, 'bold', 8.6, corP(it.p)); doc.text(pct(it.p), M + CW, y + 4, { align: 'right' });
      if (it.marca != null) { cor(doc, 'Draw', TINTA); doc.setLineWidth(0.5); var xm = M + wr + wb * Math.min(1, it.marca); doc.line(xm, y + 0.4, xm, y + 5.8); }
      y += h;
    });
    return y + 5;
  }
  function tabela(doc, y, colunas, linhas, opts) {
    opts = opts || {};
    var tam = opts.tam || 8.6, hL = opts.hL || 6.2;
    function cab(yy) {
      cor(doc, 'Fill', NAVY); doc.rect(M, yy, CW, hL, 'F'); fonte(doc, 'bold', tam, [255, 255, 255]);
      var x = M; colunas.forEach(function (c) { esc(c.t, x, yy, c); x += c.w; }); return yy + hL;
    }
    function esc(t, x, yy, c) {
      var txt = doc.splitTextToSize(san(t), c.w - 2.5)[0] || '';
      var tx = c.al === 'c' ? x + c.w / 2 : c.al === 'r' ? x + c.w - 1.3 : x + 1.3;
      doc.text(txt, tx, yy + hL / 2 + tam * PT * 0.35, { align: c.al === 'c' ? 'center' : c.al === 'r' ? 'right' : 'left' });
    }
    if (y + hL * 2 > PH - 16) { doc.addPage(); y = M + 2; }
    y = cab(y);
    linhas.forEach(function (l, i) {
      if (y + hL > PH - 16) { doc.addPage(); y = cab(M); }
      if (i % 2) { cor(doc, 'Fill', [246, 248, 252]); doc.rect(M, y, CW, hL, 'F'); }
      var x = M;
      l.forEach(function (v, k) { var st = (opts.estilo && opts.estilo(i, k, v)) || {}; fonte(doc, st.b ? 'bold' : 'normal', tam, st.cor || TINTA); esc(v, x, y, colunas[k]); x += colunas[k].w; });
      y += hL;
    });
    cor(doc, 'Draw', LINHA); doc.setLineWidth(0.2); doc.line(M, y, M + CW, y);
    return y + 4;
  }
  function paragrafo(doc, y, txt, tam, c, estilo) {
    fonte(doc, estilo || 'normal', tam || 8.6, c || CINZA);
    var l = doc.splitTextToSize(san(txt), CW);
    if (y + l.length * (tam || 8.6) * PT * 1.3 > PH - 16) { doc.addPage(); y = M + 2; }
    doc.text(l, M, y, { lineHeightFactor: 1.3 }); return y + l.length * (tam || 8.6) * PT * 1.3 + 1.5;
  }
  function subt(av) { return [av.curso, av.chamada, av.data ? 'Aplicada em ' + fmtData(av.data) : '', 'Emitido em ' + new Date().toLocaleDateString('pt-BR')].filter(Boolean).join('  ·  '); }
  function nomeAv(av) { return [av.disciplina, av.titulo].filter(Boolean).join(' - ') || 'Avaliação'; }

  // ---------------- 1 e 2. análise da prova ----------------
  function gerarAnaliseProva(av, A) {
    var doc = novo(), total = +av.valor_total || 10;
    var y = titulo(doc, 'Análise da prova', nomeAv(av), subt(av));
    y = kpis(doc, y, [['Provas corrigidas', String(A.n)], ['Média da turma', num(A.mediaNota) + ' / ' + num(total)], ['Acerto geral', pct(A.acerto), corP(A.acerto)],
      ['Questões em alerta', String(A.alertas), A.alertas ? VERM : NAVY]]);
    if (A.temas.length) { y = secao(doc, y, 'Acerto por tema', 14); y = barras(doc, y + 1, A.temas); }
    if (A.comps.length) { y = secao(doc, y + 2, 'Acerto por competência', 14); y = barras(doc, y + 1, A.comps); }
    y = paragrafo(doc, y, 'Verde: 70% ou mais de acerto. Amarelo: de 50% a 69%. Vermelho: abaixo de 50% (vale retomar o conteúdo).', 8);
    var obj = A.questoes.filter(function (x) { return x.tipo === 'O'; }), dis = A.questoes.filter(function (x) { return x.tipo === 'D'; });
    if (obj.length) {
      y = secao(doc, y + 4, 'Questões objetivas do banco', 30);
      var cols = [{ t: 'Ref.', w: 13, al: 'c' }, { t: 'Tema', w: 44 }, { t: 'Resp.', w: 12, al: 'c' }, { t: 'Acerto', w: 15, al: 'c' }];
      LET.split('').forEach(function (l) { cols.push({ t: l, w: 9, al: 'c' }); });
      cols.push({ t: 'Branco', w: 13, al: 'c' }, { t: 'Atenção', w: 0 });
      cols[cols.length - 1].w = CW - cols.slice(0, -1).reduce(function (s, c) { return s + c.w; }, 0);
      var linhas = obj.map(function (x) {
        var l = [x.q.id, x.q.tema || '', String(x.n), pct(x.p)];
        for (var i = 0; i < 5; i++) l.push(i < x.escolhas.length ? String(x.escolhas[i]) : '');
        l.push(String(x.branco || 0), x.alertas.length ? (x.alertas.some(function (a) { return a.forte; }) ? 'Conferir' : 'Observar') : '');
        return l;
      });
      y = tabela(doc, y, cols, linhas, { estilo: function (i, k, v) {
        var x = obj[i];
        if (k === 3) return { b: true, cor: corP(x.p) };
        if (k >= 4 && k <= 8 && k - 4 === x.q.correta) return { b: true, cor: VERDE };
        if (k === 10 && v) return { b: true, cor: v === 'Conferir' ? VERM : AMAR };
        return null;
      } });
      y = paragrafo(doc, y, 'Colunas A a E: quantos alunos marcaram cada alternativa, com as letras da planilha (antes do embaralhamento). Em verde, a correta.', 8);
    }
    if (dis.length) {
      y = secao(doc, y + 4, 'Questões discursivas', 20);
      y = tabela(doc, y, [{ t: 'Ref.', w: 14, al: 'c' }, { t: 'Tema', w: 70 }, { t: 'Respostas', w: 22, al: 'c' }, { t: 'Média do valor', w: 30, al: 'c' }, { t: 'Atenção', w: CW - 136 }],
        dis.map(function (x) { return [x.q.id, x.q.tema || '', String(x.n), pct(x.p), x.alertas.length ? 'Observar' : '']; }),
        { estilo: function (i, k) { return k === 3 ? { b: true, cor: corP(dis[i].p) } : null; } });
    }
    var alerta = A.questoes.filter(function (x) { return x.alertas.length; });
    if (alerta.length) {
      y = secao(doc, y + 4, 'Questões que merecem atenção', 24);
      alerta.forEach(function (x) {
        fonte(doc, 'normal', 8.6); var en = doc.splitTextToSize(san(x.q.enunciado), CW - 4).slice(0, 3);
        var h = 5 + en.length * 8.6 * PT * 1.3 + x.alertas.length * 4.4 + 3;
        if (y + h > PH - 16) { doc.addPage(); y = M + 2; }
        fonte(doc, 'bold', 9, NAVY); doc.text(san(x.q.id + '  ·  ' + (x.q.tema || '') + '  ·  acerto ' + pct(x.p)), M, y); y += 4.4;
        fonte(doc, 'normal', 8.6, TINTA); doc.text(en, M + 2, y, { lineHeightFactor: 1.3 }); y += en.length * 8.6 * PT * 1.3 + 0.5;
        x.alertas.forEach(function (a) { fonte(doc, 'italic', 8.4, a.forte ? VERM : AMAR); doc.text(san('· ' + a.t), M + 2, y); y += 4.4; });
        y += 2.5;
      });
    }
    if (A.semItens) paragrafo(doc, y + 2, 'Parte das provas foi importada só com gabaritos: elas entram na média, mas não na análise por questão.', 8);
    rodapes(doc, 'Análise da prova · ' + (av.disciplina || '') + ' · ' + (av.titulo || ''));
    return doc;
  }

  // ---------------- 3. boletim do aluno (uma página por aluno) ----------------
  function gerarBoletimAluno(av, A, lista) {
    var doc = novo(), total = +av.valor_total || 10;
    lista.forEach(function (s, idx) {
      if (idx) doc.addPage();
      var B = root.boletimDe(A, s);
      var y = titulo(doc, 'Boletim do aluno', s.al.nome, [nomeAv(av), av.curso, av.data ? fmtData(av.data) : ''].filter(Boolean).join('  ·  '));
      var nObj = s.itens.filter(function (i) { return i.tipo === 'O'; }).length;
      var k = [['Sua nota', num(s.r.nota) + ' / ' + num(total), corP(s.r.nota / total)]];
      if (nObj) k.push(['Acertos nas objetivas', s.r.acertos + ' de ' + s.r.n]);
      k.push(['Média da turma', num(A.mediaNota) + ' / ' + num(total)]);
      y = kpis(doc, y, k);
      function bloco(tit, itens) {
        if (!itens.length) return;
        y = secao(doc, y, tit, 16);
        y = barras(doc, y + 1, itens.map(function (t) { return { nome: t.nome + ' (' + num(t.acertos, 1) + ' de ' + t.n + ')', p: t.p, marca: t.turma }; }), { wr: 92 });
      }
      bloco('Seu desempenho por tema', B.temas);
      bloco('Seu desempenho por competência', B.comps);
      if (B.temas.length || B.comps.length) y = paragrafo(doc, y, 'A barra mostra o seu acerto; o traço preto, a média da turma.', 7.8);
      y = secao(doc, y + 3, 'O que revisar', 14);
      if (B.revisar.length) B.revisar.slice(0, 6).forEach(function (t) { y = paragrafo(doc, y, '·  ' + t.nome + ' - você acertou ' + pct(t.p) + (t.turma != null ? ' (turma: ' + pct(t.turma) + ')' : '') + '. ' + situ(t.p) + '.', 9, TINTA); });
      else y = paragrafo(doc, y, 'Parabéns: você acertou 70% ou mais em todos os temas desta prova.', 9, VERDE);
      var objs = s.itens.filter(function (i) { return i.tipo === 'O'; });
      if (objs.length) {
        y = secao(doc, y + 3, 'Suas respostas', 16);
        var por = 10, cw = CW / por, ch = 11;
        objs.forEach(function (it, i) {
          var c = i % por, x = M + c * cw; if (c === 0 && i) y += ch + 1.5;
          if (c === 0 && y + ch > PH - 16) { doc.addPage(); y = M + 2; }
          var ok = it.cred === 1;
          cor(doc, 'Fill', ok ? [226, 243, 233] : [251, 228, 225]); doc.roundedRect(x + 0.6, y, cw - 1.2, ch, 1.5, 1.5, 'F');
          fonte(doc, 'normal', 7, CINZA); doc.text('Q' + it.pos, x + cw / 2, y + 3.4, { align: 'center' });
          fonte(doc, 'bold', 10, ok ? VERDE : VERM); doc.text(it.marcada || '-', x + cw / 2, y + 7.6, { align: 'center' });
          if (!ok) { fonte(doc, 'normal', 6.4, CINZA); doc.text('certa: ' + it.certa, x + cw / 2, y + 10.2, { align: 'center' }); }
        });
        y += ch + 4;
      }
      var disc = s.itens.filter(function (i) { return i.tipo === 'D'; });
      if (disc.length) {
        y = secao(doc, y + 2, 'Questões discursivas', 12);
        disc.forEach(function (it) { y = paragrafo(doc, y, 'Questão ' + it.pos + (it.tema ? ' (' + it.tema + ')' : '') + ': ' + num(it.nota) + ' de ' + num(it.valor), 9, TINTA); });
      }
    });
    rodapes(doc, 'Boletim · ' + (av.disciplina || '') + ' · ' + (av.titulo || '') + ' · documento individual');
    return doc;
  }

  // ---------------- 4. evolução ----------------
  function grafico(doc, y, vals, rots, max, h) {
    h = h || 52; var ml = 10, x0 = M + ml, w = CW - ml - 4, n = vals.length;
    function X(i) { return n < 2 ? x0 + w / 2 : x0 + i * w / (n - 1); }
    function Y(v) { return y + 4 + (1 - v / max) * (h - 14); }
    [0, max / 2, max].forEach(function (v) {
      cor(doc, 'Draw', LINHA); doc.setLineWidth(0.2); doc.line(x0, Y(v), x0 + w, Y(v));
      fonte(doc, 'normal', 7, CINZA); doc.text(num(v, 1), x0 - 2, Y(v) + 1, { align: 'right' });
    });
    var ant = null;
    cor(doc, 'Draw', [46, 95, 163]); doc.setLineWidth(0.8);
    vals.forEach(function (v, i) { if (v == null) return; if (ant) doc.line(ant[0], ant[1], X(i), Y(v)); ant = [X(i), Y(v)]; });
    vals.forEach(function (v, i) {
      if (v != null) { cor(doc, 'Fill', CORAL); doc.circle(X(i), Y(v), 1.3, 'F'); fonte(doc, 'bold', 7.8, TINTA); doc.text(num(v, 1), X(i), Y(v) - 2.6, { align: 'center' }); }
      fonte(doc, 'normal', 7, CINZA); doc.text(san(rots[i]), X(i), y + h - 4, { align: 'center' });
    });
    return y + h;
  }
  function gerarEvolucao(G, E) {
    var doc = novo(), MAXC = 8;
    var pts = E.pts.slice(-MAXC), off = E.pts.length - pts.length;
    var rots = pts.map(function (p, i) { return p.data ? fmtData(p.data).slice(0, 5) : 'P' + (off + i + 1); });
    var y = titulo(doc, 'Evolução da turma', G.nome, G.tipo + '  ·  ' + (function () { var nA = E.pts.filter(function (p) { return p.tipo === 'Avaliação'; }).length, nR = E.pts.length - nA; return nA + ' avaliaç' + (nA === 1 ? 'ão' : 'ões') + (nR ? ' e ' + nR + ' rodada' + (nR > 1 ? 's' : '') + ' da trilha' : ''); })() + '  ·  Emitido em ' + new Date().toLocaleDateString('pt-BR'));
    y = secao(doc, y, 'Média da turma (de 0 a 10)', 60);
    y = grafico(doc, y, pts.map(function (p) { return p.media10; }), rots, 10);
    y = tabela(doc, y + 2, [{ t: 'Data', w: 18, al: 'c' }, { t: 'Avaliação', w: 112 }, { t: 'Alunos', w: 18, al: 'c' }, { t: 'Média', w: CW - 148, al: 'c' }],
      pts.map(function (p, i) { return [rots[i], (p.tipo !== 'Avaliação' ? p.tipo + ' · ' : G.tipo === 'Turma' ? p.disciplina + ' · ' : '') + p.titulo, String(p.n), num(p.media10, 1)]; }),
      { estilo: function (i, k) { return k === 3 ? { b: true, cor: corP(pts[i].media10 / 10) } : null; } });
    var eixo = E.comps.length ? E.comps : E.temas;
    if (eixo.length) {
      y = secao(doc, y + 2, (E.comps.length ? 'Competências' : 'Temas') + ' ao longo do tempo (% de acerto)', 24);
      var wc = Math.min(16, (CW - 60) / pts.length), cols = [{ t: E.comps.length ? 'Competência' : 'Tema', w: CW - wc * pts.length }];
      rots.forEach(function (r) { cols.push({ t: r, w: wc, al: 'c' }); });
      y = tabela(doc, y, cols, eixo.map(function (e) { return [e.nome].concat(e.v.slice(off).map(function (v) { return v == null ? '' : pct(v); })); }),
        { estilo: function (i, k) { if (!k) return null; var v = eixo[i].v[off + k - 1]; return v == null ? null : { b: true, cor: corP(v) }; } });
    }
    y = secao(doc, y + 2, 'Alunos (notas de 0 a 10)', 24);
    var wn = Math.min(14, (CW - 70 - 20) / pts.length), colsA = [{ t: 'Aluno(a)', w: CW - wn * pts.length - 20 }];
    rots.forEach(function (r) { colsA.push({ t: r, w: wn, al: 'c' }); }); colsA.push({ t: 'Tendência', w: 20, al: 'c' });
    tabela(doc, y, colsA, E.alunos.map(function (a) {
      var t = a.tend == null ? '-' : a.tend >= 0.5 ? 'subiu ' + num(a.tend, 1) : a.tend <= -0.5 ? 'caiu ' + num(-a.tend, 1) : 'estável';
      return [a.nome].concat(a.notas.slice(off).map(function (v) { return v == null ? '-' : num(v, 1); })).concat([t]);
    }), { tam: 8, hL: 5.8, estilo: function (i, k, v) {
      if (k === colsA.length - 1) return /^caiu/.test(v) ? { b: true, cor: VERM } : /^subiu/.test(v) ? { b: true, cor: VERDE } : { cor: CINZA };
      if (k && v !== '-' && parseFloat(v.replace(',', '.')) < 6) return { cor: VERM };
      return null;
    } });
    rodapes(doc, 'Evolução · ' + G.nome + (E.pts.length > MAXC ? ' · últimas ' + MAXC + ' avaliações' : ''));
    return doc;
  }

  // ---------------- 5. painel do curso ----------------
  function gerarPainelCurso(P, notaMin) {
    var doc = novo();
    var y = titulo(doc, 'Painel do curso', P.curso, P.avs + ' avaliações corrigidas  ·  Emitido em ' + new Date().toLocaleDateString('pt-BR'));
    y = kpis(doc, y, [['Avaliações', String(P.avs)], ['Provas corrigidas', String(P.n)], ['Média (0 a 10)', num(P.media, 1), corP(P.media / 10)], ['Nota ' + notaMin + ' ou mais', pct(P.acima), corP(P.acima)]]);
    y = secao(doc, y, 'Por disciplina', 24);
    y = tabela(doc, y, [{ t: 'Disciplina', w: 52 }, { t: 'Aval.', w: 12, al: 'c' }, { t: 'Provas', w: 14, al: 'c' }, { t: 'Média', w: 14, al: 'c' }, { t: 'Nota ' + notaMin + '+', w: 16, al: 'c' }, { t: 'Temas mais fracos', w: CW - 108 }],
      P.disciplinas.map(function (d) { return [d.nome, String(d.avs), String(d.n), num(d.media, 1), pct(d.acima), d.fracos.map(function (f) { return f.nome + ' (' + pct(f.p) + ')'; }).join(', ')]; }),
      { estilo: function (i, k) { var d = P.disciplinas[i]; return k === 3 ? { b: true, cor: corP(d.media / 10) } : k === 4 ? { b: true, cor: corP(d.acima) } : null; } });
    if (P.comps.length) { y = secao(doc, y + 2, 'Competências do curso (% de acerto)', 16); y = barras(doc, y + 1, P.comps); }
    if (P.temas.length) { y = secao(doc, y + 2, 'Temas com menor acerto', 16); y = barras(doc, y + 1, P.temas, { wr: 100 }); }
    paragrafo(doc, y + 2, 'Notas convertidas para a escala de 0 a 10. Reúne as avaliações corrigidas na conta do(a) professor(a).', 8);
    rodapes(doc, 'Painel do curso · ' + P.curso);
    return doc;
  }

  root.PDFANL = { gerarAnaliseProva: gerarAnaliseProva, gerarBoletimAluno: gerarBoletimAluno, gerarEvolucao: gerarEvolucao, gerarPainelCurso: gerarPainelCurso };
})(this);
