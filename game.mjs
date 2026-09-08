export const PUPS = {
    chase: { name: "Chase", color: "#2463c4", role: "Police pup" },
    marshall: { name: "Marshall", color: "#e84343", role: "Firefighter pup" },
    skye: { name: "Skye", color: "#e267a4", role: "Flying pup" },
    rubble: { name: "Rubble", color: "#edb52e", role: "Builder pup" },
    rocky: { name: "Rocky", color: "#4e9b53", role: "Recycling pup" },
    zuma: { name: "Zuma", color: "#ed8c32", role: "Water rescue pup" },
};

export function missionTeam(mission) {
    return [mission.pup, ...(mission.buddy ? [mission.buddy] : [])].map(id => PUPS[id].name).join(" and ");
}

export const MISSIONS = [
    { id: "ducks", title: "A bridge for the ducklings", prompt: "Find the bridge.", tool: "bridge", distractors: ["carrot", "water"], pup: "chase", buddy: "rubble", progress: ["One plank!", "Two planks!", "A bridge!"], success: "You and Chase helped the ducklings cross!", thanks: "Chase and Rubble say thank you!", place: "Adventure Bay pond" },
    { id: "bunny", title: "A snack for bunny", prompt: "Find the carrot.", tool: "carrot", distractors: ["ladder", "bucket"], pup: "skye", progress: ["One carrot!", "Two carrots!", "Three carrots!"], success: "You and Skye brought bunny a snack!", thanks: "Skye says thank you!", place: "Adventure Bay garden" },
    { id: "kitten", title: "A lift for kitten", prompt: "Find the ladder.", tool: "ladder", distractors: ["water", "carrot"], pup: "marshall", progress: ["One step!", "Two steps!", "Three steps!"], success: "You and Marshall helped kitten climb down!", thanks: "Marshall says thank you!", place: "Adventure Bay park" },
    { id: "flowers", title: "A drink for the flowers", prompt: "Find the watering can.", tool: "water", distractors: ["bucket", "bridge"], pup: "rocky", progress: ["A little drink!", "Another little drink!", "Happy flowers!"], success: "You and Rocky helped the flowers grow!", thanks: "Rocky says thank you!", place: "Adventure Bay garden" },
    { id: "turtle", title: "A path for turtle", prompt: "Find the bucket.", tool: "bucket", distractors: ["bridge", "ladder"], pup: "zuma", progress: ["One scoop!", "Two scoops!", "A clear path!"], success: "You and Zuma helped turtle reach the sea!", thanks: "Zuma says thank you!", place: "Adventure Bay beach" },
];

export const DEFAULT_STATE = {
    version: 1,
    settings: { mode: "tiny", voice: true, sound: true, motion: true },
    game: { phase: "welcome", round: 0, missionIndex: 0, step: 0 },
};

export function validState(state) {
    if (!state || state.version !== 1 || !state.settings || !state.game) return false;
    const { mode, voice, sound, motion } = state.settings;
    const { phase, round, missionIndex, step } = state.game;
    return ["tiny", "find"].includes(mode) &&
        [voice, sound, motion].every(value => typeof value === "boolean") &&
        ["welcome", "playing", "celebrate", "rest"].includes(phase) &&
        Number.isSafeInteger(round) && round >= 0 &&
        Number.isInteger(missionIndex) && missionIndex >= 0 && missionIndex < 3 &&
        Number.isInteger(step) && step >= 0 && step <= 3 &&
        (phase !== "playing" || step < 3) && (phase !== "celebrate" || step === 3);
}

export function currentMission(state) {
    return MISSIONS[(state.game.round * 3 + state.game.missionIndex) % MISSIONS.length];
}

export function choices(state) {
    const mission = currentMission(state);
    const result = [mission.tool, ...mission.distractors];
    const offset = (state.game.step + state.game.missionIndex + state.game.round) % 3;
    return [...result.slice(offset), ...result.slice(0, offset)];
}

export function transition(previous, action) {
    if (!action || typeof action !== "object") throw new Error("An action is required.");
    const state = structuredClone(previous);
    const game = state.game;
    let feedback = "none";
    if (action.type === "start") {
        if (game.phase !== "welcome" && game.phase !== "rest") return { state, feedback };
        if (game.phase === "rest") game.round += 1;
        Object.assign(game, { phase: "playing", missionIndex: 0, step: 0 });
        feedback = "start";
    } else if (action.type === "help") {
        if (game.phase !== "playing") return { state, feedback };
        if (state.settings.mode === "find" && action.tool !== currentMission(state).tool) {
            return { state, feedback: "hint" };
        }
        game.step += 1;
        game.phase = game.step === 3 ? "celebrate" : "playing";
        feedback = game.phase === "celebrate" ? "success" : "help";
    } else if (action.type === "next") {
        if (game.phase !== "celebrate") return { state, feedback };
        if (game.missionIndex === 2) {
            game.phase = "rest";
            feedback = "rest";
        } else {
            Object.assign(game, { phase: "playing", missionIndex: game.missionIndex + 1, step: 0 });
            feedback = "start";
        }
    } else if (action.type === "settings") {
        const settings = action.settings;
        if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Settings must be an object.");
        for (const [key, value] of Object.entries(settings)) {
            if (key === "mode" && ["tiny", "find"].includes(value)) state.settings.mode = value;
            else if (["voice", "sound", "motion"].includes(key) && typeof value === "boolean") state.settings[key] = value;
            else throw new Error("Unknown setting or invalid setting value.");
        }
        feedback = "settings";
    } else if (action.type === "home") {
        game.phase = "welcome";
        game.missionIndex = 0;
        game.step = 0;
        feedback = "home";
    } else {
        throw new Error("Unknown game action.");
    }
    if (!validState(state)) throw new Error("The game state is invalid.");
    return { state, feedback };
}
