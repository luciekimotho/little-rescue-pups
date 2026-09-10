import { icon } from "../artwork/art.mjs";
import { PROFILES } from "../game/profiles.mjs";

export function renderHeader(state, selectedProfile) {
    return `<header class="topbar">
        <div class="brand"><span class="brand-mark">${icon("paw")}</span>${selectedProfile ? `${PROFILES[selectedProfile].name}'s rescue` : "PAW Patrol playtime"}</div>
        <div class="toolbar">
            ${state ? `<button class="quiet-button" data-action="home" aria-label="Choose player" title="Choose player">${icon("paw")}</button>
            <button class="quiet-button" data-action="sound" aria-label="${state.settings.voice || state.settings.sound ? "Turn sound off" : "Turn sound on"}" title="Sound">${icon(state.settings.voice || state.settings.sound ? "sound" : "mute")}</button>` : ""}
            <button class="quiet-button" data-action="parents" aria-label="Grown-ups" title="Grown-ups">${icon("parent")}</button>
        </div></header>`;
}
