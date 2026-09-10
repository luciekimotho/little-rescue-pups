export function createSoundEffects({ getSettings, browser = window }) {
    let audio;

    function unlock() {
        if (!getSettings()?.sound) return;
        const Context = browser.AudioContext || browser.webkitAudioContext;
        if (!Context) return;
        if (!audio) audio = new Context();
        if (audio.state === "suspended") audio.resume().catch(error => console.warn("Game audio could not resume:", error));
    }

    function chime(celebrate = false) {
        if (!getSettings()?.sound || !audio || audio.state !== "running") return;
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

    async function applySettings() {
        if (!getSettings()?.sound && audio?.state === "running") await audio.suspend();
    }

    return { unlock, chime, applySettings };
}
