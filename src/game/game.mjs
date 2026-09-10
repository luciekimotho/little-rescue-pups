import { MISSIONS, missionById, outingAfter } from "./missions.mjs";
export { PUPS, MISSIONS, missionTeam } from "./missions.mjs";

export function newGame(previousId = null) {
    return { phase: "ready", outing: outingAfter(previousId), missionIndex: 0, completedSteps: [] };
}

export function currentMission(profile) {
    return missionById(profile.game.outing[profile.game.missionIndex].id);
}

export function currentStep(profile) {
    return currentMission(profile).steps[profile.game.completedSteps.length] ?? null;
}

export function choices(profile) {
    const mission = currentMission(profile);
    const tools = [mission.tool, ...mission.distractors];
    const offset = (profile.game.completedSteps.length + profile.game.missionIndex) % tools.length;
    return [...tools.slice(offset), ...tools.slice(0, offset)];
}

export function validGame(game) {
    if (!game || !["ready", "playing", "celebrate", "rest"].includes(game.phase) ||
        !Array.isArray(game.outing) || game.outing.length !== 3 ||
        !Number.isInteger(game.missionIndex) || game.missionIndex < 0 || game.missionIndex >= game.outing.length ||
        !Array.isArray(game.completedSteps)) return false;
    if (!game.outing.every(entry => entry && MISSIONS.some(mission => mission.id === entry.id && mission.version === entry.version))) return false;
    const mission = missionById(game.outing[game.missionIndex].id);
    const completed = game.completedSteps;
    if (completed.length > mission.steps.length || !completed.every((step, i) => step === mission.steps[i])) return false;
    if (game.phase === "ready") return game.missionIndex === 0 && completed.length === 0;
    if (game.phase === "playing") return completed.length < mission.steps.length;
    if (game.phase === "rest") return game.missionIndex === game.outing.length - 1 && completed.length === mission.steps.length;
    return completed.length === mission.steps.length;
}

export class StaleActionError extends Error {
    constructor() {
        super("This rescue changed in another tab. Its latest progress has been loaded. Please try again.");
        this.name = "StaleActionError";
        this.code = "conflict";
    }
}

export function actionContext(profile) {
    const mission = currentMission(profile);
    return { revision: profile.revision, missionId: mission.id, missionVersion: mission.version, stepId: currentStep(profile) };
}

// The profile is already validated by storage. No DOM, audio or storage work belongs here.
export function transition(previous, action) {
    if (!action || typeof action !== "object") throw new Error("An action is required.");
    const context = actionContext(previous);
    if (["revision", "missionId", "missionVersion", "stepId"].some(key => action[key] !== context[key])) throw new StaleActionError();
    const state = structuredClone(previous);
    const game = state.game;
    const mission = currentMission(state);
    let feedback = "none";
    if (action.type === "start") {
        if (game.phase === "ready") {
            game.phase = "playing";
            feedback = "start";
        }
    } else if (action.type === "help" || action.type === "place") {
        if (game.phase !== "playing") return { state, feedback };
        if (mission.interaction === "place") {
            if (action.type !== "place" || action.tool !== mission.tool || action.targetId !== mission.targetId) return { state, feedback: "hint" };
        } else if (action.type !== "help" || (state.settings.mode === "find" && action.tool !== mission.tool)) {
            return { state, feedback: "hint" };
        }
        game.completedSteps.push(currentStep(state));
        if (game.completedSteps.length === mission.steps.length) {
            game.phase = "celebrate";
            state.history[mission.id] = (state.history[mission.id] ?? 0) + 1;
            feedback = "success";
        } else {
            feedback = "help";
        }
    } else if (action.type === "next") {
        if (game.phase !== "celebrate") return { state, feedback };
        if (game.missionIndex === game.outing.length - 1) {
            game.phase = "rest";
            feedback = "rest";
        } else {
            Object.assign(game, { phase: "playing", missionIndex: game.missionIndex + 1, completedSteps: [] });
            feedback = "start";
        }
    } else if (action.type === "goodbye") {
        if (game.phase !== "rest") return { state, feedback };
        state.game = newGame(mission.id);
        state.outingsCompleted += 1;
        feedback = "goodbye";
    } else if (action.type === "settings") {
        if (!action.settings || typeof action.settings !== "object" || Array.isArray(action.settings)) throw new Error("Settings must be an object.");
        for (const [key, value] of Object.entries(action.settings)) {
            if (key === "mode" && ["tiny", "find"].includes(value)) state.settings.mode = value;
            else if (["voice", "sound", "motion"].includes(key) && typeof value === "boolean") state.settings[key] = value;
            else throw new Error("Unknown setting or invalid setting value.");
        }
        feedback = "settings";
    } else {
        throw new Error("Unknown game action.");
    }
    if (JSON.stringify(state) !== JSON.stringify(previous)) state.revision += 1;
    if (!validGame(state.game)) throw new Error("The rescue progress is invalid.");
    return { state, feedback };
}
