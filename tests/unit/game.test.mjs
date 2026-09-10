import { test } from "node:test";
import assert from "node:assert/strict";
import { actionContext, currentMission, choices, transition, currentStep, validGame } from "../../src/game/game.mjs";
import { DEFAULT_STATE, newProfile, validProfile, validState } from "../../src/game/profiles.mjs";
import { MISSIONS, missionById, validMissions, PUPS, missionTeam } from "../../src/game/missions.mjs";
import { icon, sceneArt, welcomeArt, crewArt, pup } from "../../src/artwork/art.mjs";

const act = (profile, action) => transition(profile, { ...actionContext(profile), ...action });
const help = profile => {
    const mission = currentMission(profile);
    return act(profile, { type: mission.interaction, tool: mission.tool, targetId: mission.targetId }).state;
};
const finish = profile => {
    while (profile.game.phase === "playing") profile = help(profile);
    return profile;
};

test("fresh version 2 has independent child defaults and no selected profile", () => {
    assert.equal(DEFAULT_STATE.version, 2);
    assert.equal(DEFAULT_STATE.profiles.eden.settings.mode, "tiny");
    assert.equal(DEFAULT_STATE.profiles.ethan.settings.mode, "find");
    assert.ok(validState(DEFAULT_STATE));
    assert.equal(Object.hasOwn(DEFAULT_STATE, "selectedProfile"), false);
    const eden = newProfile("eden");
    eden.settings.sound = false;
    eden.game.completedSteps.push("changed");
    assert.deepEqual(newProfile("eden"), DEFAULT_STATE.profiles.eden);
    assert.equal(newProfile("ethan").game.completedSteps.length, 0);
    assert.throws(() => newProfile("unknown"), /Choose Eden or Ethan/);
});

test("starting and resuming do not overwrite a child's settings or existing progress", () => {
    const original = newProfile("eden");
    original.settings = { mode: "find", voice: false, sound: false, motion: false };
    const previous = structuredClone(original);
    const started = act(original, { type: "start" });
    assert.equal(started.feedback, "start");
    assert.equal(started.state.game.phase, "playing");
    assert.deepEqual(started.state.settings, original.settings);
    assert.deepEqual(original, previous);
    const progressed = help(started.state);
    assert.deepEqual(act(progressed, { type: "start" }), { state: progressed, feedback: "none" });
});

test("bunny needs a carrot placed in the bowl in both modes", () => {
    for (const id of ["eden", "ethan"]) {
        let state = act(newProfile(id), { type: "start" }).state;
        assert.equal(currentMission(state).id, "bunny");
        for (const action of [
            { type: "help" }, { type: "place", tool: "ladder", targetId: "bowl" },
            { type: "place", tool: "carrot", targetId: "elsewhere" }, { type: "place", tool: "carrot" },
        ]) {
            const result = act(state, action);
            assert.deepEqual(result.state, state);
            assert.equal(result.feedback, "hint");
        }
        for (let step = 0; step < 3; step++) {
            const id = currentStep(state);
            const old = state;
            state = help(state);
            assert.equal(state.game.completedSteps[step], id);
            assert.equal(old.game.completedSteps.length, step);
        }
        assert.equal(state.game.phase, "celebrate");
        assert.equal(state.history.bunny, 1);
        assert.deepEqual(act(state, { type: "place", tool: "carrot", targetId: "bowl" }).state, state);
    }
});

test("stale, repeated and wrong-mission actions cannot advance a different step", () => {
    const state = act(newProfile("ethan"), { type: "start" }).state;
    const action = { ...actionContext(state), type: "place", tool: "carrot", targetId: "bowl" };
    const next = transition(state, action).state;
    assert.throws(() => transition(next, action), { code: "conflict" });
    for (const change of [{ revision: -1 }, { missionId: "ducks" }, { missionVersion: 99 }, { stepId: "third-carrot" }]) {
        assert.throws(() => transition(state, { ...action, ...change }), { code: "conflict" });
    }
    assert.throws(() => transition(state, { type: "help" }), { code: "conflict" });
    assert.throws(() => act(state, { type: "unknown" }), /Unknown game action/);
});

test("existing tiny rescues accept imprecise help; matching rejects wrong pictures", () => {
    for (const id of ["eden", "ethan"]) {
        let profile = act(newProfile(id), { type: "start" }).state;
        profile = act(finish(profile), { type: "next" }).state;
        assert.equal(currentMission(profile).id, "ducks");
        const wrong = act(profile, { type: "help", tool: "carrot" });
        if (id === "eden") assert.equal(wrong.state.game.completedSteps.length, 1);
        else assert.deepEqual(wrong, { state: profile, feedback: "hint" });
    }
});

