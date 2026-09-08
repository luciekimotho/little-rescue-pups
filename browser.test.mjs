import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { createStaticServer } from "./dev-server.mjs";

let browser;
before(async () => {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
});
after(async () => { await browser?.close(); });

async function site(t, basePath = "/", options = {}) {
    const server = createStaticServer({ basePath, readAsset: options.readAsset });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const contextOptions = { viewport: { width: 390, height: 844 }, ...options.context };
    const context = options.persistent
        ? await chromium.launchPersistentContext("", { channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", ...contextOptions })
        : await browser.newContext(contextOptions);
    const errors = [];
    const requests = [];
    context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
    context.on("request", request => requests.push(request.url()));
    t.after(async () => {
        await context.close();
        await new Promise(resolve => server.close(resolve));
        assert.deepEqual(errors, [], "No uncaught browser errors");
        assert.deepEqual(requests.filter(url => /^https?:/.test(url) && !url.startsWith(`${origin}/`)), [], "No external app requests");
        assert.ok(!requests.some(url => /\/(state|action)$/.test(url)), "No backend state API requests");
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    if (options.init) await page.addInitScript(options.init);
    const url = `${origin}${basePath}`;
    await page.goto(url);
    return { server, origin, url, context, page };
}

async function saved(page) {
    return page.evaluate(async () => {
        const { SAVE_KEY } = await import("./storage.mjs");
        const raw = localStorage.getItem(SAVE_KEY);
        return raw === null ? null : JSON.parse(raw);
    });
}

async function parents(page) {
    await page.getByRole("button", { name: "Grown-ups", exact: true }).click();
}

async function closeParents(page) {
    await page.getByRole("button", { name: "Close grown-up settings", exact: true }).click();
}

async function offlineReady(page) {
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated");
    await parents(page);
    await page.waitForFunction(() => document.querySelector("#offline-status")?.textContent.startsWith("Ready for offline play"));
    await closeParents(page);
}

async function act(page, action, pause = 720) {
    await page.waitForTimeout(pause);
    await page.locator(`[data-action="${action}"]`).first().click();
    await page.waitForFunction(() => document.querySelector("#app").getAttribute("aria-busy") === "false");
}

async function screenshot(page, name) {
    if (!process.env.PWA_SCREENSHOTS_DIR) return;
    await mkdir(process.env.PWA_SCREENSHOTS_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.PWA_SCREENSHOTS_DIR, `${name}.png`), fullPage: true });
}

for (const base of ["/", "/little-rescue-pups/"]) {
    test(`real service worker, offline startup, play and durable settings at ${base}`, { timeout: 45000 }, async t => {
        const { page, context, url } = await site(t, base, { persistent: true });
        await offlineReady(page);
        const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
        assert.equal(scope, url);
        const cdp = await context.newCDPSession(page);
        const installability = await cdp.send("Page.getInstallabilityErrors");
        assert.deepEqual(installability.installabilityErrors, [], "Chromium accepts the app's installation metadata");
        await parents(page);
        await page.locator('[data-setting="voice"]').uncheck();
        await page.locator('[data-setting="sound"]').uncheck();
        await page.locator('[data-setting="motion"]').uncheck();
        await closeParents(page);
        await act(page, "start");
        await act(page, "help");
        const initial = await saved(page);
        assert.equal(initial.game.step, 1);
        assert.deepEqual(initial.settings, { mode: "tiny", voice: false, sound: false, motion: false });
        await context.setOffline(true);
        assert.equal(await page.evaluate(() => fetch("./network-is-offline").then(() => false, () => true)), true);
        await page.reload();
        await page.locator(".playing").waitFor();
        assert.deepEqual(await saved(page), initial);
        await act(page, "help");
        assert.equal((await saved(page)).game.step, 2);
        await act(page, "help");
        await page.locator(".celebrate").waitFor();
        await act(page, "next", 1450);
        assert.equal((await saved(page)).game.missionIndex, 1);
        const newPage = await context.newPage();
        await newPage.goto(`${url}index.html?offline-start=1`);
        await newPage.locator(".playing").waitFor();
        assert.deepEqual(await saved(newPage), await saved(page));
        assert.equal(await newPage.locator("body").evaluate(body => body.classList.contains("motion-off")), true);
        await parents(newPage);
        assert.equal(await newPage.locator('[data-setting="sound"]').isChecked(), false);
        await newPage.waitForFunction(() => document.querySelector("#offline-status").textContent.startsWith("Ready for offline play"));
    });
}

for (const width of [320, 390, 1024]) {
    test(`welcome pups and matching targets fit at ${width}px`, { timeout: 30000 }, async t => {
        const height = width === 320 ? 568 : 844;
        const { page } = await site(t, "/", { context: { viewport: { width, height }, reducedMotion: "reduce" } });
        await offlineReady(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "No horizontal overflow");
        const visiblePups = await page.evaluate(() => {
            const picture = document.querySelector(".welcome-picture").getBoundingClientRect();
            return ["translate(180 200)", "translate(352 153)", "translate(580 192)"].map(position => {
                const pup = document.querySelector(`.welcome-picture svg > g[transform^="${position}"]`).getBoundingClientRect();
                return { position, fits: pup.left >= picture.left && pup.right <= picture.right && pup.top >= picture.top && pup.bottom <= picture.bottom };
            });
        });
        assert.ok(visiblePups.every(pup => pup.fits), JSON.stringify(visiblePups));
        assert.equal(await page.locator(".nudge").first().evaluate(element => getComputedStyle(element).animationName), "none");
        await screenshot(page, `welcome-${width}`);
        await parents(page);
        await page.locator('[data-mode="find"]').click();
        await page.locator('[data-setting="voice"]').uncheck();
        await closeParents(page);
        await act(page, "start");
        await page.evaluate(() => scrollTo(0, 0));
        const bounds = await page.locator(".choice").evaluateAll(elements => elements.map(element => {
            const box = element.getBoundingClientRect();
            return { x: box.x, right: box.right, y: box.y, bottom: box.bottom, width: box.width, height: box.height };
        }));
        assert.equal(bounds.length, 3);
        assert.ok(bounds.every(box => box.width >= 80 && box.height >= 100 && box.x >= 0 && box.right <= width && box.bottom <= height), JSON.stringify(bounds));
        assert.equal(await page.locator(".target-preview").isVisible(), true);
        await screenshot(page, `matching-${width}`);
        const before = await saved(page);
        await page.waitForTimeout(720);
        await page.locator('[data-tool="carrot"]').click();
        await page.waitForFunction(() => document.querySelector('[data-tool="bridge"]').classList.contains("hint"));
        assert.deepEqual(await saved(page), before);
        assert.equal(await page.locator('[data-tool="bridge"]').evaluate(button => button.classList.contains("hint")), true);
        await page.locator('[data-tool="bridge"]').click();
        assert.equal((await saved(page)).game.step, 1);
    });
}

test("tiny keyboard safeguards, tap throttling and all three rescues end in rest", { timeout: 45000 }, async t => {
    const { page } = await site(t);
    await offlineReady(page);
    await parents(page);
    await page.locator('[data-setting="voice"]').uncheck();
    await closeParents(page);
    await page.waitForTimeout(400);
    await page.locator("main .intro").click();
    assert.equal((await saved(page)).game.phase, "playing");
    await page.locator(".world").click();
    assert.equal((await saved(page)).game.step, 0, "Immediate second tap is ignored");
    await page.waitForTimeout(720);
    await page.evaluate(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", repeat: true, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", altKey: true, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true }));
    });
    assert.equal((await saved(page)).game.step, 0);
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector(".step-dot.filled"));
    assert.equal((await saved(page)).game.step, 1);
    for (let mission = 0; mission < 3; mission++) {
        for (let step = mission === 0 ? 1 : 0; step < 3; step++) await act(page, "help");
        await page.locator(".celebrate").waitFor();
        await act(page, "next", 1450);
    }
    await page.locator(".rest").waitFor();
    const resting = await saved(page);
    await act(page, "goodbye");
    assert.deepEqual(await saved(page), resting);
    assert.equal(await page.locator('[data-action="start"]').count(), 0);
    await parents(page);
    await page.locator('[data-action="again"]').click();
    assert.equal((await saved(page)).game.round, 1);
    assert.equal((await saved(page)).game.phase, "playing");
});

