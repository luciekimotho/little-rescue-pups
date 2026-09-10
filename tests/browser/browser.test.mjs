import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium } from "playwright";
import { createStaticServer } from "../../scripts/dev-server.mjs";
import { DEFAULT_STATE, validState } from "../../src/game/profiles.mjs";
import { actionContext, currentMission, transition } from "../../src/game/game.mjs";
import { createFlatUpgradeServer } from "../fixtures/flat-layout.mjs";

let browser;
before(async () => {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
});
after(async () => { await browser?.close(); });

async function site(t, basePath = "/", options = {}) {
    const server = options.server ?? createStaticServer({ basePath, readAsset: options.readAsset });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const contextOptions = { viewport: { width: 390, height: 844 }, ...options.context };
    const profileDirectory = options.persistent ? join(process.cwd(), `.browser-profile-${randomUUID()}`) : null;
    let context;
    const errors = [];
    const requests = [];
    t.after(async () => {
        try {
            await context?.close();
        } finally {
            await new Promise(resolve => server.close(resolve));
            if (profileDirectory) await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5 });
        }
        assert.deepEqual(errors, [], "No uncaught browser errors");
        assert.deepEqual(requests.filter(url => /^https?:/.test(url) && !url.startsWith(`${origin}/`)), [], "No external app requests");
        assert.ok(!requests.some(url => /\/(state|action)$/.test(url)), "No backend state API requests");
    });
    context = options.persistent
        ? await chromium.launchPersistentContext(profileDirectory, { channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", ...contextOptions })
        : await browser.newContext(contextOptions);
    context.on("page", page => {
        page.setDefaultTimeout(10000);
        page.on("pageerror", error => errors.push(error.message));
    });
    context.on("request", request => requests.push(request.url()));
    const page = await context.newPage();
    if (options.init) await page.addInitScript(options.init);
    const url = `${origin}${basePath}`;
    await page.goto(url);
    return { server, origin, url, context, page };
}

async function saved(page) {
    return page.evaluate(async () => {
        const { SAVE_KEY } = await import("./src/services/storage.mjs");
        const raw = localStorage.getItem(SAVE_KEY);
        return raw === null ? null : JSON.parse(raw);
    });
}

async function loaded(page) {
    return page.evaluate(async () => (await import("./src/services/storage.mjs")).createStore().load());
}

async function idle(page) {
    await page.waitForFunction(() => document.querySelector("#app").getAttribute("aria-busy") === "false");
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
    await idle(page);
}

async function choosePlayer(page, profileId, key) {
    await page.waitForTimeout(720);
    const button = page.locator(`[data-action="profile"][data-profile="${profileId}"]`);
    if (key) {
        await button.focus();
        await page.keyboard.press(key);
    } else await button.click();
    await idle(page);
}

async function home(page) {
    await page.getByRole("button", { name: "Choose player", exact: true }).first().click();
    await page.locator(".welcome").waitFor();
}

async function carrot(page, assisted = true, key) {
    await page.waitForTimeout(720);
    const source = page.locator('[data-placement-tool="carrot"]');
    if (key) {
        await source.focus();
        await page.keyboard.press(key);
    } else await source.click();
    if (!assisted) {
        assert.equal(await source.getAttribute("aria-pressed"), "true");
        const target = page.locator('[data-drop-target="bowl"]');
        if (key) {
            await target.focus();
            await page.keyboard.press(key);
        } else await target.click();
    }
    await idle(page);
}

async function center(locator) {
    const box = await locator.boundingBox();
    assert.ok(box, "Gesture control has a visible bounding box");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragStart(page, tool = "carrot") {
    await page.waitForTimeout(720);
    const source = await center(page.locator(`[data-placement-tool="${tool}"]`));
    const target = await center(page.locator('[data-drop-target="bowl"]'));
    await page.mouse.move(source.x, source.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.locator(".placement-ghost").waitFor();
    return { source, target };
}

async function screenshot(page, name) {
    if (!process.env.PWA_SCREENSHOTS_DIR) return;
    await mkdir(process.env.PWA_SCREENSHOTS_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.PWA_SCREENSHOTS_DIR, `${name}.png`), fullPage: true });
}

for (const base of ["/", "/little-rescue-pups/"]) {
    test(`real service worker, installability and independent offline profile resume at ${base}`, { timeout: 50000 }, async t => {
        const { page, context, url } = await site(t, base, { persistent: true });
        await offlineReady(page);
        assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope), url);
        const identity = await page.evaluate(async () => {
            const { APP_BASE_URL } = await import("./src/paths.mjs");
            const { SAVE_KEY } = await import("./src/services/storage.mjs");
            const manifest = await (await fetch("./manifest.webmanifest")).json();
            const registrations = await navigator.serviceWorker.getRegistrations();
            return {
                appBase: APP_BASE_URL.href, saveKey: SAVE_KEY,
                scopes: registrations.map(registration => registration.scope),
                worker: navigator.serviceWorker.controller.scriptURL,
                manifest: [manifest.id, manifest.start_url, manifest.scope],
            };
        });
        assert.equal(identity.appBase, url);
        assert.equal(identity.saveKey, `little-rescue-pups:profiles:v2:${base}`);
        assert.deepEqual(identity.scopes, [url], "Nested services never register a second worker scope");
        assert.equal(identity.worker, `${url}sw.js`);
        assert.deepEqual(identity.manifest, ["./", "./", "./"]);
        const cdp = await context.newCDPSession(page);
        assert.deepEqual((await cdp.send("Page.getInstallabilityErrors")).installabilityErrors, [], "Chromium accepts installation metadata outside incognito");
        await choosePlayer(page, "eden");
        await parents(page);
        for (const setting of ["voice", "sound", "motion"]) {
            await page.locator(`[data-setting="${setting}"]`).uncheck();
            await idle(page);
        }
        await closeParents(page);
        await carrot(page);
        const initial = await saved(page);
        assert.deepEqual(initial.profiles.eden.game.completedSteps, ["first-carrot"]);
        assert.deepEqual(initial.profiles.eden.settings, { mode: "tiny", voice: false, sound: false, motion: false });
        assert.equal(initial.profiles.ethan.revision, 0);
        await context.setOffline(true);
        assert.equal(await page.evaluate(() => fetch("./network-is-offline").then(() => false, () => true)), true);
        await page.reload();
        await page.locator(".welcome").waitFor();
        assert.deepEqual(await saved(page), initial);
        await choosePlayer(page, "eden");
        assert.equal(await page.locator(".step-dot.filled").count(), 1);
        assert.equal(await page.locator("body").evaluate(body => body.classList.contains("motion-off")), true);
        await carrot(page);
        await carrot(page);
        await page.locator(".celebrate").waitFor();
        await act(page, "next", 1450);
        assert.equal((await saved(page)).profiles.eden.game.outing[1].id, "ducks");
        const eden = (await saved(page)).profiles.eden;
        await home(page);
        await choosePlayer(page, "ethan");
        assert.equal(await page.locator(".placement-tool").count(), 3);
        await carrot(page, false);
        assert.deepEqual((await saved(page)).profiles.eden, eden);
        const both = await saved(page);
        const newPage = await context.newPage();
        await newPage.goto(`${url}index.html?offline-start=1`);
        await newPage.locator(".welcome").waitFor();
        assert.deepEqual(await saved(newPage), both);
        await choosePlayer(newPage, "eden");
        assert.match(await newPage.locator(".brand").textContent(), /Eden's rescue/);
        await parents(newPage);
        assert.equal(await newPage.locator('[data-setting="sound"]').isChecked(), false);
        assert.match(await newPage.locator("#profile-history").textContent(), /A snack for bunny: 1/);
        await newPage.waitForFunction(() => document.querySelector("#offline-status").textContent.startsWith("Ready for offline play"));
        await newPage.locator('#parents [data-action="home"]').click();
        await choosePlayer(newPage, "ethan");
        assert.equal(await newPage.locator(".step-dot.filled").count(), 1);
        await newPage.reload();
        await newPage.locator(".welcome").waitFor();
        assert.deepEqual(await saved(newPage), both);
    });
}

