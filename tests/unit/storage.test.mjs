import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../../src/services/storage.mjs";
import { DEFAULT_STATE } from "../../src/game/profiles.mjs";
import { actionContext } from "../../src/game/game.mjs";

function fixture(raw = null) {
    let value = raw;
    const storage = { getItem: () => value, setItem: (_key, next) => { value = next; } };
    const store = createStore({ getStorage: () => storage, runExclusive: work => work() });
    const dispatch = (id, action) => store.dispatch(id, { ...actionContext(store.load().profiles[id]), ...action });
    return { store, storage, dispatch, raw: () => value };
}
const carrot = { type: "place", tool: "carrot", targetId: "bowl" };

test("each child's progress and preferences survive reopening without overwriting the other child", async () => {
    const f = fixture();
    assert.deepEqual(f.store.load(), DEFAULT_STATE);
    assert.equal(f.raw(), null);
    await f.dispatch("eden", { type: "start" });
    await f.dispatch("eden", carrot);
    await f.dispatch("eden", { type: "settings", settings: { sound: false } });
    const eden = structuredClone(f.store.load().profiles.eden);
    await f.dispatch("ethan", { type: "start" });
    await f.dispatch("ethan", carrot);
    await f.dispatch("ethan", carrot);
    const reopened = createStore({ getStorage: () => f.storage }).load();
    assert.deepEqual(reopened.profiles.eden, eden);
    assert.equal(reopened.profiles.ethan.game.completedSteps.length, 2);
    assert.equal(reopened.profiles.ethan.settings.sound, true);
});

test("a failed write preserves the last saved document and wrong-answer hints still work", async () => {
    const f = fixture();
    await f.dispatch("ethan", { type: "start" });
    const before = f.raw();
    f.storage.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
    assert.throws(() => f.dispatch("ethan", carrot), { code: "write" });
    assert.throws(() => f.dispatch("ethan", { type: "settings", settings: { sound: false } }), { code: "write" });
    assert.equal((await f.dispatch("ethan", { ...carrot, tool: "ladder" })).feedback, "hint");
    assert.equal(f.raw(), before);
});

test("unreadable or invalid profile data is reported, never silently replaced", () => {
    const invalid = structuredClone(DEFAULT_STATE);
    invalid.profiles.eden.settings.voice = "yes";
    for (const raw of ["{broken", "null", JSON.stringify(invalid)]) {
        const f = fixture(raw);
        assert.throws(() => f.store.load(), { code: "corrupt" });
        assert.throws(() => f.store.dispatch("eden", { type: "start" }), { code: "corrupt" });
        assert.equal(f.raw(), raw);
    }
});

test("blocked browser storage reports an error", () => {
    const store = createStore({ getStorage: () => { throw new DOMException("Blocked", "SecurityError"); } });
    assert.throws(() => store.load(), { code: "unavailable" });
});

test("concurrent profile changes merge, while a repeated action cannot count twice", async () => {
    const f = fixture();
    const initial = f.store.load();
    for (const id of ["eden", "ethan"]) {
        await f.store.dispatch(id, { ...actionContext(initial.profiles[id]), type: "start" });
    }
    assert.equal(f.store.load().profiles.eden.game.phase, "playing");
    assert.equal(f.store.load().profiles.ethan.game.phase, "playing");
    const action = { ...actionContext(f.store.load().profiles.ethan), ...carrot };
    await f.store.dispatch("ethan", action);
    assert.throws(() => f.store.dispatch("ethan", action), { code: "conflict" });
    assert.equal(f.store.load().profiles.ethan.game.completedSteps.length, 1);
});

test("a concurrent change before writing is not overwritten without Web Locks", () => {
    let reads = 0;
    const store = createStore({
        getStorage: () => ({
            getItem: () => ++reads === 1 ? null : JSON.stringify(DEFAULT_STATE),
            setItem: () => assert.fail("Must not overwrite a concurrent save"),
        }),
        runExclusive: work => work(),
    });
    assert.throws(() => store.dispatch("eden", { ...actionContext(DEFAULT_STATE.profiles.eden), type: "start" }), { code: "conflict" });
});

test("reset accepts only the unchanged damaged save", async () => {
    const f = fixture("{broken");
    assert.throws(() => f.store.resetInvalid("different data"), { code: "conflict" });
    assert.deepEqual(await f.store.resetInvalid("{broken"), DEFAULT_STATE);
    assert.throws(() => f.store.resetInvalid(f.raw()), { code: "conflict" });
});