test("cross-tab actions serialize and refresh open parent settings", { timeout: 30000 }, async t => {
    const { page, context, url } = await site(t);
    await offlineReady(page);
    await act(page, "start");
    const second = await context.newPage();
    await second.goto(url);
    await second.locator(".playing").waitFor();
    await parents(second);
    await page.evaluate(async () => (await import("./storage.mjs")).createStore().dispatch({ type: "settings", settings: { mode: "find", motion: false } }));
    await second.waitForFunction(() => document.querySelector('[data-mode="find"]').getAttribute("aria-pressed") === "true");
    const [firstResult, secondResult] = await Promise.all([
        page.evaluate(async () => (await import("./storage.mjs")).createStore().dispatch({ type: "help", tool: "bridge" })),
        second.evaluate(async () => (await import("./storage.mjs")).createStore().dispatch({ type: "help", tool: "bridge" })),
    ]);
    assert.deepEqual([firstResult.state.game.step, secondResult.state.game.step].sort(), [1, 2]);
    assert.equal((await saved(second)).game.step, 2);
    assert.equal(await second.locator('[data-setting="motion"]').isChecked(), false);
    await page.evaluate(async () => {
        const store = (await import("./storage.mjs")).createStore();
        for (let mission = 0; mission < 3; mission++) {
            const state = store.load();
            const { currentMission } = await import("./game.mjs");
            for (let step = state.game.step; step < 3; step++) await store.dispatch({ type: "help", tool: currentMission(state).tool });
            await store.dispatch({ type: "next" });
        }
    });
    await second.locator('[data-action="again"]').waitFor();
});

