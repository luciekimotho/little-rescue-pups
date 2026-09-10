export const PUPS = {
    chase: { name: "Chase", color: "#2463c4", role: "Police pup" },
    marshall: { name: "Marshall", color: "#e84343", role: "Firefighter pup" },
    skye: { name: "Skye", color: "#e267a4", role: "Flying pup" },
    rubble: { name: "Rubble", color: "#edb52e", role: "Builder pup" },
    rocky: { name: "Rocky", color: "#4e9b53", role: "Recycling pup" },
    zuma: { name: "Zuma", color: "#ed8c32", role: "Water rescue pup" },
};

export const MISSIONS = [
    {
        id: "bunny", version: 1, interaction: "place",
        title: "A snack for bunny", prompt: "Bring the carrot to the bowl.",
        tool: "carrot", distractors: ["ladder", "bucket"], pup: "skye",
        steps: ["first-carrot", "second-carrot", "third-carrot"],
        progress: ["One carrot for bunny!", "Another tasty carrot!", "A happy bunny!"],
        success: "You and Skye brought bunny a snack!", thanks: "Skye says thank you!",
        place: "Adventure Bay garden",
        targets: [{ id: "bowl", label: "Bunny's bowl", x: 435, y: 325, width: 245, height: 140 }],
        targetId: "bowl",
    },
    {
        id: "ducks", version: 1, interaction: "help",
        title: "A bridge for the ducklings", prompt: "Find the bridge.",
        tool: "bridge", distractors: ["carrot", "water"], pup: "chase", buddy: "rubble",
        steps: ["first-plank", "second-plank", "third-plank"],
        progress: ["One plank!", "Two planks!", "A bridge!"],
        success: "You and Chase helped the ducklings cross!", thanks: "Chase and Rubble say thank you!",
        place: "Adventure Bay pond",
    },
    {
        id: "kitten", version: 1, interaction: "help",
        title: "A lift for kitten", prompt: "Find the ladder.",
        tool: "ladder", distractors: ["water", "carrot"], pup: "marshall",
        steps: ["first-rung", "second-rung", "third-rung"],
        progress: ["One step!", "Two steps!", "Three steps!"],
        success: "You and Marshall helped kitten climb down!", thanks: "Marshall says thank you!",
        place: "Adventure Bay park",
    },
    {
        id: "flowers", version: 1, interaction: "help",
        title: "A drink for the flowers", prompt: "Find the watering can.",
        tool: "water", distractors: ["bucket", "bridge"], pup: "rocky",
        steps: ["pink-flower", "yellow-flower", "purple-flower"],
        progress: ["A little drink!", "Another little drink!", "Happy flowers!"],
        success: "You and Rocky helped the flowers grow!", thanks: "Rocky says thank you!",
        place: "Adventure Bay garden",
    },
    {
        id: "turtle", version: 1, interaction: "help",
        title: "A path for turtle", prompt: "Find the bucket.",
        tool: "bucket", distractors: ["bridge", "ladder"], pup: "zuma",
        steps: ["first-scoop", "second-scoop", "third-scoop"],
        progress: ["One scoop!", "Two scoops!", "A clear path!"],
        success: "You and Zuma helped turtle reach the sea!", thanks: "Zuma says thank you!",
        place: "Adventure Bay beach",
    },
];

export function missionById(id) {
    const mission = MISSIONS.find(item => item.id === id);
    if (!mission) throw new Error("This rescue is not available in this version of the game.");
    return mission;
}

export function missionTeam(mission) {
    return [mission.pup, ...(mission.buddy ? [mission.buddy] : [])].map(id => PUPS[id].name).join(" and ");
}

export function outingAfter(previousId = null) {
    const first = previousId === null ? 0 : MISSIONS.findIndex(mission => mission.id === previousId) + 1;
    if (previousId !== null && first === 0) throw new Error("The last rescue is not available in this version.");
    return Array.from({ length: 3 }, (_, offset) => {
        const mission = MISSIONS[(first + offset) % MISSIONS.length];
        return { id: mission.id, version: mission.version };
    });
}

export function validMissions(missions) {
    if (!Array.isArray(missions) || missions.length < 3 || new Set(missions.map(mission => mission?.id)).size !== missions.length) return false;
    return missions.every(mission => typeof mission.id === "string" && mission.id.length > 0 &&
        Number.isSafeInteger(mission.version) && mission.version > 0 &&
        ["help", "place"].includes(mission.interaction) && Boolean(PUPS[mission.pup]) &&
        (!mission.buddy || Boolean(PUPS[mission.buddy])) &&
        ["title", "prompt", "tool", "success", "thanks", "place"].every(key => typeof mission[key] === "string" && mission[key].length > 0) &&
        Array.isArray(mission.steps) && mission.steps.length > 0 &&
        mission.steps.every(step => typeof step === "string" && step.length > 0) &&
        new Set(mission.steps).size === mission.steps.length &&
        Array.isArray(mission.progress) && mission.progress.length === mission.steps.length &&
        mission.progress.every(text => typeof text === "string") &&
        Array.isArray(mission.distractors) && mission.distractors.length === 2 &&
        new Set([mission.tool, ...mission.distractors]).size === 3 &&
        (mission.interaction !== "place" || (Array.isArray(mission.targets) &&
            mission.targets.some(target => target.id === mission.targetId) &&
            new Set(mission.targets.map(target => target.id)).size === mission.targets.length &&
            mission.targets.every(target => typeof target.id === "string" && typeof target.label === "string" &&
                [target.x, target.y, target.width, target.height].every(Number.isFinite) &&
                target.width > 0 && target.height > 0 && target.x >= 0 && target.y >= 0 &&
                target.x + target.width <= 1000 && target.y + target.height <= 500))));
}

if (!validMissions(MISSIONS)) throw new Error("The rescue definitions are invalid.");
