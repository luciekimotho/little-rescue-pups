import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, SaveError, SAVE_KEY } from "../../src/services/storage.mjs";
import { DEFAULT_STATE } from "../../src/game/profiles.mjs";
import { actionContext } from "../../src/game/game.mjs";
import { APP_BASE_URL } from "../../src/paths.mjs";

test("nested storage keeps the version 2 save key rooted at the application", () => {
    assert.equal(APP_BASE_URL.href, new URL("../../", import.meta.url).href);
    assert.equal(SAVE_KEY, `little-rescue-pups:profiles:v2:${APP_BASE_URL.pathname}`);
});

function fixture(raw = null) {
    let value = raw;
    let writes = 0;
    const storage = {
        getItem: () => value,
        setItem: (_key, next) => { value = next; writes++; },
    };
    const store = createStore({ key: "test", getStorage: () => storage, runExclusive: work => work() });
    const dispatch = (id, action) => store.dispatch(id, { ...actionContext(store.load().profiles[id]), ...action });
    return { store, storage, dispatch, value: () => value, writes: () => writes };
}
const placement = { type: "place", tool: "carrot", targetId: "bowl" };

test("fresh profiles are independent and loading writes nothing", () => {
    const f = fixture();
    const initial = f.store.load();
    assert.deepEqual(initial, DEFAULT_STATE);
    initial.profiles.eden.settings.sound = false;
    assert.deepEqual(f.store.load(), DEFAULT_STATE);
    assert.equal(f.writes(), 0);
});

test("version 2 never reads or imports a legacy shared save", async () => {
    const values = new Map([["little-rescue-pups:save:/", "{broken legacy save"]]);
    const readKeys = [];
    const store = createStore({
        getStorage: () => ({
            getItem: key => { readKeys.push(key); return values.get(key) ?? null; },
            setItem: (key, value) => values.set(key, value),
        }),
        runExclusive: work => work(),
    });
    assert.match(SAVE_KEY, /profiles:v2:/);
    assert.deepEqual(store.load(), DEFAULT_STATE);
    await store.dispatch("eden", { ...actionContext(store.load().profiles.eden), type: "start" });
    assert.equal(values.get("little-rescue-pups:save:/"), "{broken legacy save");
    assert.ok(readKeys.every(key => key === SAVE_KEY));
    assert.equal(JSON.parse(values.get(SAVE_KEY)).profiles.eden.game.phase, "playing");
});

test("each profile's settings and completed placements survive reopening", async () => {
    const f = fixture();
    await f.dispatch("eden", { type: "start" });
    await f.dispatch("eden", placement);
    await f.dispatch("eden", { type: "settings", settings: { sound: false, voice: false, motion: false } });
    const eden = structuredClone(f.store.load().profiles.eden);
    await f.dispatch("ethan", { type: "start" });
    await f.dispatch("ethan", placement);
    await f.dispatch("ethan", placement);
    const reopened = createStore({ getStorage: () => f.storage });
    assert.deepEqual(reopened.load().profiles.eden, eden);
    assert.equal(reopened.load().profiles.ethan.game.completedSteps.length, 2);
    assert.equal(reopened.load().profiles.ethan.settings.sound, true);
    assert.equal(f.writes(), 6);
});

test("a placement commits one durable write and a failed write claims no progress", async () => {
    const f = fixture();
    await f.dispatch("eden", { type: "start" });
    const before = f.writes();
    await f.dispatch("eden", placement);
    assert.equal(f.writes(), before + 1);
    const goodSave = f.store.load();
    f.storage.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
    assert.throws(() => f.dispatch("eden", placement), { code: "write" });
    assert.deepEqual(f.store.load(), goodSave);
    assert.throws(() => f.dispatch("ethan", { type: "start" }), { code: "write" });
    assert.deepEqual(f.store.load(), goodSave);
});

test("failed goodbye leaves the completed outing and both profiles intact", async () => {
    const document = structuredClone(DEFAULT_STATE);
    const profile = document.profiles.eden;
    profile.game.phase = "rest";
    profile.game.missionIndex = 2;
    profile.game.completedSteps = ["first-rung", "second-rung", "third-rung"];
    const f = fixture(JSON.stringify(document));
    f.storage.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
    assert.throws(() => f.dispatch("eden", { type: "goodbye" }), { code: "write" });
    assert.deepEqual(f.store.load(), document);
});

