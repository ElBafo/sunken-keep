/* Network-first HTML so Home Screen / Safari never keep the old classic bundle at /. */
const SCOPE_PREFIX = self.location.pathname.replace(/sw\.js$/, '');

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isDocumentRequest(request) {
  if (request.mode === 'navigate') return true;
  if (request.destination === 'document') return true;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith(SCOPE_PREFIX)) return false;
  const path = url.pathname.slice(SCOPE_PREFIX.length);
  return path === '' || path === 'index.html' || path.endsWith('.html');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!isDocumentRequest(event.request)) return;
  event.respondWith(fetch(event.request, { cache: 'reload' }));
});