for (const [profileId, defaultMode, key] of [["eden", "tiny", "Enter"], ["ethan", "find", "Space"]]) {
    test(`${profileId} starts with ${key} and profile selection never overwrites saved mode or settings`, { timeout: 25000 }, async t => {
        const { page } = await site(t);
        await page.locator(".welcome").waitFor();
        assert.equal(await saved(page), null, "Opening the chooser does not create a save");
        await parents(page);
        assert.equal(await page.locator("[data-setting], [data-mode], #profile-history").count(), 0);
        assert.match(await page.locator("#parents").textContent(), /Old shared saves are not imported/);
        assert.match(await page.locator(".privacy-note").textContent(), /unofficial PAW Patrol fan game/);
        await closeParents(page);
        await choosePlayer(page, profileId, key);
        assert.equal((await saved(page)).profiles[profileId].settings.mode, defaultMode);
        assert.match(await page.locator(".mission-top h1").textContent(), /snack for bunny/);
        const other = profileId === "eden" ? "ethan" : "eden";
        const untouched = (await saved(page)).profiles[other];
        const customMode = defaultMode === "tiny" ? "find" : "tiny";
        await parents(page);
        await page.locator(`[data-mode="${customMode}"]`).click();
        await idle(page);
        for (const setting of ["voice", "sound", "motion"]) {
            await page.locator(`[data-setting="${setting}"]`).uncheck();
            await idle(page);
        }
        await page.locator('#parents [data-action="home"]').click();
        const before = await saved(page);
        assert.deepEqual(before.profiles[other], untouched);
        await choosePlayer(page, profileId);
        assert.deepEqual(await saved(page), before, "Resuming only selects in tab memory");
        assert.equal(await page.locator(".choice").count(), customMode === "find" ? 3 : 0);
        await page.reload();
        await page.locator(".welcome").waitFor();
        await choosePlayer(page, profileId);
        assert.deepEqual((await saved(page)).profiles[profileId].settings, { mode: customMode, voice: false, sound: false, motion: false });
        assert.deepEqual((await saved(page)).profiles[other], untouched);
        await home(page);
        assert.deepEqual(await saved(page), before);
        await parents(page);
        assert.equal(await page.locator("[data-setting], #profile-history").count(), 0);
    });
}

