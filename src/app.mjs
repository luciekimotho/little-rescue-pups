import { currentMission, actionContext } from "./game/game.mjs";
import { validProfileId } from "./game/profiles.mjs";
import { createStore, SaveError } from "./services/storage.mjs";
import { createPwa } from "./services/pwa.mjs";
import { attachPlacement } from "./interactions/placement.mjs";
import { renderGame } from "./screens/render-screen.mjs";
import { createParentsPanel } from "./components/parents-dialog.mjs";
import { createNarration, narrationPrompt } from "./services/narration.mjs";
import { createSoundEffects } from "./services/sound.mjs";

const app = document.querySelector("#app");
const parents = document.querySelector("#parents");
const notice = document.querySelector("#notice");
const store = createStore();
let savedState;
let selectedProfile = null;
let state = null;
let storageReady = false;
let placement;
let busy = false;
let refreshPending = false;
let lockUntil = 0;
let hintTimer;

const parentPanel = createParentsPanel(parents);
const pwa = createPwa(parentPanel.updatePwaControls);
const narration = createNarration({
    getSettings: () => state?.settings,
    onStatusChange: parentPanel.updateVoiceStatus,
});
const sound = createSoundEffects({ getSettings: () => state?.settings });
const { say, stop: stopSpeech } = narration;
const { chime } = sound;

function unlockAudio() {
    narration.refreshVoice();
    sound.unlock();
}

function render() {
    const focusTool = document.activeElement?.dataset?.placementTool;
    const focusTarget = document.activeElement?.dataset?.dropTarget;
    placement?.destroy();
    placement = undefined;
    clearTimeout(hintTimer);
    document.body.classList.toggle("motion-off", state ? !state.settings.motion : false);
    app.innerHTML = renderGame(savedState, selectedProfile);
    if (state?.game.phase === "playing" && currentMission(state).interaction === "place") {
        const profileId = selectedProfile;
        const context = actionContext(state);
        placement = attachPlacement({
            root: app.querySelector("main"), assisted: state.settings.mode === "tiny",
            targets: currentMission(state).targets, canInteract, onInteract: unlockAudio,
            onPlace: action => send({ ...action, ...context }, profileId),
            onFeedback: text => {
                showHint();
                const encouragement = app.querySelector("#encouragement");
                if (encouragement) encouragement.textContent = text;
            },
        });
    }
    if (state?.game.phase === "playing" && state.settings.mode === "find" && !parents.open && !document.hidden) {
        hintTimer = setTimeout(showHint, 6000);
    }
    if (focusTool || focusTarget) {
        const nextFocus = focusTool ? [...app.querySelectorAll("[data-placement-tool]")].find(button => button.dataset.placementTool === focusTool)
            : [...app.querySelectorAll("[data-drop-target]")].find(button => button.dataset.dropTarget === focusTarget);
        (nextFocus || app.querySelector('[data-action="next"]'))?.focus({ preventScroll: true });
    }
}

function showHint() {
    if (parents.open || document.hidden || state?.game.phase !== "playing") return;
    const correct = document.querySelector(`[data-tool="${currentMission(state).tool}"], [data-placement-tool="${currentMission(state).tool}"]`);
    if (correct) correct.classList.add("hint", "nudge");
    app.querySelector("[data-drop-target]")?.classList.add("hint");
}

function prompt() {
    return narrationPrompt(state);
}

function setBusy(value) {
    busy = value;
    app.setAttribute("aria-busy", String(value));
    document.querySelectorAll("button, input").forEach(element => { element.disabled = value; });
}

function showError(error) {
    for (const target of [notice, parents.querySelector("#parent-notice")].filter(Boolean)) {
        target.textContent = `Grown-up help needed: ${error.message}`;
        target.hidden = false;
        if (error instanceof SaveError && error.code === "corrupt") {
            const reset = document.createElement("button");
            reset.textContent = "Reset this device's profile saves";
            reset.addEventListener("click", async () => {
                if (!confirm("Reset these damaged saves? Eden and Ethan's progress and settings on this device will be lost. Other devices and the original Copilot game are not affected.")) return;
                try {
                    await store.resetInvalid(error.raw);
                    load();
                } catch (resetError) {
                    showError(resetError);
                }
            });
            target.append(reset);
        }
    }
}

