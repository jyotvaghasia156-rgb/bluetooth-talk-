// BlueTalk Pro Service Worker for Offline & Mobile PWA caching
const CACHE_NAME = 'bluetalk-v2';
const ASSETS = [
    './index.html',
    './css/style.css',
    './sounds/sfx.js',
    './js/audio.js',
    './js/bluetooth.js',
    './js/rooms.js',
    './js/peer.js',
    './js/morse.js',
    './js/qrcode.js',
    './js/auth.js',
    './js/ui.js',
    './js/app.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResp) => {
                const clone = networkResp.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
                return networkResp;
            })
            .catch(() => caches.match(event.request))
    );
});