for (const width of [320, 390, 1024]) {
    test(`welcome names, pup art and placement controls fit at ${width}px`, { timeout: 30000 }, async t => {
        const height = width === 320 ? 568 : 844;
        const { page } = await site(t, "/", { context: { viewport: { width, height }, reducedMotion: "reduce" } });
        await page.locator(".welcome").waitFor();
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
        const playerButtons = await page.locator(".player-button").evaluateAll(elements => elements.map(element => {
            const box = element.getBoundingClientRect();
            return { label: element.textContent.trim(), width: box.width, height: box.height, left: box.left, right: box.right, bottom: box.bottom };
        }));
        assert.deepEqual(playerButtons.map(button => button.label), ["EDEN", "ETHAN"]);
        const correctPups = await page.evaluate(async () => {
            const { crewArt } = await import("./src/artwork/art.mjs");
            return [["eden", "skye"], ["ethan", "chase"]].every(([player, pup]) => {
                const expected = document.createElement("template");
                expected.innerHTML = crewArt(pup);
                const button = document.querySelector(`.player-button.${player}`);
                const portrait = button.querySelector(".crew-portrait");
                if (!portrait?.isEqualNode(expected.content.firstElementChild)) return false;
                const image = portrait.getBoundingClientRect();
                const bounds = button.getBoundingClientRect();
                return image.width >= 50 && image.height >= 50 && image.left >= bounds.left &&
                    image.right <= bounds.right && image.top >= bounds.top && image.bottom <= bounds.bottom;
            });
        });
        assert.equal(correctPups, true, "Eden shows Skye and Ethan shows Chase without clipping");
        assert.ok(playerButtons.every(box => box.width >= 120 && box.height >= 100 && box.left >= 0 && box.right <= width), JSON.stringify(playerButtons));
        if (width <= 390) assert.ok(playerButtons.every(box => box.bottom + 6 <= height), "Both name buttons fit without scrolling on phones");
        await screenshot(page, `welcome-${width}`);
        await choosePlayer(page, "ethan");
        await page.evaluate(() => scrollTo(0, 0));
        const bounds = await page.locator(".choice").evaluateAll(elements => elements.map(element => {
            const box = element.getBoundingClientRect();
            return { x: box.x, right: box.right, y: box.y, bottom: box.bottom, width: box.width, height: box.height };
        }));
        assert.equal(bounds.length, 3);
        assert.ok(bounds.every(box => box.width >= 80 && box.height >= 100 && box.x >= 0 && box.right <= width && box.bottom <= height), JSON.stringify(bounds));
        assert.equal(await page.locator(".target-preview").isVisible(), true);
        assert.equal(await page.locator(".placement-scene").getAttribute("viewBox"), "0 0 1000 500");
        const bowlFits = await page.evaluate(() => {
            const scene = document.querySelector(".placement-scene");
            const target = document.querySelector('[data-drop-target="bowl"]').getBoundingClientRect();
            const bounds = scene.getBoundingClientRect();
            const matrix = scene.getScreenCTM();
            const point = new DOMPoint(557.5, 395).matrixTransform(matrix);
            return target.width >= 48 && target.height >= 48 && target.left >= bounds.left &&
                target.right <= bounds.right && target.top >= bounds.top && target.bottom <= bounds.bottom &&
                Math.abs(target.left + target.width / 2 - point.x) < 2 &&
                Math.abs(target.top + target.height / 2 - point.y) < 2;
        });
        assert.equal(bowlFits, true, "The accessible bowl aligns with the SVG bowl and stays within its art");
        await screenshot(page, `matching-${width}`);
        await carrot(page, false);
        assert.equal((await saved(page)).profiles.ethan.game.completedSteps.length, 1);
    });
}

test("matching taps reject distractors, require a bowl and update bunny artwork only on success", { timeout: 25000 }, async t => {
    const { page } = await site(t);
    await choosePlayer(page, "ethan");
    await page.waitForTimeout(720);
    const before = await saved(page);
    const art = await page.locator(".placement-scene").innerHTML();
    await page.locator('[data-drop-target="bowl"]').click();
    assert.match(await page.locator("#encouragement").textContent(), /Choose a picture first/);
    assert.deepEqual(await saved(page), before);
    await page.locator('[data-placement-tool="ladder"]').click();
    assert.equal(await page.locator('[data-placement-tool="ladder"]').getAttribute("aria-pressed"), "true");
    await page.locator('[data-drop-target="bowl"]').click();
    await idle(page);
    assert.deepEqual(await saved(page), before);
    assert.equal(await page.locator(".placement-scene").innerHTML(), art);
    assert.equal(await page.locator('[data-placement-tool="carrot"]').evaluate(button => button.classList.contains("hint")), true);
    await page.locator('[data-placement-tool="carrot"]').click();
    assert.deepEqual(await saved(page), before, "Selecting the carrot alone does not advance matching mode");
    await page.locator('[data-drop-target="bowl"]').click();
    await idle(page);
    assert.equal((await saved(page)).profiles.ethan.game.completedSteps.length, 1);
    assert.notEqual(await page.locator(".placement-scene").innerHTML(), art);
    assert.equal(await page.locator(".placement-ghost").count(), 0);
});

for (const [profileId, assisted, key] of [
    ["eden", true, "Enter"], ["eden", true, "Space"],
    ["ethan", false, "Enter"], ["ethan", false, "Space"],
]) {
    test(`${profileId} placement supports keyboard ${key} without duplicate actions`, { timeout: 20000 }, async t => {
        const { page } = await site(t);
        await choosePlayer(page, profileId, key);
        const before = (await saved(page)).profiles[profileId].revision;
        await carrot(page, assisted, key);
        assert.equal((await saved(page)).profiles[profileId].revision, before + 1);
        assert.deepEqual((await saved(page)).profiles[profileId].game.completedSteps, ["first-carrot"]);
        await page.waitForTimeout(720);
        await page.keyboard.press(key);
        await idle(page);
        assert.equal((await saved(page)).profiles[profileId].game.completedSteps.length, assisted ? 2 : 1);
    });
}

test("normal mouse dragging uses the bowl, rejects outside drops and suppresses synthetic clicks", { timeout: 25000 }, async t => {
    const { page } = await site(t);
    await choosePlayer(page, "ethan");
    const before = await saved(page);
    await dragStart(page, "bucket");
    await page.mouse.up();
    await idle(page);
    assert.deepEqual(await saved(page), before);
    const { target } = await dragStart(page);
    await page.mouse.move(4, 4, { steps: 4 });
    await page.mouse.up();
    assert.deepEqual(await saved(page), before);
    assert.equal(await page.locator(".placement-ghost").count(), 0);
    await dragStart(page);
    assert.equal(await page.locator('[data-drop-target="bowl"]').evaluate(button => button.classList.contains("is-drop-active")), true);
    await page.mouse.up();
    await idle(page);
    const once = await saved(page);
    assert.equal(once.profiles.ethan.revision, before.profiles.ethan.revision + 1);
    assert.equal(once.profiles.ethan.game.completedSteps.length, 1);
    assert.equal(await page.locator(".placement-ghost").count(), 0);
    await page.waitForTimeout(750);
    await page.mouse.click(target.x, target.y);
    assert.deepEqual(await saved(page), once, "A stray bowl click after the completed drag has no selected tool");
});

