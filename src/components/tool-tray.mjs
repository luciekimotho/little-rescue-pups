import { icon } from "../artwork/art.mjs";
import { currentMission, choices } from "../game/game.mjs";
import { missionTeam } from "../game/missions.mjs";

const toolNames = { bridge: "bridge", carrot: "carrot", ladder: "ladder", water: "watering can", bucket: "bucket" };

export function renderToolTray(state) {
    const mission = currentMission(state);
    const { missionIndex, phase } = state.game;
    const step = state.game.completedSteps.length;
    const tiny = state.settings.mode === "tiny";
    let controls;
    if (phase === "celebrate") {
        controls = `<p class="instruction" aria-live="polite">${mission.success}</p><button class="primary" data-action="next" aria-label="${missionIndex === 2 ? "Finish and rest" : "Next adventure"}">${icon(missionIndex === 2 ? "moon" : "arrow")}${missionIndex === 2 ? "All done" : "Let's go"}</button>`;
    } else if (mission.interaction === "place") {
        controls = `<p class="instruction"><span class="target-preview">${icon(mission.tool)}</span>${tiny ? "A carrot for bunny!" : "Carrot to the bowl!"}</p>
            ${tiny ? `<button class="primary help-button placement-tool" data-placement-tool="${mission.tool}" aria-label="Give bunny a carrot"><span class="tool-on-button">${icon(mission.tool)}</span>Help bunny</button>` :
                `<div class="choice-row">${choices(state).map(tool => `<button class="choice placement-tool" data-placement-tool="${tool}" aria-pressed="false" aria-label="${toolNames[tool]}">${icon(tool)}</button>`).join("")}</div>`}
            <p class="parent-hint" aria-live="polite" id="encouragement">${step ? mission.progress[step - 1] : tiny ? "Tap the carrot, or carry it to the bowl." : "Drag to the bowl, or tap a picture then the bowl."}</p>`;
    } else if (tiny) {
        controls = `<p class="instruction" aria-live="polite">${step ? mission.progress[step - 1] : `Help ${missionTeam(mission)}!`}</p><button class="primary help-button nudge" data-action="help" aria-label="Help the ${mission.id === "flowers" ? "flowers" : mission.id === "ducks" ? "ducklings" : mission.id}"><span class="tool-on-button">${icon(mission.tool)}</span>Tap to help</button><p class="parent-hint">Anywhere on the game works. A letter key works too.</p>`;
    } else {
        controls = `<p class="instruction"><span class="target-preview">${icon(mission.tool)}</span>${mission.prompt}</p><div class="choice-row">${choices(state).map(tool => `<button class="choice" data-action="choose" data-tool="${tool}" aria-label="${toolNames[tool]}">${icon(tool)}</button>`).join("")}</div><p class="parent-hint" aria-live="polite" id="encouragement">${step ? mission.progress[step - 1] : "Same picture. A little help."}</p>`;
    }
    return `<div class="task-panel">${controls}</div>`;
}
