import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createStaticServer } from "../../scripts/dev-server.mjs";

let browser;
before(async () => { browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" }); });
after(async () => { await browser?.close(); });

async function site(t, base = "/", readAsset) {
    const server = createStaticServer({ basePath: base, readAsset });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const context = await browser.newContext({ viewport: { width: 320, height: 568 }, reducedMotion: "reduce" });
    const errors = [];
    const external = [];
    context.on("page", page => {
        page.setDefaultTimeout(10000);
        page.on("pageerror", error => errors.push(error.message));
    });
    context.on("request", request => {
        if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) external.push(request.url());
    });
    t.after(async () => {
        await context.close();
        await new Promise(resolve => server.close(resolve));
        assert.deepEqual(errors, [], "No browser crashes");
        assert.deepEqual(external, [], "The game makes no external requests");
    });
    const page = await context.newPage();
    const url = `${origin}${base}`;
    await page.goto(url);
    await page.locator(".welcome").waitFor();
    return { page, context, url };
}

const idle = page => page.waitForFunction(() => document.querySelector("#app").getAttribute("aria-busy") === "false");
const saved = page => page.evaluate(async () => (await import("./src/services/storage.mjs")).createStore().load());
const parents = page => page.getByRole("button", { name: "Grown-ups", exact: true }).click();
const closeParents = page => page.getByRole("button", { name: "Close grown-up settings", exact: true }).click();

async function choose(page, id) {
    await page.waitForTimeout(720);
    await page.locator(`[data-profile="${id}"]`).click();
    await idle(page);
}

async function carrot(page, assisted = true) {
    await page.waitForTimeout(720);
    await page.locator('[data-placement-tool="carrot"]').click();
    if (!assisted) await page.locator('[data-drop-target="bowl"]').click();
    await idle(page);
}

async function ready(page) {
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated");
    await parents(page);
    await page.waitForFunction(() => document.querySelector("#offline-status").textContent.startsWith("Ready for offline play"));
    await closeParents(page);
}

async function center(locator) {
    const box = await locator.boundingBox();
    assert.ok(box);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page, end) {
    await page.waitForTimeout(720);
    const from = await center(page.locator('[data-placement-tool="carrot"]'));
    const to = end ?? await center(page.locator('[data-drop-target="bowl"]'));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.locator(".placement-ghost").waitFor();
}

test("offline startup and saved progress work at the Pages subpath", async t => {
        const base = "/little-rescue-pups/";
        const { page, context, url } = await site(t, base);
        await ready(page);
        const identity = await page.evaluate(async () => ({
            scope: (await navigator.serviceWorker.ready).scope,
            key: (await import("./src/services/storage.mjs")).SAVE_KEY,
        }));
        assert.deepEqual(identity, { scope: url, key: `little-rescue-pups:profiles:v2:${base}` });
        await choose(page, "eden");
        await carrot(page);
        const before = await saved(page);
        await context.setOffline(true);
        assert.equal(await page.evaluate(() => fetch("./network-probe").then(() => false, () => true)), true);
        await page.reload();
        await page.locator(".welcome").waitFor();
        assert.deepEqual(await saved(page), before);
        await choose(page, "eden");
        await carrot(page);
        const after = await saved(page);
        assert.equal(after.profiles.eden.game.completedSteps.length, 2);
        assert.deepEqual(after.profiles.ethan, before.profiles.ethan);
});

test("switching children and reopening the app preserves each child's settings and rescue", async t => {
    const { page } = await site(t);
    await choose(page, "eden");
    await carrot(page);
    await parents(page);
    await page.locator('[data-setting="sound"]').uncheck();
    await idle(page);
    await page.locator('[data-mode="find"]').click();
    await idle(page);
    await page.locator('#parents [data-action="home"]').click();
    const eden = (await saved(page)).profiles.eden;
    await choose(page, "ethan");
    await carrot(page, false);
    const both = await saved(page);
    assert.deepEqual(both.profiles.eden, eden);
    assert.equal(both.profiles.ethan.settings.sound, true);
    await page.reload();
    await page.locator(".welcome").waitFor();
    await choose(page, "eden");
    assert.deepEqual(await saved(page), both);
    assert.equal(await page.locator("[data-placement-tool]").count(), 3, "Saved play style is not reset by the name button");
    await parents(page);
    assert.equal(await page.locator('[data-setting="sound"]').isChecked(), false);
});

test("phone controls support mouse and keyboard placement without counting misses or duplicate clicks", async t => {
    const { page } = await site(t);
    for (const id of ["eden", "ethan"]) {
        const box = await page.locator(`[data-profile="${id}"]`).boundingBox();
        assert.ok(box.width >= 120 && box.height >= 80 && box.x >= 0 && box.x + box.width <= 320 && box.y + box.height <= 568);
    }
    await choose(page, "ethan");
    const before = await saved(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.waitForTimeout(720);
    await page.locator('[data-placement-tool="ladder"]').click();
    await page.locator('[data-drop-target="bowl"]').click();
    await idle(page);
    assert.deepEqual(await saved(page), before);
    await drag(page, { x: 4, y: 4 });
    await page.mouse.up();
    assert.deepEqual(await saved(page), before);
    await drag(page);
    await page.mouse.up();
    await idle(page);
    assert.equal((await saved(page)).profiles.ethan.game.completedSteps.length, 1);
    await page.waitForTimeout(720);
    await page.locator('[data-placement-tool="carrot"]').focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Escape");
    await page.locator('[data-drop-target="bowl"]').click();
    assert.equal((await saved(page)).profiles.ethan.game.completedSteps.length, 1);
    await page.locator('[data-placement-tool="carrot"]').focus();
    await page.keyboard.press("Space");
    await page.locator('[data-drop-target="bowl"]').focus();
    await page.keyboard.press("Enter");
    await idle(page);
    assert.equal((await saved(page)).profiles.ethan.game.completedSteps.length, 2);
});

test("real touch dragging cancels safely and ignores a second finger", async t => {
    const { page, context } = await site(t);
    await choose(page, "ethan");
    await page.waitForTimeout(720);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    const source = await center(page.locator('[data-placement-tool="carrot"]'));
    const target = await center(page.locator('[data-drop-target="bowl"]'));
    const wrong = await center(page.locator('[data-placement-tool="bucket"]'));
    const touch = (point, id) => ({ ...point, id, radiusX: 8, radiusY: 8, force: 1 });
    const send = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    const before = await saved(page);
    await send("touchStart", [touch(source, 1)]);
    await send("touchMove", [touch(target, 1)]);
    await page.locator(".placement-ghost").waitFor();
    await send("touchCancel", []);
    assert.equal(await page.locator(".placement-ghost").count(), 0);
    assert.deepEqual(await saved(page), before);
    await send("touchStart", [touch(source, 1)]);
    await send("touchMove", [touch(target, 1)]);
    await send("touchStart", [touch(target, 1), touch(wrong, 2)]);
    await send("touchEnd", [touch(wrong, 2)]);
    assert.deepEqual(await saved(page), before);
    await send("touchEnd", []);
    await idle(page);
    assert.equal((await saved(page)).profiles.ethan.game.completedSteps.length, 1);
    assert.equal(await page.locator(".placement-ghost").count(), 0);
});

test("failed saves leave the scene unchanged and show an error to the grown-up", async t => {
    const { page } = await site(t);
    await choose(page, "eden");
    const before = await saved(page);
    await page.evaluate(() => {
        Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
    });
    await carrot(page);
    assert.deepEqual(await saved(page), before);
    assert.equal(await page.locator(".step-dot.filled").count(), 0);
    assert.match(await page.locator("#notice").textContent(), /not saved/);
    await parents(page);
    await page.locator('[data-setting="motion"]').click();
    await idle(page);
    assert.equal(await page.locator('[data-setting="motion"]').isChecked(), true);
    assert.match(await page.locator("#parent-notice").textContent(), /not saved/);
});

test("an incomplete download does not claim offline readiness and can recover online", async t => {
    let missing = true;
    const { page } = await site(t, "/little-rescue-pups/", async url => {
        if (missing && url.pathname.endsWith("/assets/icons/icon-512.png")) throw Object.assign(new Error("Missing asset"), { code: "ENOENT" });
        return readFile(url);
    });
    await parents(page);
    await page.waitForFunction(() => /did not finish|setup failed/.test(document.querySelector("#offline-status").textContent));
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null);
    missing = false;
    await page.reload();
    await ready(page);
});

test("finishing an outing returns to the chooser without resetting the other child", async t => {
    const { page } = await site(t);
    await page.evaluate(async () => {
        const { createStore, SAVE_KEY } = await import("./src/services/storage.mjs");
        const { currentMission } = await import("./src/game/game.mjs");
        const state = createStore().load();
        Object.assign(state.profiles.eden.game, { phase: "celebrate", missionIndex: 2 });
        state.profiles.eden.game.completedSteps = [...currentMission(state.profiles.eden).steps];
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    });
    await choose(page, "eden");
    const ethan = (await saved(page)).profiles.ethan;
    await page.waitForTimeout(720);
    await page.locator('[data-action="next"]').click();
    await page.locator(".rest").waitFor();
    await page.waitForTimeout(720);
    await page.locator('[data-action="goodbye"]').click();
    await page.locator(".welcome").waitFor();
    const state = await saved(page);
    assert.equal(state.profiles.eden.outingsCompleted, 1);
    assert.equal(state.profiles.eden.game.phase, "ready");
    assert.deepEqual(state.profiles.ethan, ethan);
});
