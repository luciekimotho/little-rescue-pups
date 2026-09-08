import { icon, welcomeArt, sceneArt, crewArt } from "./art.mjs";
import { currentMission, choices, PUPS, missionTeam } from "./game.mjs";
import { createStore, SaveError } from "./storage.mjs";
import { createPwa } from "./pwa.mjs";

const app = document.querySelector("#app");
const parents = document.querySelector("#parents");
const notice = document.querySelector("#notice");
const store = createStore();
const pwa = createPwa(updatePwaControls);
let state;
let busy = false;
let refreshPending = false;
let lockUntil = 0;
let hintTimer;
let audio;
let voice;
let goodbyeCount = 0;
const toolNames = { bridge: "bridge", carrot: "carrot", ladder: "ladder", water: "watering can", bucket: "bucket" };

function chooseVoice() {
    if (!("speechSynthesis" in window)) return;
    const local = speechSynthesis.getVoices().filter(item => item.localService && /^en([-_]|$)/i.test(item.lang));
    voice = local.find(item => /en-(GB|KE)/i.test(item.lang)) || local[0];
    updateVoiceStatus();
}
chooseVoice();
if ("speechSynthesis" in window) speechSynthesis.addEventListener("voiceschanged", chooseVoice);

function stopSpeech() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function say(text) {
    stopSpeech();
    if (!state.settings.voice || !voice || document.hidden) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = .82;
    utterance.pitch = 1.12;
    utterance.volume = .8;
    utterance.onerror = event => {
        if (!["canceled", "interrupted"].includes(event.error)) {
            console.warn("Local spoken prompt unavailable:", event.error);
            const status = parents.querySelector("#voice-status");
            if (status) status.textContent = "The local narrator could not speak. Picture prompts still work.";
        }
    };
    speechSynthesis.speak(utterance);
}

function unlockAudio() {
    chooseVoice();
    if (!state?.settings.sound) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    if (!audio) audio = new Context();
    if (audio.state === "suspended") audio.resume().catch(error => console.warn("Game audio could not resume:", error));
}