test("Eden's single large carrot also drags into the bowl on a small phone", { timeout: 15000 }, async t => {
    const { page } = await site(t, "/", { context: { viewport: { width: 320, height: 568 }, reducedMotion: "reduce" } });
    await choosePlayer(page, "eden");
    assert.equal(await page.locator("[data-placement-tool]").count(), 1);
    const bounds = await page.locator('[data-placement-tool="carrot"]').boundingBox();
    assert.ok(bounds.width >= 120 && bounds.height >= 80);
    const before = await saved(page);
    await dragStart(page);
    await page.mouse.up();
    await idle(page);
    const afterDrag = await saved(page);
    assert.deepEqual(afterDrag.profiles.eden.game.completedSteps, ["first-carrot"]);
    assert.equal(afterDrag.profiles.eden.revision, before.profiles.eden.revision + 1);
    assert.deepEqual(afterDrag.profiles.ethan, before.profiles.ethan);
    await page.waitForTimeout(750);
    assert.deepEqual(await saved(page), afterDrag, "The compatibility click cannot also trigger the assisted tap");
});

for (const base of ["/", "/little-rescue-pups/"]) {
    test(`real touch drags and second-finger rejection at ${base}`, { timeout: 25000 }, async t => {
        const { page, context } = await site(t, base, {
            context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
        });
        await choosePlayer(page, "ethan");
        await page.waitForTimeout(720);
        const cdp = await context.newCDPSession(page);
        const source = await center(page.locator('[data-placement-tool="carrot"]'));
        const wrong = await center(page.locator('[data-placement-tool="bucket"]'));
        const target = await center(page.locator('[data-drop-target="bowl"]'));
        const before = await saved(page);
        const touch = (point, id) => ({ ...point, id, radiusX: 8, radiusY: 8, force: 1 });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(source, 1)] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [touch({ x: source.x, y: source.y - 30 }, 1)] });
        await page.locator(".placement-ghost").waitFor();
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch({ x: source.x, y: source.y - 30 }, 1), touch(wrong, 2)] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [touch(target, 1), touch(wrong, 2)] });
        assert.deepEqual(await saved(page), before);
        assert.equal(await page.locator(".placement-ghost").count(), 1);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [touch(wrong, 2)] });
        assert.deepEqual(await saved(page), before, "Lifting the secondary finger does not place anything");
        assert.equal(await page.locator(".placement-ghost").count(), 1, "The primary finger still owns the drag");
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await idle(page);
        const afterDrag = await saved(page);
        assert.equal(afterDrag.profiles.ethan.revision, before.profiles.ethan.revision + 1);
        assert.deepEqual(afterDrag.profiles.ethan.game.completedSteps, ["first-carrot"]);
        assert.equal(await page.locator(".placement-ghost").count(), 0);
        await page.waitForTimeout(750);
        assert.deepEqual(await saved(page), afterDrag, "Touch-generated mouse clicks do not count twice");
        await home(page);
        await choosePlayer(page, "eden");
        await page.waitForTimeout(720);
        await page.locator('[data-placement-tool="carrot"]').tap();
        await idle(page);
        assert.deepEqual((await saved(page)).profiles.eden.game.completedSteps, ["first-carrot"]);
        assert.deepEqual((await saved(page)).profiles.ethan, afterDrag.profiles.ethan);
    });
}

test("Escape, pointer cancellation, blur, resize and hidden pages cancel gestures without progress", { timeout: 35000 }, async t => {
    const { page, context } = await site(t);
    await choosePlayer(page, "ethan");
    const before = await saved(page);
    await page.waitForTimeout(720);
    await page.locator('[data-placement-tool="carrot"]').click();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#parents").evaluate(dialog => dialog.open), false, "Escape cancels selection instead of opening grown-ups");
    assert.equal(await page.locator('[data-placement-tool="carrot"]').getAttribute("aria-pressed"), "false");
    await page.locator('[data-drop-target="bowl"]').click();
    assert.deepEqual(await saved(page), before);
    for (const cancel of ["pointercancel", "blur", "resize", "hidden"]) {
        await page.evaluate(() => {
            document.addEventListener("pointerdown", event => { window.gesturePointerId = event.pointerId; }, { once: true, capture: true });
        });
        await dragStart(page);
        if (cancel === "pointercancel") {
            await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointercancel", { pointerId: window.gesturePointerId, bubbles: true })));
        } else if (cancel === "blur") {
            await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        } else if (cancel === "resize") {
            await page.setViewportSize({ width: 410, height: 844 });
        } else {
            await page.evaluate(() => {
                Object.defineProperty(document, "hidden", { configurable: true, value: true });
                document.dispatchEvent(new Event("visibilitychange"));
            });
        }
        await page.waitForFunction(() => !document.querySelector(".placement-ghost"));
        await page.mouse.up();
        assert.deepEqual(await saved(page), before, `${cancel} must not place the held carrot`);
        if (cancel === "hidden") {
            await page.evaluate(() => {
                delete document.hidden;
                document.dispatchEvent(new Event("visibilitychange"));
            });
            await idle(page);
        }
        assert.equal(await page.locator('[data-placement-tool="carrot"]').getAttribute("aria-pressed"), "false");
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    const source = await center(page.locator('[data-placement-tool="carrot"]'));
    const target = await center(page.locator('[data-drop-target="bowl"]'));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...source, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...target, id: 1 }] });
    await page.locator(".placement-ghost").waitFor();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    assert.equal(await page.locator(".placement-ghost").count(), 0);
    assert.deepEqual(await saved(page), before);
    await carrot(page, false);
    assert.equal((await saved(page)).profiles.ethan.game.completedSteps.length, 1, "Play recovers after cancellation");
});

