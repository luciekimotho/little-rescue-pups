import { newGame, validGame } from "./game.mjs";
import { MISSIONS } from "./missions.mjs";

export const PROFILES = {
    eden: { name: "Eden", pup: "skye", mode: "tiny" },
    ethan: { name: "Ethan", pup: "chase", mode: "find" },
};

export function validProfileId(id) {
    return Object.hasOwn(PROFILES, id);
}

export function newProfile(id) {
    if (!validProfileId(id)) throw new Error("Choose Eden or Ethan to play.");
    return {
        revision: 0,
        settings: { mode: PROFILES[id].mode, voice: true, sound: true, motion: true },
        game: newGame(),
        history: {},
        outingsCompleted: 0,
    };
}

export const DEFAULT_STATE = {
    version: 2,
    profiles: { eden: newProfile("eden"), ethan: newProfile("ethan") },
};

const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0;

export function validProfile(profile) {
    return record(profile) && count(profile.revision) && count(profile.outingsCompleted) &&
        record(profile.settings) && ["tiny", "find"].includes(profile.settings.mode) &&
        ["voice", "sound", "motion"].every(key => typeof profile.settings[key] === "boolean") &&
        validGame(profile.game) && record(profile.history) &&
        Object.entries(profile.history).every(([id, total]) => MISSIONS.some(mission => mission.id === id) && count(total));
}

export function validState(state) {
    return record(state) && state.version === 2 && record(state.profiles) &&
        Object.keys(state.profiles).length === Object.keys(PROFILES).length &&
        Object.keys(PROFILES).every(id => validProfile(state.profiles[id]));
}