function chime(celebrate = false) {
    if (!state.settings.sound || !audio || audio.state !== "running") return;
    const tones = celebrate ? [523.25, 659.25, 783.99] : [523.25, 659.25];
    tones.forEach((frequency, i) => {
        const at = audio.currentTime + i * .15;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(.045, at + .015);
        gain.gain.exponentialRampToValueAtTime(.001, at + .38);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(at);
        oscillator.stop(at + .4);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
}

function header() {
    return `<header class="topbar">
        <div class="brand"><span class="brand-mark">${icon("paw")}</span>PAW Patrol playtime</div>
        <div class="toolbar">
            <button class="quiet-button" data-action="sound" aria-label="${state.settings.voice || state.settings.sound ? "Turn sound off" : "Turn sound on"}" title="Sound">${icon(state.settings.voice || state.settings.sound ? "sound" : "mute")}</button>
            <button class="quiet-button" data-action="parents" aria-label="Grown-ups" title="Grown-ups">${icon("parent")}</button>
        </div></header>`;
}

function footer() {
    return `<footer class="footer">
        <span class="footer-note">${icon("heart")}Adventure Bay's little helpers</span>
        <span class="mode-indicator">${state.settings.mode === "tiny" ? "Little paws \u00b7 tap anywhere" : "Clever paws \u00b7 match pictures"}</span>
    </footer>`;
}

function renderWelcome() {
    return `<main class="welcome">
        <div class="intro"><p class="eyebrow">A little rescue in Adventure Bay</p>
        <h1>Let's help<br><span class="hero-accent">with Chase!</span></h1>
        <p class="subtitle">Chase, Marshall and Skye are ready to play.</p></div>
        <div class="welcome-picture" role="img" aria-label="Marshall in his red firefighter helmet, Chase in his blue police uniform, and Skye with her pink flying goggles, outside the Lookout.">${welcomeArt()}<span class="name-tag marshall">Marshall</span><span class="name-tag chase">Chase</span><span class="name-tag skye">Skye</span></div>
        <div class="start-area"><button class="primary nudge" data-action="start" aria-label="Play with Chase and the rescue pups">${icon("play")}Let's play</button>
        <p class="parent-hint">${state.settings.mode === "tiny" ? "Tap anywhere, click, or press a letter key. Every little help counts." : "Look at the picture. Tap the one that matches."}<br>Grown-ups can change the play style at the top.</p></div>
        <div class="crew-strip" aria-label="More rescue friends">${["rubble", "rocky", "zuma"].map(id => `<div class="crew-member" style="--crew-color:${PUPS[id].color}"><span class="crew-face">${crewArt(id)}</span><span><b>${PUPS[id].name}</b><small>${PUPS[id].role}</small></span></div>`).join("")}</div>
    </main>`;
}

function renderMission() {
    const mission = currentMission(state);
    const { step, missionIndex, phase } = state.game;
    const done = phase === "celebrate";
    const tiny = state.settings.mode === "tiny";
    const progress = [0, 1, 2].map(i => `<span class="trail-paw ${i < missionIndex || (done && i === missionIndex) ? "done" : i === missionIndex ? "current" : ""}">${icon("paw")}</span>`).join("");
    return `<main class="${done ? "celebrate" : "playing"}">
        <div class="mission-top"><div><p class="eyebrow">${missionTeam(mission)} at ${mission.place}</p><h1>${mission.title}</h1></div>
        <div class="adventure-trail" aria-label="Adventure ${missionIndex + 1} of 3">${progress}</div></div>
        <div class="world ${tiny && !done ? "tappable" : ""}" ${tiny && !done ? 'data-action="help"' : ""}>
            ${sceneArt(mission, step)}
            ${done ? `<div class="success-caption">${mission.thanks}</div><div class="sparkles">${Array.from({ length: 12 }, (_, i) => `<span style="--x:${12 + i * 7}%;--delay:${i % 4 * .1}s"></span>`).join("")}</div>` :
            `<div class="scene-step" role="img" aria-label="${step} of 3 helpful taps">${[0, 1, 2].map(i => `<span class="step-dot ${step > i ? "filled" : ""}"></span>`).join("")}</div>`}
        </div>
        <div class="task-panel">
            ${done ? `<p class="instruction" aria-live="polite">${mission.success}</p><button class="primary" data-action="next" aria-label="${missionIndex === 2 ? "Finish and rest" : "Next adventure"}">${icon(missionIndex === 2 ? "moon" : "arrow")}${missionIndex === 2 ? "All done" : "Let's go"}</button>` :
            tiny ? `<p class="instruction" aria-live="polite">${step ? mission.progress[step - 1] : `Help ${missionTeam(mission)}!`}</p><button class="primary help-button nudge" data-action="help" aria-label="Help the ${mission.id === "flowers" ? "flowers" : mission.id === "ducks" ? "ducklings" : mission.id}"><span class="tool-on-button">${icon(mission.tool)}</span>Tap to help</button><p class="parent-hint">Anywhere on the game works. A letter key works too.</p>` :
            `<p class="instruction"><span class="target-preview">${icon(mission.tool)}</span>${mission.prompt}</p><div class="choice-row">${choices(state).map(tool => `<button class="choice" data-action="choose" data-tool="${tool}" aria-label="${toolNames[tool]}">${icon(tool)}</button>`).join("")}</div><p class="parent-hint" aria-live="polite" id="encouragement">${step ? mission.progress[step - 1] : "Same picture. A little help."}</p>`}
        </div></main>`;
}

function renderRest() {
    return `<main class="rest">
        <div class="intro"><p class="eyebrow">Back to the Lookout</p><h1>Happy friends.<br>Sleepy pups.</h1><p class="subtitle">Chase and the team are resting. Time for a cuddle.</p></div>
        <div class="welcome-picture">${welcomeArt(true)}</div>
        <div class="start-area"><button class="primary" data-action="goodbye" aria-label="Wave goodbye to the pups">${icon("paw")}Bye, pups!</button><p class="wave-note" aria-live="polite" id="goodbye-note">You were a kind helper today.</p></div>
    </main>`;
}

function render() {
    clearTimeout(hintTimer);
    document.body.classList.toggle("motion-off", !state.settings.motion);
    app.innerHTML = `<div class="shell">${header()}${state.game.phase === "welcome" ? renderWelcome() : state.game.phase === "rest" ? renderRest() : renderMission()}${footer()}</div>`;
    if (state.game.phase === "playing" && state.settings.mode === "find" && !parents.open && !document.hidden) {
        hintTimer = setTimeout(showHint, 6000);
    }
}

function showHint() {
    if (parents.open || document.hidden || state.game.phase !== "playing") return;
    const correct = document.querySelector(`[data-tool="${currentMission(state).tool}"]`);
    if (correct) correct.classList.add("hint", "nudge");
}

function prompt() {
    if (state.game.phase === "welcome") return "Hi, little helper! Let's play with Chase, Marshall and Skye!";
    if (state.game.phase === "rest") return "You helped all our friends in Adventure Bay. Chase and the pups are resting now. Time for a cuddle. Bye bye!";
    const mission = currentMission(state);
    if (state.game.phase === "celebrate") return `${mission.success} ${state.game.missionIndex === 2 ? "All done!" : "Tap the arrow for another friend."}`;
    return `Let's help ${missionTeam(mission)}! ${mission.title}. ${state.settings.mode === "tiny" ? "Tap anywhere to help!" : mission.prompt}`;
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
            reset.textContent = "Reset this device's save";
            reset.addEventListener("click", async () => {
                if (!confirm("Reset this damaged save? This device's progress and grown-up settings will be lost. The original Copilot game is not affected.")) return;
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

async function send(action) {
    if (busy) return;
    setBusy(true);
    clearError();
    try {
        const result = await store.dispatch(action);
        state = result.state;
        render();
        updateParentControls();
        if (result.feedback === "hint") {
            showHint();
            say(currentMission(state).prompt);
            const encouragement = document.querySelector("#encouragement");
            if (encouragement) encouragement.textContent = "Look for the glowing picture.";
        } else if (result.feedback === "help") {
            lockUntil = performance.now() + 650;
            chime();
            say(currentMission(state).progress[state.game.step - 1]);
        } else if (result.feedback === "success") {
            lockUntil = performance.now() + 1400;
            chime(true);
            say(prompt());
        } else if (["start", "rest"].includes(result.feedback)) {
            lockUntil = performance.now() + 650;
            say(prompt());
        } else if (result.feedback === "settings") {
            if (!state.settings.voice) stopSpeech();
            if (!state.settings.sound && audio?.state === "running") await audio.suspend();
        } else if (result.feedback === "home") {
            stopSpeech();
        }
    } catch (error) {
        showError(error);
        updateParentControls();
    } finally {
        setBusy(false);
        if (refreshPending) { refreshPending = false; load(); }
    }
}

function showParents() {
    clearTimeout(hintTimer);
    stopSpeech();
    parents.innerHTML = `<div class="dialog-top"><h2 id="parents-title">For grown-ups</h2><button class="quiet-button" data-action="close-parents" aria-label="Close grown-up settings">${icon("close")}</button></div>
        <p id="parent-notice" role="alert" hidden></p>
        <p>One short outing has three little rescues. No timer, scores or wrong-answer sounds. The pups rest at the end.</p>
        <div class="mode-options" role="group" aria-label="Play style">
            <button class="mode-option" data-action="mode" data-mode="tiny" aria-pressed="${state.settings.mode === "tiny"}"><b>Little paws</b><span>Ages 2+<br>Tap anywhere, or press a letter, number, arrow or space key.</span></button>
            <button class="mode-option" data-action="mode" data-mode="find" aria-pressed="${state.settings.mode === "find"}"><b>Clever paws</b><span>Ages 4+<br>Match one picture to three big choices. A gentle hint helps.</span></button>
        </div>
        <label class="setting">Spoken prompts<input data-setting="voice" type="checkbox" ${state.settings.voice ? "checked" : ""}></label>
        <label class="setting">Gentle sounds<input data-setting="sound" type="checkbox" ${state.settings.sound ? "checked" : ""}></label>
        <label class="setting">Little animations<input data-setting="motion" type="checkbox" ${state.settings.motion ? "checked" : ""}></label>
        <div class="dialog-actions"><button data-action="home">Back to start</button><button data-action="${state.game.phase === "rest" ? "again" : "close-parents"}" class="resume">${state.game.phase === "rest" ? "Another short outing" : "Back to pups"}</button></div>
        <section class="device-info" aria-labelledby="device-title">
            <h3 id="device-title">This device</h3>
            <p>Progress and settings save in this browser after each change. They do not sync to other devices. Private browsing or clearing site data can erase them.</p>
            <p id="voice-status"></p>
            <p id="offline-status" role="status"></p>
            <p id="install-status"></p>
            <div class="device-actions"><button data-action="install" hidden>Install on this device</button><button data-action="update" hidden>Update and reopen</button></div>
            <p id="update-note" hidden>A new version is ready. Update when the children are finished. Your saved progress and settings will stay.</p>
        </section>
        <p class="privacy-note">An unofficial PAW Patrol fan game with original drawings. Not affiliated with or endorsed by the rights holders. No official artwork, recordings or character voices. No ads, accounts, microphones, analytics or external game assets.</p>`;
    parents.showModal();
    updateVoiceStatus();
    updatePwaControls();
    if (!notice.hidden) parents.querySelector("#parent-notice").textContent = notice.textContent;
    parents.querySelector("#parent-notice").hidden = notice.hidden;
    void pwa.refresh();
}

function updateVoiceStatus() {
    const status = parents.querySelector("#voice-status");
    if (status) status.textContent = voice
        ? "Spoken prompts use a local English narrator, not character voices. Availability depends on this device."
        : "No local English voice is available in this browser right now. Picture prompts still work.";
}

function updatePwaControls() {
    if (!parents.open) return;
    const status = pwa.getStatus();
    parents.querySelector("#offline-status").textContent = status.offline;
    parents.querySelector("#install-status").textContent = status.install;
    parents.querySelector('[data-action="install"]').hidden = !status.installAvailable;
    parents.querySelector('[data-action="update"]').hidden = !status.updateAvailable;
    parents.querySelector("#update-note").hidden = !status.updateAvailable;
}

function updateParentControls() {
    if (!parents.open) return;
    parents.querySelectorAll("[data-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mode === state.settings.mode)));
    parents.querySelectorAll("[data-setting]").forEach(input => { input.checked = state.settings[input.dataset.setting]; });
    const resume = parents.querySelector(".resume");
    resume.dataset.action = state.game.phase === "rest" ? "again" : "close-parents";
    resume.textContent = state.game.phase === "rest" ? "Another short outing" : "Back to pups";
}

function closeParents() {
    parents.close();
    lockUntil = performance.now() + 350;
    render();
    say(prompt());
}

function play(action, tool) {
    if (busy || parents.open || performance.now() < lockUntil) return;
    unlockAudio();
    if (action === "goodbye") {
        goodbyeCount += 1;
        const note = document.querySelector("#goodbye-note");
        if (note) note.textContent = goodbyeCount % 2 ? "Bye, little helper. See you another day!" : "Chase, Marshall and Skye send you a cuddle.";
        say("Bye bye, little helper!");
        chime();
        lockUntil = performance.now() + 1000;
    } else {
        send({ type: action === "choose" ? "help" : action, ...(tool ? { tool } : {}) });
    }
}

document.addEventListener("click", async event => {
    if (!state) return;
    const control = event.target.closest("[data-action]");
    if (control) {
        const action = control.dataset.action;
        if (action === "parents") { showParents(); return; }
        if (action === "close-parents") { closeParents(); return; }
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
        if (action === "home" || action === "again") {
            parents.close();
            await send({ type: action === "again" ? "start" : "home" });
            return;
        }
        play(action, control.dataset.tool);
        return;
    }
    if (parents.open || !event.target.closest("main")) return;
    if (state.game.phase === "welcome") play("start");
    else if (state.settings.mode === "tiny") {
        play(state.game.phase === "playing" ? "help" : state.game.phase === "celebrate" ? "next" : "goodbye");
    }
});

parents.addEventListener("change", async event => {
    if (event.target.dataset.setting) await send({ type: "settings", settings: { [event.target.dataset.setting]: event.target.checked } });
});
parents.addEventListener("cancel", event => { event.preventDefault(); closeParents(); });

document.addEventListener("keydown", event => {
    if (!state || parents.open || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Escape") { showParents(); return; }
    if (event.key === "Tab" || event.key === "Shift") return;
    const focused = event.target.closest("button, input");
    if (focused && ["Enter", " "].includes(event.key)) return;
    const isPlayKey = event.key.length === 1 || ["Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key);
    if (!isPlayKey) return;
    if (state.game.phase === "playing" && state.settings.mode === "find") return;
    event.preventDefault();
    play({ welcome: "start", playing: "help", celebrate: "next", rest: "goodbye" }[state.game.phase]);
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stopSpeech(); clearTimeout(hintTimer); }
    else if (state) {
        if (busy) refreshPending = true;
        else load();
    }
});
window.addEventListener("pagehide", stopSpeech);
window.addEventListener("storage", event => {
    if (event.key !== null && event.key !== store.key) return;
    if (busy) refreshPending = true;
    else load();
});

function load() {
    stopSpeech();
    setBusy(true);
    try {
        state = store.load();
        render();
        updateParentControls();
        clearError();
    } catch (error) {
        showError(error);
        if (!state) app.innerHTML = `<div class="loading"><p>The pups need a grown-up's help to open.</p><button class="primary" id="retry-load">Try again</button></div>`;
        document.querySelector("#retry-load")?.addEventListener("click", load);
    } finally {
        setBusy(false);
    }
}

load();
void pwa.start();
