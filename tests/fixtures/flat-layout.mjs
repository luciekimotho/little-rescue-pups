import { createServer } from "node:http";
import { createStaticServer } from "../../scripts/dev-server.mjs";

const oldPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Previous flat-layout fixture</title></head>
<body><main id="old-app">Previous version</main><button id="approve-update" disabled>Update game</button>
<script type="module">
import { SAVE_KEY } from "./storage.mjs";
window.legacySaveKey = SAVE_KEY;
let approved = false;
navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (approved) location.reload();
});
const registration = await navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" });
const button = document.querySelector("#approve-update");
const updateWaiting = () => { button.disabled = !registration.waiting; };
registration.addEventListener("updatefound", () => {
    registration.installing.addEventListener("statechange", updateWaiting);
});
updateWaiting();
button.addEventListener("click", () => {
    approved = true;
    registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
});
</script></body></html>`;

const oldStorage = 'export const SAVE_KEY = `little-rescue-pups:profiles:v2:${new URL("./", import.meta.url).pathname}`;';

const oldWorker = `
const PREFIX = \`little-rescue-pups:\${self.registration.scope}:\`;
const CACHE = \`\${PREFIX}2.0.0\`;
const urls = ["./", "./index.html", "./storage.mjs"].map(path => new URL(path, self.registration.scope).href);
self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls.map(url => new Request(url, { cache: "reload" })))));
});
self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;
    const url = new URL(event.request.url);
    url.search = "";
    url.hash = "";
    if (urls.includes(url.href)) {
        event.respondWith(caches.open(CACHE).then(async cache => await cache.match(url.href) || fetch(event.request)));
    }
});
self.addEventListener("message", event => {
    if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});`;

export function createFlatUpgradeServer(basePath) {
    let published = false;
    const current = createStaticServer({ basePath });
    const serveCurrent = current.listeners("request")[0];
    const server = createServer((request, response) => {
        const path = new URL(request.url, "http://localhost").pathname;
        const file = path.startsWith(basePath) ? path.slice(basePath.length) : null;
        const asset = {
            "": [oldPage, "text/html"],
            "index.html": [oldPage, "text/html"],
            "storage.mjs": [oldStorage, "text/javascript"],
            "sw.js": [oldWorker, "text/javascript"],
        }[file];
        if (!published && asset) {
            response.writeHead(200, { "Content-Type": asset[1], "Cache-Control": "no-store" });
            response.end(asset[0]);
        } else {
            serveCurrent(request, response);
        }
    });
    return { server, publish: () => { published = true; } };
}