test("malformed, unknown-version and invalid new saves are not replaced", () => {
    for (const raw of ["bad json", "null", "{}", JSON.stringify({ ...DEFAULT_STATE, version: 3 }), JSON.stringify({ version: 2, profiles: { eden: {} } })]) {
        const f = fixture(raw);
        assert.throws(() => f.store.load(), error => error instanceof SaveError && error.code === "corrupt");
        assert.throws(() => f.store.dispatch("eden", { type: "start" }), { code: "corrupt" });
        assert.equal(f.value(), raw);
        assert.equal(f.writes(), 0);
    }
});

test("unavailable storage reports an adult-facing error", () => {
    const store = createStore({ getStorage: () => { throw new DOMException("Blocked", "SecurityError"); } });
    assert.throws(() => store.load(), { code: "unavailable" });
});

test("wrong placements and no-op actions never write", async () => {
    const f = fixture();
    await f.dispatch("ethan", { type: "start" });
    const document = f.store.load();
    f.storage.setItem = () => { throw new Error("Must not write"); };
    assert.equal((await f.dispatch("ethan", { ...placement, tool: "ladder" })).feedback, "hint");
    assert.deepEqual((await f.dispatch("ethan", { type: "start" })).state, document);
});

test("different-profile actions merge while same-profile stale actions are rejected", async () => {
    const f = fixture();
    const initial = f.store.load();
    const edenStart = { ...actionContext(initial.profiles.eden), type: "start" };
    const ethanStart = { ...actionContext(initial.profiles.ethan), type: "start" };
    await f.store.dispatch("eden", edenStart);
    await f.store.dispatch("ethan", ethanStart);
    assert.equal(f.store.load().profiles.eden.game.phase, "playing");
    assert.equal(f.store.load().profiles.ethan.game.phase, "playing");
    const action = { ...actionContext(f.store.load().profiles.ethan), ...placement };
    await f.store.dispatch("ethan", action);
    assert.throws(() => f.store.dispatch("ethan", action), { code: "conflict" });
    assert.equal(f.store.load().profiles.ethan.game.completedSteps.length, 1);
    assert.throws(() => f.store.dispatch("someone-else", action), /Choose Eden or Ethan/);
});

test("exclusive commits read the latest document rather than a cached profile snapshot", async () => {
    const f = fixture();
    let locks = 0;
    const another = createStore({
        getStorage: () => f.storage,
        runExclusive: async work => { locks++; return work(); },
    });
    const initial = another.load();
    await f.dispatch("eden", { type: "start" });
    await another.dispatch("ethan", { ...actionContext(initial.profiles.ethan), type: "start" });
    assert.equal(another.load().profiles.eden.game.phase, "playing");
    assert.equal(locks, 1);
});

test("fallback detects a concurrent document change before writing", () => {
    let reads = 0;
    let writes = 0;
    const store = createStore({
        getStorage: () => ({
            getItem: () => ++reads === 1 ? null : JSON.stringify(DEFAULT_STATE),
            setItem: () => { writes++; },
        }),
        runExclusive: work => work(),
    });
    assert.throws(() => store.dispatch("eden", { ...actionContext(DEFAULT_STATE.profiles.eden), type: "start" }), { code: "conflict" });
    assert.equal(writes, 0);
});

test("reset requires unchanged corrupt data and never removes a valid save", async () => {
    const f = fixture("broken");
    assert.deepEqual(await f.store.resetInvalid("broken"), DEFAULT_STATE);
    assert.deepEqual(f.store.load(), DEFAULT_STATE);
    assert.throws(() => f.store.resetInvalid("broken"), { code: "conflict" });
    assert.throws(() => f.store.resetInvalid(f.value()), { code: "conflict" });
    const blocked = fixture("broken");
    blocked.storage.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
    assert.throws(() => blocked.store.resetInvalid("broken"), { code: "write" });
    assert.equal(blocked.value(), "broken");
});
