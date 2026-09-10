import { currentMission } from "../game/game.mjs";
import { missionTeam } from "../game/missions.mjs";

export function narrationPrompt(state) {
    if (!state) return "Choose Eden or Ethan to play with the pups.";
    if (state.game.phase === "rest") return "You helped all our friends in Adventure Bay. Chase and the pups are resting now. Time for a cuddle. Bye bye!";
    const mission = currentMission(state);
    if (state.game.phase === "celebrate") return `${mission.success} ${state.game.missionIndex === 2 ? "All done!" : "Tap the arrow for another friend."}`;
    return `Let's help ${missionTeam(mission)}! ${mission.title}. ${mission.interaction === "place" ? state.settings.mode === "tiny" ? "Tap the carrot or bring it to the bowl!" : "Bring the carrot to the bowl. You can drag it, or tap the carrot then the bowl." : state.settings.mode === "tiny" ? "Tap anywhere to help!" : mission.prompt}`;
}

export function createNarration({ getSettings, onStatusChange = () => {}, browser = window }) {
    const synthesis = browser.speechSynthesis;
    let voice;

    function status() {
        return voice
            ? "Spoken prompts use a local English narrator, not character voices. Availability depends on this device."
            : "No local English voice is available in this browser right now. Picture prompts still work.";
    }

    function refreshVoice() {
        if (!synthesis) return;
        const local = synthesis.getVoices().filter(item => item.localService && /^en([-_]|$)/i.test(item.lang));
        voice = local.find(item => /en-(GB|KE)/i.test(item.lang)) || local[0];
        onStatusChange(status());
    }

    function stop() {
        synthesis?.cancel();
    }

    function say(text) {
        stop();
        if (!getSettings()?.voice || !voice || browser.document.hidden) return;
        const utterance = new browser.SpeechSynthesisUtterance(text);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = .82;
        utterance.pitch = 1.12;
        utterance.volume = .8;
        utterance.onerror = event => {
            if (!["canceled", "interrupted"].includes(event.error)) {
                console.warn("Local spoken prompt unavailable:", event.error);
                onStatusChange("The local narrator could not speak. Picture prompts still work.");
            }
        };
        synthesis.speak(utterance);
    }

    refreshVoice();
    synthesis?.addEventListener("voiceschanged", refreshVoice);
    return {
        say, stop, status, refreshVoice,
        destroy() {
            synthesis?.removeEventListener("voiceschanged", refreshVoice);
            stop();
        },
    };
}
