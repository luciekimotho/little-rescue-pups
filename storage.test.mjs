import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, SaveError } from "./storage.mjs";
import { DEFAULT_STATE } from "./game.mjs";

function fixture(raw = null) {
    let value = raw;
    let writes = 0;
    const storage = {
        getItem: () => value,
        setItem: (_key, next) => { value = next; writes++; },
    };
    const store = createStore({ key: "test", getStorage: () => storage, runExclusive: work => work() });
    return { store, storage, value: () => value, writes: () => writes };
}

test("a new browser gets a fresh independent state without overwriting storage", () => {
    const f = fixture();
    const initial = f.store.load();
    assert.deepEqual(initial, DEFAULT_STATE);
    initial.game.step = 2;
    assert.deepEqual(f.store.load(), DEFAULT_STATE);
    assert.equal(f.writes(), 0);
});

test("progress and parent settings survive a new store instance", async () => {
    const f = fixture();
    await f.store.dispatch({ type: "start" });
    await f.store.dispatch({ type: "help" });
    const result = await f.store.dispatch({ type: "settings", settings: { mode: "find", sound: false, voice: false, motion: false } });
    const reopened = createStore({ getStorage: () => f.storage });
    assert.deepEqual(reopened.load(), result.state);
    assert.equal(reopened.load().game.step, 1);
    assert.equal(f.writes(), 3);
});

test("malformed, unknown-version and invalid saves are never silently replaced", async () => {
    for (const raw of ["bad json", "null", "{}", JSON.stringify({ ...DEFAULT_STATE, version: 2 }), JSON.stringify({ ...DEFAULT_STATE, game: { ...DEFAULT_STATE.game, step: 999 } })]) {
        const f = fixture(raw);
        assert.throws(() => f.store.load(), error => error instanceof SaveError && error.code === "corrupt");
        assert.throws(() => f.store.dispatch({ type: "start" }), { code: "corrupt" });
        assert.equal(f.value(), raw);
        assert.equal(f.writes(), 0);
    }
});

test("unavailable storage reports a useful error", () => {
    const store = createStore({ getStorage: () => { throw new DOMException("Blocked", "SecurityError"); } });
    assert.throws(() => store.load(), { code: "unavailable" });
});

test("failed writes do not claim a change or replace the last good save", async () => {
    const f = fixture(JSON.stringify(DEFAULT_STATE));
    f.storage.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
    assert.throws(() => f.store.dispatch({ type: "start" }), { code: "write" });
    assert.deepEqual(f.store.load(), DEFAULT_STATE);
});

test("gentle wrong-answer hints and no-op actions do not need a storage write", async () => {
    const state = structuredClone(DEFAULT_STATE);
    state.settings.mode = "find";
    state.game.phase = "playing";
    const f = fixture(JSON.stringify(state));
    f.storage.setItem = () => { throw new Error("Must not write"); };
    assert.equal((await f.store.dispatch({ type: "help", tool: "wrong" })).feedback, "hint");
    assert.deepEqual((await f.store.dispatch({ type: "start" })).state, state);
});

test("every action reads the latest tab's save and uses an exclusive commit", async () => {
    const f = fixture();
    let locks = 0;
    const another = createStore({
        getStorage: () => f.storage,
        runExclusive: async work => { locks++; return work(); },
    });
    await f.store.dispatch({ type: "start" });
    await another.dispatch({ type: "help" });
    await f.store.dispatch({ type: "help" });
    assert.equal(another.load().game.step, 2);
    assert.equal(locks, 1);
});

test("fallback detects a save changed between reading and writing", () => {
    let calls = 0;
    let writes = 0;
    const store = createStore({
        getStorage: () => ({
            getItem: () => ++calls === 1 ? null : JSON.stringify(DEFAULT_STATE),
            setItem: () => { writes++; },
        }),
        runExclusive: work => work(),
    });
    assert.throws(() => store.dispatch({ type: "start" }), { code: "conflict" });
    assert.equal(writes, 0);
});

test("reset requires an unchanged corrupt save and never removes a valid save", async () => {
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
