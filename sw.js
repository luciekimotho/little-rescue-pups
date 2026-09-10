const VERSION = "2.1.0";
const PREFIX = `little-rescue-pups:${self.registration.scope}:`;
const CACHE = `${PREFIX}${VERSION}`;
const ASSETS = [
    "./", "./index.html", "./manifest.webmanifest",
    "./src/app.mjs", "./src/paths.mjs",
    "./src/components/app-header.mjs", "./src/components/app-footer.mjs",
    "./src/components/profile-button.mjs", "./src/components/tool-tray.mjs",
    "./src/components/rescue-progress.mjs", "./src/components/parents-dialog.mjs",
    "./src/screens/chooser-screen.mjs", "./src/screens/mission-screen.mjs",
    "./src/screens/rest-screen.mjs", "./src/screens/render-screen.mjs",
    "./src/game/game.mjs", "./src/game/missions.mjs", "./src/game/profiles.mjs",
    "./src/services/storage.mjs", "./src/services/narration.mjs",
    "./src/services/sound.mjs", "./src/services/pwa.mjs",
    "./src/interactions/placement.mjs", "./src/artwork/art.mjs",
    "./src/styles/base.css", "./src/styles/game.css", "./src/styles/parents.css", "./src/styles/placement.css",
    "./assets/icons/icon.svg", "./assets/icons/icon-192.png", "./assets/icons/icon-512.png",
    "./assets/icons/maskable-512.png", "./assets/icons/apple-touch-icon.png",
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
