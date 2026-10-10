// Offline werken: de app-bestanden worden bij de eerste keer opgeslagen. Eerst het net (zodat updates komen),
// de opslag is de terugval als je offline bent. Eigen voorvoegsel: de andere apps op deze site ruimen hun eigen caches op.
var CACHE = 'uno-v1';
var FILES = [
  './', 'index.html', 'handleiding.html', 'styles.css', 'manifest.webmanifest',
  'art.js', 'engine.js', 'ai.js', 'cards.js', 'prefs.js', 'sfx.js', 'spel.js', 'app.js',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  // één bestand dat ontbreekt mag de installatie niet stoppen
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); }));
  }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return /^uno-/.test(k) && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(function (res) {
      var kopie = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, kopie); });
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
        return hit || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined);
      });
    })
  );
});