test("bad saves survive reload until a grown-up confirms a reset", { timeout: 20000 }, async t => {
    const { page } = await site(t, "/", {
        init: () => localStorage.setItem("little-rescue-pups:save:/", "{broken"),
    });
    await page.getByText("This device's save could not be read.", { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("little-rescue-pups:save:/")), "{broken");
    assert.equal(await page.locator(".welcome").count(), 0);
    await page.getByRole("button", { name: "Try again" }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem("little-rescue-pups:save:/")), "{broken");
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Reset this device's save" }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem("little-rescue-pups:save:/")), "{broken");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Reset this device's save" }).click();
    await page.locator(".welcome").waitFor();
    assert.equal((await saved(page)).game.phase, "welcome");
});

test("storage write errors keep progress and settings unchanged and visible to adults", { timeout: 20000 }, async t => {
    const { page } = await site(t, "/", {
        init: () => {
            Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
        },
    });
    await act(page, "start");
    await page.locator("#notice").getByText("This change was not saved.", { exact: false }).waitFor();
    assert.equal(await page.locator(".welcome").count(), 1);
    assert.equal(await saved(page), null);
    await parents(page);
    await page.locator('[data-setting="motion"]').click();
    await page.waitForFunction(() => document.querySelector("#app").getAttribute("aria-busy") === "false");
    assert.equal(await page.locator('[data-setting="motion"]').isChecked(), true);
    assert.equal(await page.locator("#parent-notice").isVisible(), true);
    assert.match(await page.locator("#parent-notice").textContent(), /not saved/);
});

test("blocked storage gives a retry screen, not a false fresh save", { timeout: 20000 }, async t => {
    const { page } = await site(t, "/", {
        init: () => Object.defineProperty(window, "localStorage", {
            get() { throw new DOMException("Blocked", "SecurityError"); },
        }),
    });
    await page.getByRole("button", { name: "Try again" }).waitFor();
    assert.match(await page.locator("#notice").textContent(), /Browser storage is unavailable/);
    assert.equal(await page.locator(".welcome").count(), 0);
});

test("an incomplete real precache never reports offline readiness and can retry online", { timeout: 30000 }, async t => {
    let missing = true;
    const { page } = await site(t, "/little-rescue-pups/", {
        readAsset: async url => {
            if (missing && url.pathname.endsWith("/icons/icon-512.png")) {
                throw Object.assign(new Error("Test missing asset"), { code: "ENOENT" });
            }
            return readFile(url);
        },
    });
    await parents(page);
    await page.waitForFunction(() => /did not finish|setup failed/.test(document.querySelector("#offline-status").textContent));
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null);
    assert.doesNotMatch(await page.locator("#offline-status").textContent(), /^Ready/);
    missing = false;
    await page.reload();
    await offlineReady(page);
});