test("tiny keyboard safeguards, throttling and goodbye preserve both profiles after three rescues", { timeout: 45000 }, async t => {
    const { page, context } = await site(t);
    await offlineReady(page);
    await page.locator("main .intro").click();
    await page.keyboard.press("a");
    assert.equal(await saved(page), null);
    await choosePlayer(page, "eden");
    const other = (await saved(page)).profiles.ethan;
    await page.locator('[data-placement-tool="carrot"]').click();
    assert.equal((await saved(page)).profiles.eden.game.completedSteps.length, 0, "Immediate second tap is ignored");
    await page.waitForTimeout(720);
    await page.locator(".world").click({ position: { x: 20, y: 20 } });
    assert.equal((await saved(page)).profiles.eden.game.completedSteps.length, 0, "The bunny requires its tool, not a world tap");
    await page.evaluate(() => {
        for (const modifier of [{ repeat: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, ...modifier }));
        }
    });
    assert.equal((await saved(page)).profiles.eden.game.completedSteps.length, 0);
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector(".step-dot.filled"));
    assert.equal((await saved(page)).profiles.eden.game.completedSteps.length, 1);
    await carrot(page);
    await carrot(page);
    await act(page, "next", 1450);
    for (let mission = 1; mission < 3; mission++) {
        for (let step = 0; step < 3; step++) await act(page, "help");
        await page.locator(".celebrate").waitFor();
        await act(page, "next", 1450);
    }
    await page.locator(".rest").waitFor();
    const resting = await saved(page);
    assert.deepEqual(resting.profiles.eden.history, { bunny: 1, ducks: 1, kitten: 1 });
    await page.reload();
    await page.locator(".welcome").waitFor();
    await choosePlayer(page, "eden");
    await page.locator(".rest").waitFor();
    assert.deepEqual(await saved(page), resting);
    await context.setOffline(true);
    await act(page, "goodbye");
    await page.locator(".welcome").waitFor();
    assert.equal(await page.locator('[data-action="again"], [data-action="start"]').count(), 0);
    const goodbye = await saved(page);
    assert.equal(goodbye.profiles.eden.game.phase, "ready");
    assert.equal(goodbye.profiles.eden.outingsCompleted, 1);
    assert.deepEqual(goodbye.profiles.eden.game.outing.map(entry => entry.id), ["flowers", "turtle", "bunny"]);
    assert.deepEqual(goodbye.profiles.eden.history, resting.profiles.eden.history);
    assert.deepEqual(goodbye.profiles.eden.settings, resting.profiles.eden.settings);
    assert.deepEqual(goodbye.profiles.ethan, other);
    await page.locator('[data-profile="eden"]').click();
    assert.deepEqual(await saved(page), goodbye, "Accidental second tap cannot start a new outing");
    await page.reload();
    await page.locator(".welcome").waitFor();
    assert.deepEqual(await saved(page), goodbye);
    await choosePlayer(page, "eden");
    assert.match(await page.locator(".mission-top h1").textContent(), /flowers/);
    assert.equal((await saved(page)).profiles.eden.outingsCompleted, 1);
});

