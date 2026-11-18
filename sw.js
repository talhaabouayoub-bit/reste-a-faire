/* Hors réseau : les fichiers de l'app sont gardés sur le téléphone. Changer VERSION à chaque
 * mise en ligne, sinon le téléphone garde l'ancienne version. */
const VERSION = 'raf-v2';
const FICHIERS = ['./', 'index.html', 'style.css', 'app.js', 'regles.js', 'stockage.js', 'document.js',
  'manifest.webmanifest', 'icone-192.png', 'icone-512.png',
  'lib/jspdf.umd.min.js', 'lib/pdf.min.js', 'lib/pdf.worker.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* Réseau d'abord (pour recevoir les mises à jour), le cache si pas de réseau. */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copie = r.clone();
    caches.open(VERSION).then((c) => c.put(e.request, copie));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
