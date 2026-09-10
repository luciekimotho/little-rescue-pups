import { test } from "node:test";
import assert from "node:assert/strict";
import { MISSIONS, DEFAULT_STATE, currentMission, choices, transition, validState, PUPS, missionTeam } from "./game.mjs";
import { icon, sceneArt, welcomeArt, crewArt, pup } from "./art.mjs";

test("starting from home selects the child's mode without changing other settings", () => {
    for (const mode of ["tiny", "find"]) {
        const initial = structuredClone(DEFAULT_STATE);
        initial.settings = { mode: mode === "tiny" ? "find" : "tiny", voice: false, sound: false, motion: false };
        const previous = structuredClone(initial);
        const { state, feedback } = transition(initial, { type: "start", mode });
        assert.equal(feedback, "start");
        assert.deepEqual(state.settings, { mode, voice: false, sound: false, motion: false });
        assert.deepEqual(state.game, { phase: "playing", round: 0, missionIndex: 0, step: 0 });
        assert.deepEqual(initial, previous);
        assert.ok(validState(state));
    }
});

test("start mode rejects invalid values and cannot change an active outing", () => {
    for (const mode of ["invalid", "", null, 4, {}, []]) {
        assert.throws(() => transition(DEFAULT_STATE, { type: "start", mode }), /Unknown play style/);
    }
    for (const phase of ["playing", "celebrate"]) {
        const initial = structuredClone(DEFAULT_STATE);
        initial.game = { ...initial.game, phase, step: phase === "playing" ? 1 : 3 };
        assert.deepEqual(transition(initial, { type: "start", mode: "find" }).state, initial);
    }
    const rest = { ...structuredClone(DEFAULT_STATE), game: { phase: "rest", round: 1, missionIndex: 2, step: 3 } };
    rest.settings.mode = "find";
    const { state } = transition(rest, { type: "start" });
    assert.equal(state.settings.mode, "find");
    assert.equal(state.game.round, 2);
});

test("tiny mode accepts help without precision and leaves the original state untouched", () => {
    const initial = structuredClone(DEFAULT_STATE);
    let { state } = transition(initial, { type: "start" });
    for (let step = 1; step <= 3; step++) {
        state = transition(state, { type: "help", tool: "anything" }).state;
        assert.equal(state.game.step, step);
    }
    assert.equal(state.game.phase, "celebrate");
    assert.deepEqual(initial, DEFAULT_STATE);
    assert.deepEqual(transition(state, { type: "help" }).state, state);
});

test("matching presents exactly three distinct choices with one correct target in every position", () => {
    const positions = new Set();
    for (let round = 0; round < 5; round++) {
        let state = structuredClone(DEFAULT_STATE);
        state.settings.mode = "find";
        state.game.round = round;
        state = transition(state, { type: "start" }).state;
        for (let missionIndex = 0; missionIndex < 3; missionIndex++) {
            for (let step = 0; step < 3; step++) {
                const options = choices(state);
                assert.equal(options.length, 3);
                assert.equal(new Set(options).size, 3);
                const target = currentMission(state).tool;
                positions.add(options.indexOf(target));
                const wrong = transition(state, { type: "help", tool: options.find(option => option !== target) });
                assert.equal(wrong.feedback, "hint");
                assert.deepEqual(wrong.state, state);
                state = transition(state, { type: "help", tool: target }).state;
            }
            assert.equal(state.game.phase, "celebrate");
            state = transition(state, { type: "next" }).state;
        }
        assert.equal(state.game.phase, "rest");
    }
    assert.deepEqual([...positions].sort(), [0, 1, 2]);
});

test("three rescues end with rest and all five stories appear across short outings", () => {
    let state = structuredClone(DEFAULT_STATE);
    const seen = new Set();
    for (let outing = 0; outing < 3; outing++) {
        state = transition(state, { type: "start" }).state;
        for (let mission = 0; mission < 3; mission++) {
            seen.add(currentMission(state).id);
            for (let help = 0; help < 3; help++) state = transition(state, { type: "help" }).state;
            state = transition(state, { type: "next" }).state;
        }
        assert.equal(state.game.phase, "rest");
        assert.deepEqual(transition(state, { type: "next" }).state, state);
        assert.deepEqual(transition(state, { type: "help" }).state, state);
    }
    assert.equal(seen.size, 5);
});

