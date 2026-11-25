/* SimulaPro — service worker
 * Deixa o app abrir sem internet (por exemplo, para corrigir numa sala sem sinal).
 * - Arquivos do app: sempre busca a versão nova na rede; sem rede, usa a cópia salva.
 * - A API (api/) nunca é guardada: os dados vão e voltam direto do servidor.
 * Ao mudar este arquivo, aumente VERSAO.
 */
const VERSAO = 'simulapro-v10';
const ESSENCIAIS = ['./', './index.html', './apresentacao.html', './app.js', './conta.js', './ui.js', './turmas.js', './trilhas.js', './omr.js', './pdfgen.js', './analises.js', './pdfanalise.js', './logo.js',
  './lib/jsQR.js', './lib/jspdf.umd.min.js', './lib/qrcode.js', './img/logo_unifadap.png',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSAO).then(c => Promise.all(ESSENCIAIS.map(u => c.add(new Request(u, {cache: 'reload'})).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith('corretor-') || k.startsWith('simulapro-')) && k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', ev => {
  const req = ev.request, url = new URL(req.url);
  if(req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  ev.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    try {
      const r = await fetch(req);
      // Cada página fica guardada no seu endereço (./ é a apresentação; index.html é o app)
      if(r.ok) cache.put(req.mode === 'navigate' ? url.origin + url.pathname : req, r.clone());
      return r;
    } catch(e){
      const c = await cache.match(req, {ignoreSearch: true}) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
      if(c) return c;
      throw e;
    }
  })());
});
