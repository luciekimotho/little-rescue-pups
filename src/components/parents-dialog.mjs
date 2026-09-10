import { icon } from "../artwork/art.mjs";
import { MISSIONS } from "../game/missions.mjs";
import { PROFILES } from "../game/profiles.mjs";

export function createParentsPanel(dialog) {
    function updateProfile(selectedProfile, state) {
        if (!dialog.open || !state) return;
        dialog.querySelectorAll("[data-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mode === state.settings.mode)));
        dialog.querySelectorAll("[data-setting]").forEach(input => { input.checked = state.settings[input.dataset.setting]; });
        const history = dialog.querySelector("#profile-history");
        if (history) history.innerHTML = `<h3>${PROFILES[selectedProfile].name}'s rescues</h3><p>${state.outingsCompleted} outings finished.</p><ul>${MISSIONS.map(mission => `<li>${mission.title}: ${state.history[mission.id] ?? 0}</li>`).join("")}</ul>`;
    }

    function updateVoiceStatus(text) {
        const status = dialog.querySelector("#voice-status");
        if (status) status.textContent = text;
    }

    function updatePwaControls(status) {
        if (!dialog.open) return;
        dialog.querySelector("#offline-status").textContent = status.offline;
        dialog.querySelector("#install-status").textContent = status.install;
        dialog.querySelector('[data-action="install"]').hidden = !status.installAvailable;
        dialog.querySelector('[data-action="update"]').hidden = !status.updateAvailable;
        dialog.querySelector("#update-note").hidden = !status.updateAvailable;
    }

    function show({ selectedProfile, state, voiceStatus, pwaStatus }) {
        dialog.innerHTML = `<div class="dialog-top"><h2 id="parents-title">For grown-ups</h2><button class="quiet-button" data-action="close-parents" aria-label="Close grown-up settings">${icon("close")}</button></div>
        <p id="parent-notice" role="alert" hidden></p>
        <p>${selectedProfile ? `${PROFILES[selectedProfile].name}'s settings and progress. ` : "Choose Eden or Ethan to change their own settings. "}One short outing has three little rescues. No timer, scores or wrong-answer sounds.</p>
        ${state ? `<div id="profile-controls">
        <div class="mode-options" role="group" aria-label="Play style">
            <button class="mode-option" data-action="mode" data-mode="tiny" aria-pressed="${state.settings.mode === "tiny"}"><b>Little paws</b><span>Assisted play.<br>Tap to help, or drag with a generous target.</span></button>
            <button class="mode-option" data-action="mode" data-mode="find" aria-pressed="${state.settings.mode === "find"}"><b>Clever paws</b><span>Choose and help.<br>Match pictures. Bring bunny's carrot to the bowl.</span></button>
        </div>
        <label class="setting">Spoken prompts<input data-setting="voice" type="checkbox" ${state.settings.voice ? "checked" : ""}></label>
        <label class="setting">Gentle sounds<input data-setting="sound" type="checkbox" ${state.settings.sound ? "checked" : ""}></label>
        <label class="setting">Little animations<input data-setting="motion" type="checkbox" ${state.settings.motion ? "checked" : ""}></label>
        <div class="profile-history" id="profile-history"></div>
        </div>` : ""}
        <div class="dialog-actions"><button data-action="home">Choose player</button><button data-action="close-parents" class="resume">Back to pups</button></div>
        <section class="device-info" aria-labelledby="device-title">
            <h3 id="device-title">This device</h3>
            <p>Eden and Ethan each have their own save and settings in this browser. The chooser opens every time the app opens. There is no device sync. Private browsing or clearing site data can erase progress.</p>
            <p id="voice-status"></p>
            <p id="offline-status" role="status"></p>
            <p id="install-status"></p>
            <div class="device-actions"><button data-action="install" hidden>Install on this device</button><button data-action="update" hidden>Update and reopen</button></div>
            <p id="update-note" hidden>A new version is ready. Update when the children are finished. Your saved progress and settings will stay.</p>
        </section>
        <p class="privacy-note">An unofficial PAW Patrol fan game with original drawings. Not affiliated with or endorsed by the rights holders. No official artwork, recordings or character voices. No ads, accounts, microphones, analytics or external game assets.</p>`;
        dialog.showModal();
        updateProfile(selectedProfile, state);
        updateVoiceStatus(voiceStatus);
        updatePwaControls(pwaStatus);
    }

    return { show, updateProfile, updateVoiceStatus, updatePwaControls };
}