test("cross-tab revisions merge different profiles and reject stale same-profile actions", { timeout: 30000 }, async t => {
    const { page, context, url } = await site(t);
    await choosePlayer(page, "eden");
    const second = await context.newPage();
    await second.goto(url);
    await second.locator(".welcome").waitFor();
    await choosePlayer(second, "ethan");
    await parents(second);
    const contexts = await page.evaluate(async () => {
        const { actionContext } = await import("./src/game/game.mjs");
        const state = (await import("./src/services/storage.mjs")).createStore().load();
        return Object.fromEntries(Object.entries(state.profiles).map(([id, profile]) => [id, actionContext(profile)]));
    });
    const dispatch = (tab, profileId, action) => tab.evaluate(async ({ profileId, action }) => {
        try {
            const result = await (await import("./src/services/storage.mjs")).createStore().dispatch(profileId, action);
            return { ok: true, revision: result.state.profiles[profileId].revision };
        } catch (error) { return { ok: false, code: error.code }; }
    }, { profileId, action });
    const independent = await Promise.all([
        dispatch(page, "eden", { ...contexts.eden, type: "place", tool: "carrot", targetId: "bowl" }),
        dispatch(second, "ethan", { ...contexts.ethan, type: "settings", settings: { mode: "tiny", motion: false } }),
    ]);
    assert.ok(independent.every(result => result.ok), JSON.stringify(independent));
    const sameContext = await page.evaluate(async () => {
        const { actionContext } = await import("./src/game/game.mjs");
        return actionContext((await import("./src/services/storage.mjs")).createStore().load().profiles.ethan);
    });
    const sameAction = { ...sameContext, type: "place", tool: "carrot", targetId: "bowl" };
    const concurrent = await Promise.all([dispatch(page, "ethan", sameAction), dispatch(second, "ethan", sameAction)]);
    assert.equal(concurrent.filter(result => result.ok).length, 1);
    assert.deepEqual(concurrent.filter(result => !result.ok), [{ ok: false, code: "conflict" }]);
    const state = await saved(page);
    assert.deepEqual(state.profiles.eden.game.completedSteps, ["first-carrot"]);
    assert.deepEqual(state.profiles.ethan.game.completedSteps, ["first-carrot"]);
    // Storage events originate in the other tab, not the tab invoking the store directly.
    await dispatch(page, "ethan", {
        ...(await page.evaluate(async () => (await import("./src/game/game.mjs")).actionContext((await import("./src/services/storage.mjs")).createStore().load().profiles.ethan))),
        type: "settings", settings: { voice: false },
    });
    await second.waitForFunction(() => document.querySelector('[data-mode="tiny"]').getAttribute("aria-pressed") === "true");
    assert.equal(await second.locator('[data-setting="motion"]').isChecked(), false);
    assert.equal(await second.locator('[data-setting="voice"]').isChecked(), false);
    assert.match(await page.locator(".brand").textContent(), /Eden's rescue/);
    assert.match(await second.locator(".brand").textContent(), /Ethan's rescue/);
});

test("another tab's progress cancels a held carrot and stale selection without accidental writes", { timeout: 30000 }, async t => {
    const { page, context, url } = await site(t);
    await choosePlayer(page, "ethan");
    const second = await context.newPage();
    await second.goto(url);
    await choosePlayer(second, "ethan");
    await page.bringToFront();
    const progressElsewhere = () => second.evaluate(async () => {
        const store = (await import("./src/services/storage.mjs")).createStore();
        const { actionContext } = await import("./src/game/game.mjs");
        return store.dispatch("ethan", { ...actionContext(store.load().profiles.ethan), type: "place", tool: "carrot", targetId: "bowl" });
    });
    await dragStart(page);
    await progressElsewhere();
    await page.waitForFunction(() => document.querySelectorAll(".step-dot.filled").length === 1 && !document.querySelector(".placement-ghost"));
    const afterOtherTab = await saved(page);
    await page.mouse.up();
    await page.waitForTimeout(750);
    assert.deepEqual(await saved(page), afterOtherTab);
    await page.locator('[data-placement-tool="carrot"]').click();
    assert.equal(await page.locator('[data-placement-tool="carrot"]').getAttribute("aria-pressed"), "true");
    await progressElsewhere();
    await page.waitForFunction(() => document.querySelectorAll(".step-dot.filled").length === 2);
    assert.equal(await page.locator('[data-placement-tool="carrot"]').getAttribute("aria-pressed"), "false");
    const afterSelection = await saved(page);
    await page.locator('[data-drop-target="bowl"]').click();
    assert.deepEqual(await saved(page), afterSelection);
    await carrot(page, false);
    await page.locator(".celebrate").waitFor();
    const completed = await saved(page);
    assert.equal(completed.profiles.ethan.history.bunny, 1);
    await page.reload();
    await page.locator(".welcome").waitFor();
    await choosePlayer(page, "ethan");
    await page.locator(".celebrate").waitFor();
    assert.deepEqual(await saved(page), completed);
});

for (const legacy of ["{broken", JSON.stringify({ version: 1, settings: { mode: "find", voice: false, sound: false, motion: false }, game: { phase: "rest", round: 12, missionIndex: 2, step: 3 }, history: { bunny: 99 } })]) {
    test(`legacy ${legacy === "{broken" ? "malformed" : "completed"} saves are ignored, preserved and never inherited`, { timeout: 20000 }, async t => {
        const { page } = await site(t, "/little-rescue-pups/");
        await page.evaluate(raw => {
            localStorage.setItem("little-rescue-pups:save:/little-rescue-pups/", raw);
            localStorage.setItem("little-rescue-pups:save:/", raw);
        }, legacy);
        await page.reload();
        await page.locator(".welcome").waitFor();
        assert.equal(await page.locator("#notice").isVisible(), false);
        const fresh = await loaded(page);
        assert.equal(fresh.version, 2);
        assert.equal(fresh.profiles.eden.settings.mode, "tiny");
        assert.equal(fresh.profiles.ethan.settings.mode, "find");
        assert.ok(Object.values(fresh.profiles).every(profile => profile.revision === 0 && profile.outingsCompleted === 0 && Object.keys(profile.history).length === 0));
        assert.equal(await saved(page), null);
        await choosePlayer(page, "eden");
        assert.equal((await saved(page)).profiles.eden.game.outing[0].id, "bunny");
        assert.deepEqual(await page.evaluate(() => [
            localStorage.getItem("little-rescue-pups:save:/little-rescue-pups/"),
            localStorage.getItem("little-rescue-pups:save:/"),
        ]), [legacy, legacy]);
        assert.equal(await page.evaluate(async () => (await import("./src/services/storage.mjs")).SAVE_KEY), "little-rescue-pups:profiles:v2:/little-rescue-pups/");
    });
}

test("corrupt v2 saves survive retries and reload until a grown-up confirms a reset", { timeout: 20000 }, async t => {
    const { page } = await site(t);
    await page.evaluate(async () => localStorage.setItem((await import("./src/services/storage.mjs")).SAVE_KEY, "{broken"));
    await page.reload();
    await page.getByText("This device's save could not be read.", { exact: false }).waitFor();
    const raw = () => page.evaluate(async () => localStorage.getItem((await import("./src/services/storage.mjs")).SAVE_KEY));
    assert.equal(await raw(), "{broken");
    assert.equal(await page.locator(".welcome").count(), 0);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    assert.equal(await raw(), "{broken");
    const rejected = await page.evaluate(async () => {
        try {
            await (await import("./src/services/storage.mjs")).createStore().dispatch("eden", { type: "start" });
            return false;
        } catch (error) { return error.code === "corrupt"; }
    });
    assert.equal(rejected, true);
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Reset this device's profile saves", exact: true }).click();
    assert.equal(await raw(), "{broken");
    await page.reload();
    await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
    assert.equal(await raw(), "{broken");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Reset this device's profile saves", exact: true }).click();
    await page.locator(".welcome").waitFor();
    assert.ok(Object.values((await saved(page)).profiles).every(profile => profile.game.phase === "ready" && profile.revision === 0));
});

test("full storage leaves a fresh chooser open with no invented profile progress", { timeout: 20000 }, async t => {
    const { page } = await site(t, "/", {
        init: () => { Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); }; },
    });
    await choosePlayer(page, "ethan");
    await page.locator("#notice").getByText("This change was not saved.", { exact: false }).waitFor();
    assert.equal(await page.locator(".welcome").count(), 1);
    assert.equal(await saved(page), null);
    await parents(page);
    assert.equal(await page.locator("[data-setting], #profile-history").count(), 0);
    assert.equal(await page.locator("#parent-notice").isVisible(), true);
    assert.match(await page.locator("#parent-notice").textContent(), /not saved/);
});

