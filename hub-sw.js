// The menu app: keeps the menu page and its icons for offline use. The games have their own
// service workers, so requests for them go straight to the network here.
var CACHE = 'hub-v1';
var FILES = ['./', 'index.html', 'hub.webmanifest', 'poker/icons/icon-192.png', 'poker/icons/icon-512.png', 'poker/icons/icon.svg', 'toepen/icons/icon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); })); }));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return /^hub-/.test(k) && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || e.request.mode !== 'navigate') return;
  var path = new URL(e.request.url).pathname;
  if (!/\/$|\/index\.html$/.test(path) || /\/(poker|toepen)\//.test(path)) return;
  e.respondWith(fetch(e.request).catch(function () { return caches.match('index.html'); }));
});