function clearError() {
    notice.hidden = true;
    const parentNotice = parents.querySelector("#parent-notice");
    if (parentNotice) parentNotice.hidden = true;
}

async function send(action, profileId = selectedProfile, selecting = false) {
    if (busy || !storageReady || !validProfileId(profileId)) return false;
    if (!selecting && profileId !== selectedProfile) return false;
    const context = actionContext(savedState.profiles[profileId]);
    setBusy(true);
    clearError();
    try {
        const result = await store.dispatch(profileId, { ...context, ...action });
        savedState = result.state;
        selectedProfile = profileId;
        state = savedState.profiles[profileId];
        if (result.feedback === "goodbye") {
            say("Bye bye, little helper!");
            chime();
            selectedProfile = null;
            state = null;
        }
        render();
        parentPanel.updateProfile(selectedProfile, state);
        if (result.feedback === "hint") {
            showHint();
            say(currentMission(state).prompt);
            const encouragement = document.querySelector("#encouragement");
            if (encouragement) encouragement.textContent = "Look for the glowing picture.";
        } else if (result.feedback === "help") {
            lockUntil = performance.now() + 650;
            chime();
            say(currentMission(state).progress[state.game.completedSteps.length - 1]);
        } else if (result.feedback === "success") {
            lockUntil = performance.now() + 1400;
            chime(true);
            say(prompt());
        } else if (["start", "rest"].includes(result.feedback)) {
            lockUntil = performance.now() + 650;
            say(prompt());
        } else if (result.feedback === "settings") {
            if (!state.settings.voice) stopSpeech();
            await sound.applySettings();
        } else if (result.feedback === "goodbye") {
            lockUntil = performance.now() + 650;
        }
        return true;
    } catch (error) {
        if (error.code === "conflict") load();
        showError(error);
        parentPanel.updateProfile(selectedProfile, state);
        return false;
    } finally {
        setBusy(false);
        if (refreshPending) { refreshPending = false; load(); }
    }
}

function showParents() {
    placement?.cancel();
    clearTimeout(hintTimer);
    stopSpeech();
    parentPanel.show({ selectedProfile, state, voiceStatus: narration.status(), pwaStatus: pwa.getStatus() });
    if (!notice.hidden) parents.querySelector("#parent-notice").textContent = notice.textContent;
    parents.querySelector("#parent-notice").hidden = notice.hidden;
    void pwa.refresh();
}

function closeParents() {
    parents.close();
    lockUntil = performance.now() + 350;
    render();
    say(prompt());
}

function canInteract() {
    return storageReady && Boolean(state) && !busy && !parents.open && !document.hidden && performance.now() >= lockUntil;
}

function play(action, tool) {
    if (!canInteract()) return;
    unlockAudio();
    send({ type: action === "choose" ? "help" : action, ...(tool ? { tool } : {}) });
}

function returnToChooser() {
    if (busy) return;
    stopSpeech();
    parents.close();
    selectedProfile = null;
    state = null;
    lockUntil = performance.now() + 350;
    render();
}

async function chooseProfile(id) {
    if (busy || parents.open || performance.now() < lockUntil) return;
    if (!validProfileId(id)) { showError(new Error("Choose Eden or Ethan to play.")); return; }
    try {
        clearError();
        savedState = store.load();
        storageReady = true;
        if (savedState.profiles[id].game.phase === "ready") {
            if (!await send({ type: "start" }, id, true)) return;
        } else {
            selectedProfile = id;
            state = savedState.profiles[id];
            render();
            lockUntil = performance.now() + 650;
        }
        unlockAudio();
        say(prompt());
    } catch (error) {
        storageReady = false;
        showError(error);
    }
}