test("write failure preserves a selected profile's carrot, settings and other player's save", { timeout: 20000 }, async t => {
    const { page } = await site(t);
    await choosePlayer(page, "eden");
    const before = await saved(page);
    await page.evaluate(() => {
        window.restoreStorageWrite = Storage.prototype.setItem;
        Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
    });
    await carrot(page);
    assert.deepEqual(await saved(page), before);
    assert.equal(await page.locator(".step-dot.filled").count(), 0);
    assert.match(await page.locator("#notice").textContent(), /not saved/);
    await parents(page);
    await page.locator('[data-setting="motion"]').uncheck();
    await idle(page);
    assert.equal(await page.locator('[data-setting="motion"]').isChecked(), true);
    assert.match(await page.locator("#parent-notice").textContent(), /not saved/);
    assert.deepEqual(await saved(page), before);
    await closeParents(page);
    await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorageWrite; });
    await carrot(page);
    assert.equal((await saved(page)).profiles.eden.game.completedSteps.length, 1);
    assert.deepEqual((await saved(page)).profiles.ethan, before.profiles.ethan);
});

test("blocked storage gives a retry screen, not a false fresh save", { timeout: 20000 }, async t => {
    const { page } = await site(t, "/", {
        init: () => Object.defineProperty(window, "localStorage", {
            get() { throw new DOMException("Blocked", "SecurityError"); },
        }),
    });
    await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
    assert.match(await page.locator("#notice").textContent(), /Browser storage is unavailable/);
    assert.equal(await page.locator(".welcome").count(), 0);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    assert.equal(await page.locator(".welcome").count(), 0);
    assert.match(await page.locator("#notice").textContent(), /Browser storage is unavailable/);
});

