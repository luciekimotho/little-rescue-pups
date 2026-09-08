const VERSION = "1.0.0";
const PREFIX = `little-rescue-pups:${self.registration.scope}:`;
const CACHE = `${PREFIX}${VERSION}`;
const ASSETS = [
    "./", "./index.html", "./style.css",
    "./app.mjs", "./art.mjs", "./game.mjs", "./storage.mjs", "./pwa.mjs",
    "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png",
    "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png",
];
const urls = ASSETS.map(path => new URL(path, self.registration.scope).href);

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await cache.addAll(urls.map(url => new Request(url, { cache: "reload" })));
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;
    const url = new URL(event.request.url);
    url.search = "";
    url.hash = "";
    if (!urls.includes(url.href)) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        return await cache.match(url.href) || fetch(event.request);
    })());
});

self.addEventListener("message", event => {
    if (event.data?.type === "ACTIVATE_UPDATE") {
        event.waitUntil(self.skipWaiting());
    } else if (event.data?.type === "OFFLINE_STATUS" && event.ports[0]) {
        event.waitUntil((async () => {
            const cache = await caches.open(CACHE);
            const entries = await Promise.all(urls.map(url => cache.match(url)));
            event.ports[0].postMessage({ ready: entries.every(Boolean), version: VERSION });
        })());
    }
});
