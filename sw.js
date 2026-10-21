// Keepframe service worker: offline app shell + Android share target.
'use strict';
const VERSION = 'keepframe-0134660b0ef3';
const SHARE = 'keepframe-share';
const SHELL = ["./","index.html","manifest.webmanifest","archivo.woff2","martian-mono-400.woff2","martian-mono-500.woff2","icon-192.png","icon-512.png","icon-maskable-512.png","apple-touch-icon.png","favicon.png"];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== SHARE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) { event.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') { event.respondWith(appShell(event)); return; }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});

// Open instantly from cache, refresh the cached page in the background.
async function appShell(event) {
  const cache = await caches.open(VERSION);
  const cached = (await cache.match('index.html')) || (await cache.match('./'));
  const network = fetch(event.request)
    .then((res) => { if (res && res.ok) cache.put('index.html', res.clone()); return res; })
    .catch(() => null);
  if (cached) { event.waitUntil(network); return cached; }
  return (await network) || new Response('Keepframe is offline and not cached yet. Connect once to install it.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// Videos shared from other apps arrive here as a form post. Park them in Cache Storage and open the app.
async function receiveShare(req) {
  const scope = self.registration.scope;
  try {
    const form = await req.formData();
    const files = form.getAll('video').filter((f) => f && typeof f === 'object' && 'size' in f);
    const cache = await caches.open(SHARE);
    for (const key of await cache.keys()) await cache.delete(key);
    const stamp = String(Date.now());
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      await cache.put(
        new Request(new URL('__shared/' + stamp + '/' + i, scope).href),
        new Response(f, { headers: { 'Content-Type': f.type || 'video/mp4', 'X-Name': encodeURIComponent(f.name || 'video-' + (i + 1) + '.mp4') } })
      );
    }
    return Response.redirect(new URL(files.length ? './?share=' + stamp : './?share=error', scope).href, 303);
  } catch (e) {
    return Response.redirect(new URL('./?share=error', scope).href, 303);
  }
}