test("settings preserve progress and reject invalid inputs", () => {
    let state = transition(DEFAULT_STATE, { type: "start" }).state;
    state = transition(state, { type: "help" }).state;
    const saved = transition(state, { type: "settings", settings: { mode: "find", voice: false, sound: false, motion: false } }).state;
    assert.deepEqual(saved.game, state.game);
    assert.deepEqual(saved.settings, { mode: "find", voice: false, sound: false, motion: false });
    assert.ok(validState(JSON.parse(JSON.stringify(saved))));
    assert.throws(() => transition(saved, { type: "settings", settings: { mode: "invalid" } }));
    assert.throws(() => transition(saved, { type: "settings", settings: { sound: "yes" } }));
    assert.throws(() => transition(saved, { type: "bad" }));
    assert.equal(validState({ ...saved, version: 2 }), false);
    assert.equal(validState({ ...saved, game: { ...saved.game, step: 4 } }), false);
});

test("goodbye returns both modes home and advances the stories exactly once", () => {
    for (const mode of ["tiny", "find"]) {
        const resting = structuredClone(DEFAULT_STATE);
        resting.settings = { mode, voice: false, sound: false, motion: false };
        resting.game = { phase: "rest", round: 0, missionIndex: 2, step: 3 };
        const original = structuredClone(resting);
        const result = transition(resting, { type: "goodbye" });
        assert.equal(result.feedback, "goodbye");
        assert.deepEqual(result.state.game, { phase: "welcome", round: 1, missionIndex: 0, step: 0 });
        assert.deepEqual(result.state.settings, resting.settings);
        assert.deepEqual(resting, original);
        assert.ok(validState(result.state));
        assert.deepEqual(transition(result.state, { type: "goodbye" }), { state: result.state, feedback: "none" });
        const next = transition(result.state, { type: "start", mode }).state;
        assert.equal(next.game.round, 1);
        assert.equal(currentMission(next).id, "flowers");
    }
});

test("goodbye cannot interrupt an unfinished rescue", () => {
    for (const phase of ["welcome", "playing", "celebrate"]) {
        const state = structuredClone(DEFAULT_STATE);
        state.game.phase = phase;
        state.game.step = phase === "celebrate" ? 3 : 0;
        assert.deepEqual(transition(state, { type: "goodbye" }), { state, feedback: "none" });
    }
});

test("every story renders all four progress states with self-contained artwork", () => {
    for (const mission of MISSIONS) {
        assert.match(icon(mission.tool), /<svg/);
        for (let step = 0; step <= 3; step++) {
            const art = sceneArt(mission, step);
            assert.match(art, /viewBox="0 0 1000 500"/);
            assert.doesNotMatch(art, /undefined|NaN|<script|<image|href=/);
        }
        assert.notEqual(sceneArt(mission, 0), sceneArt(mission, 3));
    }
    assert.notEqual(welcomeArt(), welcomeArt(true));
});

test("all six PAW Patrol pups have distinct uniforms and appear in rescue teams", () => {
    assert.deepEqual(Object.values(PUPS).map(item => item.name), ["Chase", "Marshall", "Skye", "Rubble", "Rocky", "Zuma"]);
    const seen = new Set(MISSIONS.flatMap(mission => [mission.pup, ...(mission.buddy ? [mission.buddy] : [])]));
    assert.deepEqual([...seen].sort(), Object.keys(PUPS).sort());
    assert.equal(missionTeam(MISSIONS[0]), "Chase and Rubble");
    const portraits = new Set();
    for (const [id, details] of Object.entries(PUPS)) {
        const art = crewArt(id);
        assert.ok(art.includes(details.color), `${details.name} wears their own uniform colour`);
        assert.doesNotMatch(art, /undefined|NaN|seventy|forty|fifty/);
        assert.notEqual(pup(id), pup(id, "sleep"));
        portraits.add(art);
    }
    assert.equal(portraits.size, 6);
    assert.throws(() => pup("missing-pup"), /Unknown pup/);
    for (const mission of MISSIONS) {
        assert.ok(mission.success.includes(PUPS[mission.pup].name));
        assert.ok(mission.place.startsWith("Adventure Bay"));
    }
});
