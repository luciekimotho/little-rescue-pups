import { test } from "node:test";
import assert from "node:assert/strict";
import { actionContext, currentMission, currentStep, choices, transition } from "../../src/game/game.mjs";
import { newProfile, validProfile } from "../../src/game/profiles.mjs";
import { MISSIONS } from "../../src/game/missions.mjs";

const act = (profile, action) => transition(profile, { ...actionContext(profile), ...action });
function help(profile) {
    const mission = currentMission(profile);
    return act(profile, { type: mission.interaction, tool: mission.tool, targetId: mission.targetId }).state;
}

test("starting or resuming preserves settings and never mutates the previous save", () => {
    const initial = newProfile("eden");
    initial.settings = { mode: "find", voice: false, sound: false, motion: false };
    const before = structuredClone(initial);
    const started = act(initial, { type: "start" }).state;
    assert.equal(started.game.phase, "playing");
    assert.deepEqual(started.settings, before.settings);
    assert.deepEqual(initial, before);
    const progressed = help(started);
    assert.deepEqual(act(progressed, { type: "start" }).state, progressed);
});

test("bunny advances only when the carrot is placed in the bowl", () => {
    for (const id of ["eden", "ethan"]) {
        let profile = act(newProfile(id), { type: "start" }).state;
        for (const action of [
            { type: "help" },
            { type: "place", tool: "ladder", targetId: "bowl" },
            { type: "place", tool: "carrot", targetId: "elsewhere" },
        ]) assert.deepEqual(act(profile, action), { state: profile, feedback: "hint" });
        for (let step = 0; step < 3; step++) profile = help(profile);
        assert.equal(profile.game.phase, "celebrate");
        assert.equal(profile.history.bunny, 1);
        assert.deepEqual(act(profile, { type: "place", tool: "carrot", targetId: "bowl" }).state, profile);
    }
});

test("each mode can finish short outings, with correct choices and no lost rescue history", () => {
    for (const id of ["eden", "ethan"]) {
        let profile = newProfile(id);
        const seen = new Set();
        for (let outing = 0; outing < 2; outing++) {
            profile = act(profile, { type: "start" }).state;
            for (let index = 0; index < 3; index++) {
                const mission = currentMission(profile);
                seen.add(mission.id);
                for (const step of mission.steps) {
                    const options = choices(profile);
                    assert.equal(new Set(options).size, 3);
                    assert.ok(options.includes(mission.tool));
                    assert.equal(currentStep(profile), step);
                    if (mission.interaction === "help") {
                        const wrong = act(profile, { type: "help", tool: "wrong" });
                        if (id === "ethan") assert.deepEqual(wrong.state, profile);
                        else assert.equal(wrong.state.game.completedSteps.length, profile.game.completedSteps.length + 1);
                    }
                    profile = help(profile);
                }
                assert.equal(profile.game.phase, "celebrate");
                profile = act(profile, { type: "next" }).state;
            }
            assert.equal(profile.game.phase, "rest");
            profile = act(profile, { type: "goodbye" }).state;
            assert.equal(profile.game.phase, "ready");
            assert.equal(profile.outingsCompleted, outing + 1);
            assert.deepEqual(act(profile, { type: "goodbye" }).state, profile);
            assert.ok(validProfile(profile));
        }
        assert.equal(seen.size, MISSIONS.length);
        assert.equal(Object.values(profile.history).reduce((sum, count) => sum + count, 0), 6);
    }
});

test("an action for another rescue or step is rejected", () => {
    const profile = act(newProfile("ethan"), { type: "start" }).state;
    const action = { ...actionContext(profile), type: "place", tool: "carrot", targetId: "bowl" };
    for (const changed of [{ missionId: "ducks" }, { missionVersion: 9 }, { stepId: "third-carrot" }]) {
        assert.throws(() => transition(profile, { ...action, ...changed }), { code: "conflict" });
    }
});

test("changing settings cannot reset progress or accept invalid preference values", () => {
    const profile = help(act(newProfile("eden"), { type: "start" }).state);
    const settings = { mode: "find", voice: false, sound: false, motion: false };
    const updated = act(profile, { type: "settings", settings }).state;
    assert.deepEqual(updated.settings, settings);
    assert.deepEqual(updated.game, profile.game);
    assert.deepEqual(updated.history, profile.history);
    for (const settings of [null, { mode: "other" }, { sound: "yes" }]) {
        assert.throws(() => act(profile, { type: "settings", settings }));
    }
});