test("a real update waits for a grown-up, preserves saves and cleans only its own old caches", { timeout: 40000 }, async t => {
    let version = "1.0.0";
    const { page, context, url } = await site(t, "/little-rescue-pups/", {
        readAsset: async url => {
            const body = await readFile(url);
            return url.pathname.endsWith("/sw.js") ? body.toString().replace('VERSION = "1.0.0"', `VERSION = "${version}"`) : body;
        },
    });
    await offlineReady(page);
    await act(page, "start");
    await act(page, "help");
    const before = await saved(page);
    const second = await context.newPage();
    await second.goto(url);
    await second.locator(".playing").waitFor();
    await second.evaluate(() => { window.keepThisTabOpen = true; });
    const unrelated = ["another-app:v1", `little-rescue-pups:${new URL("../", url).href}:1.0.0`];
    await page.evaluate(async names => { for (const name of names) await caches.open(name); }, unrelated);
    version = "1.0.1";
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting));
    await page.waitForTimeout(300);
    assert.deepEqual(await saved(page), before);
    await parents(page);
    await page.locator('[data-action="update"]').waitFor({ state: "visible" });
    const navigation = page.waitForEvent("load");
    await page.locator('[data-action="update"]').click();
    await navigation;
    await page.locator(".playing").waitFor();
    assert.deepEqual(await saved(page), before);
    assert.equal(await second.evaluate(() => window.keepThisTabOpen), true, "Other tabs are not reloaded");
    const cacheNames = await page.evaluate(() => caches.keys());
    assert.ok(cacheNames.includes(`little-rescue-pups:${url}:1.0.1`));
    assert.ok(!cacheNames.includes(`little-rescue-pups:${url}:1.0.0`));
    assert.ok(unrelated.every(name => cacheNames.includes(name)));
    await context.setOffline(true);
    await page.reload();
    await page.locator(".playing").waitFor();
    assert.deepEqual(await saved(page), before);
});

test("maskable artwork stays in the safe circle and voice prompts never select network voices", { timeout: 20000 }, async t => {
    const { page } = await site(t, "/", {
        init: () => {
            window.spokenVoices = [];
            const remote = { name: "Remote English", localService: false, lang: "en-GB" };
            const local = { name: "Local English", localService: true, lang: "en-US" };
            Object.defineProperty(window, "SpeechSynthesisUtterance", { value: class { constructor(text) { this.text = text; } } });
            Object.defineProperty(window, "speechSynthesis", { value: {
                getVoices: () => [remote, local],
                addEventListener() {},
                cancel() {},
                speak(utterance) { window.spokenVoices.push(utterance.voice.name); },
            } });
        },
    });
    await offlineReady(page);
    const outsideSafeCircle = await page.evaluate(async () => {
        const image = new Image();
        image.src = "./icons/maskable-512.png";
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const { data } = ctx.getImageData(0, 0, 512, 512);
        let outside = 0;
        for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
            const i = (y * 512 + x) * 4;
            if (Math.hypot(x - 256, y - 256) > 204.8 && (data[i] !== 244 || data[i + 1] !== 250 || data[i + 2] !== 255 || data[i + 3] !== 255)) outside++;
        }
        return outside;
    });
    assert.equal(outsideSafeCircle, 0);
    await act(page, "start");
    const voices = await page.evaluate(() => window.spokenVoices);
    assert.ok(voices.length > 0);
    assert.ok(voices.every(name => name === "Local English"));
});

test("no local English voice leaves honest parent guidance and picture play", { timeout: 20000 }, async t => {
    const { page } = await site(t, "/", {
        init: () => Object.defineProperty(window, "speechSynthesis", { value: {
            getVoices: () => [{ name: "Remote English", lang: "en-US", localService: false }],
            addEventListener() {},
            cancel() {},
            speak() { throw new Error("Must not use a network voice"); },
        } }),
    });
    await parents(page);
    assert.match(await page.locator("#voice-status").textContent(), /No local English voice/);
    assert.match(await page.locator("#install-status").textContent(), /iPhone or iPad.*Android.*Desktop/);
    await closeParents(page);
    await act(page, "start");
    await act(page, "help");
    assert.equal((await saved(page)).game.step, 1);
});

test("an unsupported installation environment offers guidance without a broken install button", { timeout: 20000 }, async t => {
    const { page } = await site(t, "/", {
        init: () => Object.defineProperty(window, "isSecureContext", { value: false }),
    });
    await parents(page);
    assert.match(await page.locator("#offline-status").textContent(), /Offline installation is unavailable.*HTTPS/);
    assert.equal(await page.locator('[data-action="install"]').isVisible(), false);
    assert.match(await page.locator("#install-status").textContent(), /Safari.*Add to Home Screen/);
});