test("choices rotate and all five rescues remain reachable across short outings", () => {
    let profile = newProfile("ethan");
    const seen = new Set();
    const positions = new Set();
    for (let outing = 0; outing < 4; outing++) {
        profile = act(profile, { type: "start" }).state;
        for (let index = 0; index < 3; index++) {
            seen.add(currentMission(profile).id);
            while (profile.game.phase === "playing") {
                const options = choices(profile);
                assert.equal(new Set(options).size, 3);
                positions.add(options.indexOf(currentMission(profile).tool));
                profile = help(profile);
                assert.ok(validProfile(profile));
            }
            profile = act(profile, { type: "next" }).state;
        }
        assert.equal(profile.game.phase, "rest");
        assert.deepEqual(act(profile, { type: "start" }).state, profile);
        const old = structuredClone(profile);
        const result = act(profile, { type: "goodbye" });
        profile = result.state;
        assert.equal(result.feedback, "goodbye");
        assert.equal(profile.game.phase, "ready");
        assert.equal(profile.outingsCompleted, outing + 1);
        assert.deepEqual(profile.history, old.history);
        assert.deepEqual(act(profile, { type: "goodbye" }).state, profile);
    }
    assert.equal(seen.size, 5);
    assert.deepEqual([...positions].sort(), [0, 1, 2]);
    assert.equal(Object.values(profile.history).reduce((a, b) => a + b, 0), 12);
});

test("saved outings and steps survive catalog reordering", () => {
    const profile = help(act(newProfile("eden"), { type: "start" }).state);
    MISSIONS.reverse();
    try {
        assert.equal(currentMission(profile).id, "bunny");
        assert.equal(currentStep(profile), "second-carrot");
        assert.equal(validProfile(profile), true);
        assert.equal(act(finish(profile), { type: "next" }).state.game.outing[1].id, "ducks");
    } finally {
        MISSIONS.reverse();
    }
});

test("settings update only preferences and reject bad values", () => {
    const profile = help(act(newProfile("eden"), { type: "start" }).state);
    const settings = { mode: "find", voice: false, sound: false, motion: false };
    const changed = act(profile, { type: "settings", settings }).state;
    assert.deepEqual(changed.settings, settings);
    assert.deepEqual(changed.game, profile.game);
    assert.deepEqual(changed.history, profile.history);
    assert.equal(changed.revision, profile.revision + 1);
    for (const settings of [null, [], { mode: "other" }, { sound: "yes" }, { unknown: true }]) {
        assert.throws(() => act(profile, { type: "settings", settings }));
    }
});

test("validators reject unsupported mission versions and malformed saves", () => {
    for (const mutate of [
        state => { state.version = 1; },
        state => { delete state.profiles.ethan; },
        state => { state.profiles.eden.revision = -1; },
        state => { state.profiles.eden.settings.voice = "yes"; },
        state => { state.profiles.eden.game.outing[0].version = 9; },
        state => { state.profiles.eden.game.outing[0].id = "missing"; },
        state => { state.profiles.eden.game.completedSteps = ["third-carrot"]; },
        state => { state.profiles.eden.game.phase = "celebrate"; },
        state => { state.profiles.eden.game.phase = "rest"; },
        state => { state.profiles.eden.history.bunny = -1; },
        state => { state.profiles.eden.outingsCompleted = 1.5; },
    ]) {
        const state = structuredClone(DEFAULT_STATE);
        mutate(state);
        assert.equal(validState(state), false);
    }
    assert.equal(validGame(null), false);
    assert.equal(validState(null), false);
    assert.equal(validState([]), false);
    assert.throws(() => missionById("missing"), /not available/);
});

test("mission definitions have stable unique steps and bounded placement targets", () => {
    assert.equal(validMissions(MISSIONS), true);
    const duplicate = structuredClone(MISSIONS);
    duplicate[0].steps[1] = duplicate[0].steps[0];
    assert.equal(validMissions(duplicate), false);
    const invalidTarget = structuredClone(MISSIONS);
    invalidTarget[0].targets[0].width = 2000;
    assert.equal(validMissions(invalidTarget), false);
});

test("every story renders all progress states with self-contained artwork", () => {
    for (const mission of MISSIONS) {
        assert.match(icon(mission.tool), /<svg/);
        for (let step = 0; step <= mission.steps.length; step++) {
            const art = sceneArt(mission, step);
            assert.match(art, /viewBox="0 0 1000 500"/);
            assert.doesNotMatch(art, /undefined|NaN|<script|<image|href=/);
        }
        assert.notEqual(sceneArt(mission, 0), sceneArt(mission, 3));
    }
    assert.match(sceneArt(missionById("bunny"), 1), /delivered-carrot|bunny-fed/);
    assert.notEqual(welcomeArt(), welcomeArt(true));
});

test("all six pups keep original portraits and rescue teams", () => {
    assert.deepEqual(Object.values(PUPS).map(item => item.name), ["Chase", "Marshall", "Skye", "Rubble", "Rocky", "Zuma"]);
    const seen = new Set(MISSIONS.flatMap(mission => [mission.pup, ...(mission.buddy ? [mission.buddy] : [])]));
    assert.deepEqual([...seen].sort(), Object.keys(PUPS).sort());
    assert.equal(missionTeam(missionById("ducks")), "Chase and Rubble");
    const portraits = new Set();
    for (const [id, details] of Object.entries(PUPS)) {
        const art = crewArt(id);
        assert.ok(art.includes(details.color));
        assert.doesNotMatch(art, /undefined|NaN/);
        assert.notEqual(pup(id), pup(id, "sleep"));
        portraits.add(art);
    }
    assert.equal(portraits.size, 6);
    assert.throws(() => pup("missing-pup"), /Unknown pup/);
    for (const mission of MISSIONS) assert.ok(mission.success.includes(PUPS[mission.pup].name));
});
