import { icon } from "../artwork/art.mjs";
import { currentMission } from "../game/game.mjs";

export function renderRescueProgress(state) {
    const { missionIndex, phase, outing } = state.game;
    const done = phase === "celebrate";
    const progress = outing.map((_, i) => `<span class="trail-paw ${i < missionIndex || (done && i === missionIndex) ? "done" : i === missionIndex ? "current" : ""}">${icon("paw")}</span>`).join("");
    return `<div class="adventure-trail" aria-label="Adventure ${missionIndex + 1} of ${outing.length}">${progress}</div>`;
}

export function renderStepProgress(state) {
    const mission = currentMission(state);
    const step = state.game.completedSteps.length;
    return `<div class="scene-step" role="img" aria-label="${step} of ${mission.steps.length} helpful actions">${mission.steps.map((_, i) => `<span class="step-dot ${step > i ? "filled" : ""}"></span>`).join("")}</div>`;
}
