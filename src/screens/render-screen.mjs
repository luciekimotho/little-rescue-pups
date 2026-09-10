import { renderHeader } from "../components/app-header.mjs";
import { renderFooter } from "../components/app-footer.mjs";
import { renderChooser } from "./chooser-screen.mjs";
import { renderMission } from "./mission-screen.mjs";
import { renderRest } from "./rest-screen.mjs";

export function renderGame(savedState, selectedProfile) {
    const state = selectedProfile ? savedState.profiles[selectedProfile] : null;
    const screen = !state ? renderChooser(savedState) : state.game.phase === "rest" ? renderRest() : renderMission(state);
    return `<div class="shell">${renderHeader(state, selectedProfile)}${screen}${renderFooter(state)}</div>`;
}