test("an incomplete real precache never reports offline readiness and can retry online", { timeout: 30000 }, async t => {
    let missing = true;
    const { page } = await site(t, "/little-rescue-pups/", {
        readAsset: async url => {
            if (missing && url.pathname.endsWith("/assets/icons/icon-512.png")) throw Object.assign(new Error("Test missing asset"), { code: "ENOENT" });
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

test("a real update waits for a grown-up, keeps both saves and cleans only its own caches", { timeout: 40000 }, async t => {
    let version = "1.0.0";
    const { page, context, url } = await site(t, "/little-rescue-pups/", {
        readAsset: async url => {
            const body = await readFile(url);
            return url.pathname.endsWith("/sw.js") ? body.toString().replace(/const VERSION = "[^"]+";/, `const VERSION = "${version}";`) : body;
        },
    });
    await offlineReady(page);
    await choosePlayer(page, "eden");
    await carrot(page);
    const second = await context.newPage();
    await second.goto(url);
    await second.locator(".welcome").waitFor();
    await choosePlayer(second, "ethan");
    await carrot(second, false);
    const before = await saved(page);
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
    await page.locator(".welcome").waitFor();
    assert.deepEqual(await saved(page), before);
    assert.equal(await second.evaluate(() => window.keepThisTabOpen), true, "Other tabs are not reloaded");
    assert.match(await second.locator(".brand").textContent(), /Ethan's rescue/);
    const cacheNames = await page.evaluate(() => caches.keys());
    assert.ok(cacheNames.includes(`little-rescue-pups:${url}:1.0.1`));
    assert.ok(!cacheNames.includes(`little-rescue-pups:${url}:1.0.0`));
    assert.ok(unrelated.every(name => cacheNames.includes(name)));
    await context.setOffline(true);
    await page.reload();
    await page.locator(".welcome").waitFor();
    await choosePlayer(page, "eden");
    assert.deepEqual(await saved(page), before);
    assert.equal(await page.locator(".step-dot.filled").count(), 1);
});

function previousProfileSave() {
    const document = structuredClone(DEFAULT_STATE);
    const act = (id, action) => {
        const profile = document.profiles[id];
        document.profiles[id] = transition(profile, { ...actionContext(profile), ...action }).state;
    };
    const help = id => {
        const mission = currentMission(document.profiles[id]);
        act(id, { type: mission.interaction, tool: mission.tool, targetId: mission.targetId });
    };
    act("eden", { type: "start" });
    for (let mission = 0; mission < 3; mission++) {
        while (document.profiles.eden.game.phase === "playing") help("eden");
        act("eden", { type: "next" });
    }
    act("eden", { type: "goodbye" });
    act("eden", { type: "start" });
    help("eden");
    act("eden", { type: "settings", settings: { voice: false, sound: false, motion: false } });
    act("ethan", { type: "start" });
    help("ethan");
    help("ethan");
    act("ethan", { type: "settings", settings: { voice: false, motion: false } });
    assert.ok(validState(document), "Upgrade fixture is a valid nonempty version 2 profile document");
    return document;
}

for (const base of ["/", "/little-rescue-pups/"]) {
    test(`a real flat-to-nested worker upgrade preserves both v2 profiles offline at ${base}`, { timeout: 40000 }, async t => {
        const fixture = createFlatUpgradeServer(base);
        const { page, context, url } = await site(t, base, { server: fixture.server });
        await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated" && window.legacySaveKey);
        const original = previousProfileSave();
        const oldKey = `little-rescue-pups:profiles:v2:${base}`;
        const oldCache = `little-rescue-pups:${url}:2.0.0`;
        const otherScope = new URL(base === "/" ? "./another-game/" : "../", url).href;
        const unrelated = ["another-app:v1", `little-rescue-pups:${otherScope}:2.0.0`];
        const seededKey = await page.evaluate(async ({ original, unrelated }) => {
            const { SAVE_KEY } = await import("./storage.mjs");
            localStorage.setItem(SAVE_KEY, JSON.stringify(original));
            for (const name of unrelated) {
                const cache = await caches.open(name);
                await cache.put(new URL("./unrelated-cache-entry", location.href), new Response(name));
            }
            return SAVE_KEY;
        }, { original, unrelated });
        assert.equal(seededKey, oldKey, "The old root module wrote the unchanged v2 key");
        const cachedOldFiles = await page.evaluate(async name => (await (await caches.open(name)).keys()).map(request => request.url), oldCache);
        assert.deepEqual(cachedOldFiles.sort(), [url, `${url}index.html`, `${url}storage.mjs`].sort());
        await context.setOffline(true);
        await page.reload();
        await page.locator("#old-app").waitFor();
        assert.equal(await page.evaluate(() => window.legacySaveKey), oldKey, "The flat module really reopens offline");
        await context.setOffline(false);
        fixture.publish();
        await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
        await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting));
        assert.equal(await page.locator("#old-app").count(), 1, "Downloading the new layout does not replace the active old page");
        assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), oldKey), original);
        assert.ok((await page.evaluate(() => caches.keys())).includes(oldCache), "The active old cache survives until approval");
        await Promise.all([
            page.waitForEvent("load"),
            page.locator("#approve-update").click(),
        ]);
        await page.locator(".welcome").waitFor();
        await offlineReady(page);
        assert.deepEqual(await saved(page), original, "The new chooser loads both old profiles without a migration or a write");
        const identity = await page.evaluate(async () => {
            const { APP_BASE_URL } = await import("./src/paths.mjs");
            const { SAVE_KEY } = await import("./src/services/storage.mjs");
            const registrations = await navigator.serviceWorker.getRegistrations();
            return {
                base: APP_BASE_URL.href, key: SAVE_KEY, keys: Object.keys(localStorage),
                scopes: registrations.map(registration => registration.scope),
                worker: navigator.serviceWorker.controller.scriptURL,
            };
        });
        assert.deepEqual(identity, { base: url, key: oldKey, keys: [oldKey], scopes: [url], worker: `${url}sw.js` });
        const cacheNames = await page.evaluate(() => caches.keys());
        assert.ok(!cacheNames.includes(oldCache));
        const currentCaches = cacheNames.filter(name => name.startsWith(`little-rescue-pups:${url}:`));
        assert.equal(currentCaches.length, 1);
        assert.ok(unrelated.every(name => cacheNames.includes(name)));
        for (const name of unrelated) {
            assert.equal(await page.evaluate(async name => (await (await caches.open(name)).match(new URL("./unrelated-cache-entry", location.href))).text(), name), name);
        }
        const currentFiles = await page.evaluate(async name => (await (await caches.open(name)).keys()).map(request => request.url), currentCaches[0]);
        for (const file of ["src/app.mjs", "src/services/storage.mjs", "src/screens/render-screen.mjs", "src/components/profile-button.mjs", "src/styles/game.css"]) {
            assert.ok(currentFiles.includes(`${url}${file}`), `The new worker caches ${file}`);
        }
        assert.ok(!currentFiles.includes(`${url}storage.mjs`));
        assert.equal(await page.evaluate(async () => (await fetch("./storage.mjs")).status), 404, "Old flat modules are no longer hosted");
        await context.setOffline(true);
        assert.equal(await page.evaluate(() => fetch("./network-is-offline").then(() => false, () => true)), true);
        await page.reload();
        await page.locator(".welcome").waitFor();
        assert.deepEqual(await saved(page), original);
        await choosePlayer(page, "eden");
        assert.match(await page.locator(".mission-top h1").textContent(), /flowers/i);
        assert.equal(await page.locator(".step-dot.filled").count(), 1);
        await parents(page);
        for (const setting of ["voice", "sound", "motion"]) assert.equal(await page.locator(`[data-setting="${setting}"]`).isChecked(), false);
        assert.match(await page.locator("#profile-history").textContent(), /A snack for bunny: 1/);
        await page.locator('#parents [data-action="home"]').click();
        await choosePlayer(page, "ethan");
        assert.equal(await page.locator(".step-dot.filled").count(), 2);
        assert.equal(await page.locator(".placement-tool").count(), 3);
        await parents(page);
        assert.equal(await page.locator('[data-setting="sound"]').isChecked(), true);
        assert.equal(await page.locator('[data-setting="voice"]').isChecked(), false);
        assert.equal(await page.locator('[data-setting="motion"]').isChecked(), false);
        await closeParents(page);
        assert.deepEqual(await saved(page), original, "Resuming both profiles is tab-local and does not rewrite the old save");
        await carrot(page, false);
        await page.locator(".celebrate").waitFor();
        const afterEthan = await saved(page);
        assert.deepEqual(afterEthan.profiles.eden, original.profiles.eden);
        assert.equal(afterEthan.profiles.ethan.history.bunny, 1);
        await home(page);
        await choosePlayer(page, "eden");
        await act(page, "help");
        const afterBoth = await saved(page);
        assert.equal(afterBoth.profiles.eden.game.completedSteps.length, 2);
        assert.deepEqual(afterBoth.profiles.ethan, afterEthan.profiles.ethan);
        assert.deepEqual(afterBoth.profiles.eden.history, original.profiles.eden.history);
        assert.equal(afterBoth.profiles.eden.outingsCompleted, 1);
        const reopened = await context.newPage();
        await reopened.goto(url);
        await reopened.locator(".welcome").waitFor();
        assert.deepEqual(await saved(reopened), afterBoth, "Offline launch still opens the chooser with durable, separate progress");
    });
}

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
        image.src = "./assets/icons/maskable-512.png";
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
    await choosePlayer(page, "eden");
    const voices = await page.evaluate(() => window.spokenVoices);
    assert.ok(voices.length > 0);
    assert.ok(voices.every(name => name === "Local English"));
});

test("no local English voice leaves honest guidance and working picture play", { timeout: 20000 }, async t => {
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
    await choosePlayer(page, "eden");
    await carrot(page);
    assert.equal((await saved(page)).profiles.eden.game.completedSteps.length, 1);
});

test("unsupported installation offers guidance without a broken install button", { timeout: 20000 }, async t => {
    const { page } = await site(t, "/", {
        init: () => Object.defineProperty(window, "isSecureContext", { value: false }),
    });
    await parents(page);
    assert.match(await page.locator("#offline-status").textContent(), /Offline installation is unavailable.*HTTPS/);
    assert.equal(await page.locator('[data-action="install"]').isVisible(), false);
    assert.match(await page.locator("#install-status").textContent(), /Safari.*Add to Home Screen/);
});
