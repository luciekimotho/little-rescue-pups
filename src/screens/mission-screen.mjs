import { sceneArt } from "../artwork/art.mjs";
import { currentMission } from "../game/game.mjs";
import { missionTeam } from "../game/missions.mjs";
import { renderRescueProgress, renderStepProgress } from "../components/rescue-progress.mjs";
import { renderToolTray } from "../components/tool-tray.mjs";

export function renderMission(state) {
    const mission = currentMission(state);
    const step = state.game.completedSteps.length;
    const done = state.game.phase === "celebrate";
    const tiny = state.settings.mode === "tiny";
    const placing = mission.interaction === "place";
    return `<main class="${done ? "celebrate" : "playing"}">
        <div class="mission-top"><div><p class="eyebrow">${missionTeam(mission)} at ${mission.place}</p><h1>${mission.title}</h1></div>
        ${renderRescueProgress(state)}</div>
        <div class="world ${placing ? "placement-world" : ""} ${tiny && !done && !placing ? "tappable" : ""}" ${tiny && !done && !placing ? 'data-action="help"' : ""}>
            ${placing ? sceneArt(mission, step).replace('class="landscape"', 'class="landscape placement-scene"') : sceneArt(mission, step)}
            ${placing && !done ? mission.targets.map(target => `<button class="drop-target" data-drop-target="${target.id}" aria-label="${target.label}, place selected picture here"></button>`).join("") : ""}
            ${done ? `<div class="success-caption">${mission.thanks}</div><div class="sparkles">${Array.from({ length: 12 }, (_, i) => `<span style="--x:${12 + i * 7}%;--delay:${i % 4 * .1}s"></span>`).join("")}</div>` : renderStepProgress(state)}
        </div>
        ${renderToolTray(state)}</main>`;
}