document.addEventListener("click", async event => {
    if (!savedState || busy) return;
    if (event.target.closest("[data-placement-tool], [data-drop-target]")) return;
    const control = event.target.closest("[data-action]");
    if (control) {
        const action = control.dataset.action;
        if (action === "parents") { showParents(); return; }
        if (action === "close-parents") { closeParents(); return; }
        if (action === "profile") { await chooseProfile(control.dataset.profile); return; }
        if (action === "home") { returnToChooser(); return; }
        if (action === "install" || action === "update") {
            if (busy) return;
            try {
                if (action === "install") await pwa.install();
                else pwa.applyUpdate();
            } catch (error) { showError(error); }
            return;
        }
        if (action === "mode") { await send({ type: "settings", settings: { mode: control.dataset.mode } }); return; }
        if (action === "sound") {
            unlockAudio();
            const enabled = !(state.settings.sound || state.settings.voice);
            await send({ type: "settings", settings: { voice: enabled, sound: enabled } });
            if (enabled) { unlockAudio(); say(prompt()); }
            return;
        }
        play(action, control.dataset.tool);
        return;
    }
    if (parents.open || !state || !event.target.closest("main")) return;
    if (state.game.phase === "playing" && currentMission(state).interaction === "place") return;
    if (state.settings.mode === "tiny") {
        play(state.game.phase === "playing" ? "help" : state.game.phase === "celebrate" ? "next" : "goodbye");
    }
});

parents.addEventListener("change", async event => {
    if (event.target.dataset.setting) await send({ type: "settings", settings: { [event.target.dataset.setting]: event.target.checked } });
});
parents.addEventListener("cancel", event => { event.preventDefault(); closeParents(); });

document.addEventListener("keydown", event => {
    if (event.defaultPrevented || !savedState || parents.open) return;
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
        if (["Enter", " "].includes(event.key) && event.target.closest("button")) event.preventDefault();
        return;
    }
    if (event.key === "Escape") { showParents(); return; }
    if (event.key === "Tab" || event.key === "Shift") return;
    const focused = event.target.closest("button, input");
    if (focused && ["Enter", " "].includes(event.key)) return;
    if (!state) return;
    const isPlayKey = event.key.length === 1 || ["Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key);
    if (!isPlayKey) return;
    if (state.game.phase === "playing" && state.settings.mode === "find") return;
    event.preventDefault();
    if (state.game.phase === "playing" && currentMission(state).interaction === "place") {
        if (canInteract()) {
            unlockAudio();
            send({ type: "place", tool: currentMission(state).tool, targetId: currentMission(state).targetId });
        }
        return;
    }
    play({ playing: "help", celebrate: "next", rest: "goodbye" }[state.game.phase]);
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stopSpeech(); placement?.cancel(); clearTimeout(hintTimer); }
    else if (savedState) {
        if (busy) refreshPending = true;
        else load();
    }
});
window.addEventListener("pagehide", stopSpeech);
window.addEventListener("pageshow", event => { if (event.persisted) returnToChooser(); });
window.addEventListener("storage", event => {
    if (event.key !== null && event.key !== store.key) return;
    placement?.cancel();
    if (busy) refreshPending = true;
    else load();
});

function load() {
    stopSpeech();
    setBusy(true);
    try {
        savedState = store.load();
        storageReady = true;
        state = selectedProfile ? savedState.profiles[selectedProfile] : null;
        if (state?.game.phase === "ready") {
            selectedProfile = null;
            state = null;
            parents.close();
        }
        render();
        parentPanel.updateProfile(selectedProfile, state);
        clearError();
    } catch (error) {
        storageReady = false;
        placement?.destroy();
        showError(error);
        if (!savedState) app.innerHTML = `<div class="loading"><p>The pups need a grown-up's help to open.</p><button class="primary" id="retry-load">Try again</button></div>`;
        document.querySelector("#retry-load")?.addEventListener("click", load);
    } finally {
        setBusy(false);
    }
}

load();
void pwa.start();
