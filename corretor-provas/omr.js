/* Corretor de Provas – núcleo de leitura óptica (OMR1).
   Funciona no navegador (window.OMR) e no Node (module.exports). Depende de jsQR. */
(function (root) {
  'use strict';
  var jsQR = (typeof module !== 'undefined' && module.exports) ? require('jsqr') : root.jsQR;

  // ---------- álgebra ----------
  function solve(A, b) {
    var n = b.length, M = A.map(function (r, i) { return r.concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var p = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      var t = M[c]; M[c] = M[p]; M[p] = t;
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (r = 0; r < n; r++) {
        if (r === c) continue;
        var f = M[r][c] / M[c][c];
        for (var k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map(function (r, i) { return r[n] / r[i]; });
  }
  // homografia que leva src[i] -> dst[i] (4 pontos)
  function homografia(src, dst) {
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i][0], y = src[i][1], u = dst[i][0], v = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    var h = solve(A, b);
    return h ? h.concat([1]) : null;
  }
  function aplicar(H, x, y) {
    var w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
  }

  // ---------- imagem ----------
  function cinza(img) {
    var n = img.width * img.height, g = new Uint8ClampedArray(n), d = img.data;
    for (var i = 0, j = 0; i < n; i++, j += 4) g[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
    return g;
  }
  function amostra(g, w, h, x, y) {
    if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 255;
    var x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return g[i] * (1 - fx) * (1 - fy) + g[i + 1] * fx * (1 - fy) + g[i + w] * (1 - fx) * fy + g[i + w + 1] * fx * fy;
  }

  // procura um quadrado escuro e cheio perto de (px,py)
  function acharMarcador(g, w, h, px, py, raio, ladoPx) {
    var x0 = Math.max(0, Math.round(px - raio)), x1 = Math.min(w - 1, Math.round(px + raio));
    var y0 = Math.max(0, Math.round(py - raio)), y1 = Math.min(h - 1, Math.round(py + raio));
    if (x1 <= x0 || y1 <= y0) return null;
    var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    // limiar local: Otsu na janela
    var hist = new Array(256).fill(0), tot = bw * bh;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) hist[g[y * w + x] | 0]++;
    var soma = 0; for (var k = 0; k < 256; k++) soma += k * hist[k];
    var sB = 0, wB = 0, melhor = 0, lim = 100;
    for (k = 0; k < 256; k++) {
      wB += hist[k]; if (!wB) continue; var wF = tot - wB; if (!wF) break;
      sB += k * hist[k]; var mB = sB / wB, mF = (soma - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > melhor) { melhor = v; lim = k; }
    }
    var mask = new Uint8Array(bw * bh);
    for (y = 0; y < bh; y++) for (x = 0; x < bw; x++) mask[y * bw + x] = g[(y + y0) * w + x + x0] <= lim ? 1 : 0;
    var vis = new Uint8Array(bw * bh), fila = new Int32Array(bw * bh), best = null, alvo = ladoPx * ladoPx;
    for (var s = 0; s < bw * bh; s++) {
      if (!mask[s] || vis[s]) continue;
      var ini = 0, fim = 0; fila[fim++] = s; vis[s] = 1;
      var area = 0, sx = 0, sy = 0, mnx = 1e9, mxx = -1, mny = 1e9, mxy = -1, sg = 0;
      while (ini < fim) {
        var q = fila[ini++], qx = q % bw, qy = (q / bw) | 0;
        area++; sx += qx; sy += qy; sg += g[(qy + y0) * w + qx + x0];
        if (qx < mnx) mnx = qx; if (qx > mxx) mxx = qx; if (qy < mny) mny = qy; if (qy > mxy) mxy = qy;
        var viz = [q - 1, q + 1, q - bw, q + bw];
        for (var t = 0; t < 4; t++) {
          var z = viz[t];
          if (z < 0 || z >= bw * bh) continue;
          if ((t === 0 && qx === 0) || (t === 1 && qx === bw - 1)) continue;
          if (mask[z] && !vis[z]) { vis[z] = 1; fila[fim++] = z; }
        }
      }
      if (area < alvo * 0.35 || area > alvo * 3) continue;
      var ww = mxx - mnx + 1, hh = mxy - mny + 1, fill = area / (ww * hh), asp = ww / hh;
      if (fill < 0.6 || asp < 0.5 || asp > 2) continue;
      var cx = sx / area + x0, cy = sy / area + y0, dist = Math.hypot(cx - px, cy - py);
      if (!best || dist < best.dist) best = { x: cx, y: cy, dist: dist, escuro: sg / area };
    }
    return best;
  }


  // todos os quadrados escuros e cheios do tamanho esperado (limiar adaptativo pela imagem integral)
  function candidatosMarcador(g, w, h, esc, ladoMM) {
    var I = new Float64Array((w + 1) * (h + 1));
    for (var y = 0; y < h; y++) { var lin = 0; for (var x = 0; x < w; x++) { lin += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + lin; } }
    var R = Math.max(8, Math.round(20 * esc)), mask = new Uint8Array(w * h);
    for (y = 0; y < h; y++) {
      var ya = Math.max(0, y - R), yb = Math.min(h, y + R + 1);
      for (x = 0; x < w; x++) {
        var xa = Math.max(0, x - R), xb = Math.min(w, x + R + 1);
        var soma = I[yb * (w + 1) + xb] - I[ya * (w + 1) + xb] - I[yb * (w + 1) + xa] + I[ya * (w + 1) + xa];
        var media = soma / ((yb - ya) * (xb - xa)), v = g[y * w + x];
        mask[y * w + x] = (v < media * 0.62 && v < 150) ? 1 : 0;
      }
    }
    var alvo = Math.pow(ladoMM * esc, 2), vis = new Uint8Array(w * h), fila = new Int32Array(w * h), out = [];
    for (var s = 0; s < w * h; s++) {
      if (!mask[s] || vis[s]) continue;
      var ini = 0, fim = 0; fila[fim++] = s; vis[s] = 1;
      var area = 0, sx = 0, sy = 0, mnx = 1e9, mxx = -1, mny = 1e9, mxy = -1, sg = 0;
      while (ini < fim) {
        var q = fila[ini++], qx = q % w, qy = (q / w) | 0;
        area++; sx += qx; sy += qy; sg += g[q];
        if (qx < mnx) mnx = qx; if (qx > mxx) mxx = qx; if (qy < mny) mny = qy; if (qy > mxy) mxy = qy;
        if (qx > 0 && mask[q - 1] && !vis[q - 1]) { vis[q - 1] = 1; fila[fim++] = q - 1; }
        if (qx < w - 1 && mask[q + 1] && !vis[q + 1]) { vis[q + 1] = 1; fila[fim++] = q + 1; }
        if (qy > 0 && mask[q - w] && !vis[q - w]) { vis[q - w] = 1; fila[fim++] = q - w; }
        if (qy < h - 1 && mask[q + w] && !vis[q + w]) { vis[q + w] = 1; fila[fim++] = q + w; }
      }
      if (area < alvo * 0.18 || area > alvo * 4) continue;
      // forma independente de rotação: momento de inércia normalizado e distância máxima ao centro
      var cx = sx / area, cy = sy / area, mom = 0, dmax = 0;
      for (var t = 0; t < fim; t++) {
        var pz = fila[t], dx = (pz % w) - cx, dy = ((pz / w) | 0) - cy, d2 = dx * dx + dy * dy;
        mom += d2; if (d2 > dmax) dmax = d2;
      }
      var mnorm = mom / (area * area), canto = Math.sqrt(dmax / area);
      if (mnorm > 0.215 || canto < 0.63 || canto > 0.95) continue;
      out.push({ x: cx, y: cy, escuro: sg / area, area: area });
    }
    return out;
  }


  function reduzir(img, f) {
    var w = Math.round(img.width * f), h = Math.round(img.height * f), d = new Uint8ClampedArray(w * h * 4), s = img.data;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var sx = Math.min(img.width - 1, Math.round(x / f)), sy = Math.min(img.height - 1, Math.round(y / f)), i = (sy * img.width + sx) * 4, j = (y * w + x) * 4;
      d[j] = s[i]; d[j + 1] = s[i + 1]; d[j + 2] = s[i + 2]; d[j + 3] = 255;
    }
    return { data: d, width: w, height: h };
  }
  function lerQR(img, op) {
    var modo = { inversionAttempts: op.inverter ? 'attemptBoth' : 'dontInvert' };
    var escalas = op.escalasQR || [1, 0.6, 0.4];
    for (var k = 0; k < escalas.length; k++) {
      var f = escalas[k], im = f === 1 ? img : reduzir(img, f);
      var c = jsQR(im.data, im.width, im.height, modo);
      if (c) {
        if (f !== 1) {
          ['topLeftCorner', 'topRightCorner', 'bottomRightCorner', 'bottomLeftCorner'].forEach(function (nm) {
            c.location[nm] = { x: c.location[nm].x / f, y: c.location[nm].y / f };
          });
        }
        return c;
      }
    }
    return null;
  }

  function lerTexto(t, versao) {
    var p = (t || '').split('|');
    if (p.length < 4 || p[0] !== versao) return null;
    return { texto: t, prova: p[1], codigo: p[2], n: parseInt(p[3], 10) };
  }

  /* img: {data (RGBA), width, height}. Retorna {ok, erro?, qr, respostas, debug} */
  function analisar(img, L, op) {
    op = op || {};
    var w = img.width, h = img.height;
    var code = lerQR(img, op);
    if (!code) return { ok: false, erro: 'qr' };
    var qr = lerTexto(code.data, L.versao);
    if (!qr) return { ok: false, erro: 'qr-formato', texto: code.data };
    var g = cinza(img);
    var Q = L.qr, loc = code.location;
    var H0 = homografia(
      [[Q.x, Q.y], [Q.x + Q.lado, Q.y], [Q.x + Q.lado, Q.y + Q.lado], [Q.x, Q.y + Q.lado]],
      [[loc.topLeftCorner.x, loc.topLeftCorner.y], [loc.topRightCorner.x, loc.topRightCorner.y],
       [loc.bottomRightCorner.x, loc.bottomRightCorner.y], [loc.bottomLeftCorner.x, loc.bottomLeftCorner.y]]);
    if (!H0) return { ok: false, erro: 'qr', qr: qr };
    var esc = Math.hypot(loc.topRightCorner.x - loc.topLeftCorner.x, loc.topRightCorner.y - loc.topLeftCorner.y) / Q.lado;
    var cantosMM = [[0, 0], [L.largura, 0], [L.largura, L.altura], [0, L.altura]];
    var cand = candidatosMarcador(g, w, h, esc, L.marcador);
    var achados = [], usados = {};
    for (var i = 0; i < 4; i++) {
      var pr = aplicar(H0, cantosMM[i][0], cantosMM[i][1]), best = -1, bd = 1e18;
      for (var c = 0; c < cand.length; c++) {
        if (usados[c]) continue;
        var d = Math.hypot(cand[c].x - pr[0], cand[c].y - pr[1]);
        if (d < bd) { bd = d; best = c; }
      }
      if (best < 0 || bd > 90 * esc) return { ok: false, erro: 'marcador', qual: i, qr: qr, previsto: pr };
      usados[best] = 1; achados.push(cand[best]);
    }
    var H = homografia(cantosMM, achados.map(function (a) { return [a.x, a.y]; }));
    if (!H) return { ok: false, erro: 'marcador', qr: qr };
    // consistência: o QR deve cair onde o layout diz
    var errQ = 0, cq = [[Q.x, Q.y, loc.topLeftCorner], [Q.x + Q.lado, Q.y, loc.topRightCorner],
                        [Q.x + Q.lado, Q.y + Q.lado, loc.bottomRightCorner], [Q.x, Q.y + Q.lado, loc.bottomLeftCorner]];
    for (var e = 0; e < 4; e++) { var pq = aplicar(H, cq[e][0], cq[e][1]); errQ = Math.max(errQ, Math.hypot(pq[0] - cq[e][2].x, pq[1] - cq[e][2].y)); }
    if (errQ > 5 * esc) return { ok: false, erro: 'marcador', qual: -1, qr: qr, errQ: errQ / esc };
    var preto = (achados[0].escuro + achados[1].escuro + achados[2].escuro + achados[3].escuro) / 4;
    var B = L.bolhas, n = Math.min(qr.n, B.max_questoes), r = B.raio, resp = [], pontos = [];
    var lim = op.limiar || 0.40, limFraco = op.limiarFraco || 0.22;
    for (var q = 0; q < n; q++) {
      var yy = B.y0 + q * B.dy, scores = [];
      for (var j = 0; j < B.letras.length; j++) {
        var xx = B.x0 + j * B.dx;
        // branco local: anel entre a borda da bolha e a vizinha
        var anel = [];
        for (var a = 0; a < 24; a++) {
          var ang = a * Math.PI / 12, pp = aplicar(H, xx + Math.cos(ang) * r * 1.33, yy + Math.sin(ang) * r * 1.33);
          anel.push(amostra(g, w, h, pp[0], pp[1]));
        }
        anel.sort(function (u, v) { return u - v; });
        var branco = anel[Math.floor(anel.length * 0.6)];
        var faixa = Math.max(branco - preto, 40), acum = 0, cont = 0;
        for (var dy = -0.6; dy <= 0.601; dy += 0.15) for (var dx = -0.6; dx <= 0.601; dx += 0.15) {
          if (dx * dx + dy * dy > 0.36) continue;
          var pt = aplicar(H, xx + dx * r, yy + dy * r);
          var v = (branco - amostra(g, w, h, pt[0], pt[1])) / faixa;
          acum += v < 0 ? 0 : v > 1 ? 1 : v; cont++;
        }
        scores.push(acum / cont);
        pontos.push({ q: q, j: j, p: aplicar(H, xx, yy), rp: r * esc });
      }
      var idx = scores.map(function (s, k) { return [s, k]; }).sort(function (u, v) { return v[0] - u[0]; });
      var marcadas = idx.filter(function (e) { return e[0] >= lim; });
      var st, letra = null;
      if (marcadas.length === 1) { st = 'ok'; letra = B.letras[marcadas[0][1]]; }
      else if (marcadas.length > 1) {
        // dupla marcação clara, a não ser que uma seja muito mais escura que a outra (rasura apagada)
        if (idx[0][0] - idx[1][0] > 0.35) { st = 'ok'; letra = B.letras[idx[0][1]]; }
        else { st = 'multipla'; letra = null; }
      }
      else if (idx[0][0] >= limFraco) { st = 'duvida'; letra = B.letras[idx[0][1]]; }
      else st = 'branco';
      resp.push({ letra: letra, status: st, scores: scores.map(function (s) { return Math.round(s * 100) / 100; }) });
    }
    return { ok: true, qr: qr, respostas: resp,
             debug: { cantos: achados.map(function (a) { return [a.x, a.y]; }), bolhas: pontos, escala: esc } };
  }

  var api = { analisar: analisar, homografia: homografia, aplicar: aplicar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OMR = api;
})(this);
