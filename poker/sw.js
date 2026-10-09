// Offline support: app files are cached on install; Google Fonts are cached the first time they load.
// Network first so updates arrive; the cache is the fallback when offline.
var CACHE = 'poker-v1';   // own prefix: the other apps on this site use other prefixes and must not clean up after each other
var FILES = [
  './', 'index.html', 'handleiding.html', 'styles.css', 'manifest.webmanifest',
  'engine.js', 'ai.js', 'art.js', 'money.js', 'table.js', 'online.js', 'prefs.js', 'sfx.js',
  'ring.js', 'net.js', 'peer.js', 'app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/qrcode.js', 'vendor/jsqr.js', 'vendor/peerjs.min.js'
];
var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return /^poker-/.test(k) && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url), own = url.origin === self.location.origin;
  if (!own && FONT_HOSTS.indexOf(url.hostname) < 0) return;
  e.respondWith(
    (own ? fetch(url.href, { cache: 'no-cache' }) : fetch(e.request)).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true });
    })
  );
});
