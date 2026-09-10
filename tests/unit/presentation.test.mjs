import { test } from "node:test";
import assert from "node:assert/strict";
import { renderGame } from "../../src/screens/render-screen.mjs";
import { createNarration, narrationPrompt } from "../../src/services/narration.mjs";
import { createSoundEffects } from "../../src/services/sound.mjs";
import { DEFAULT_STATE } from "../../src/game/profiles.mjs";
import { actionContext, currentMission, transition } from "../../src/game/game.mjs";

function advance(profile, action) {
    return transition(profile, { ...actionContext(profile), ...action }).state;
}

test("screen templates have no browser dependencies and do not change either profile", () => {
    const saved = structuredClone(DEFAULT_STATE);
    const before = structuredClone(saved);
    const chooser = renderGame(saved, null);
    assert.match(chooser, /class="welcome"/);
    assert.match(chooser, /data-profile="eden"/);
    assert.match(chooser, /data-profile="ethan"/);
    assert.match(chooser, /EDEN with Skye, start adventure/);
    assert.match(chooser, /ETHAN with Chase, start adventure/);
    assert.doesNotMatch(chooser, /data-placement-tool|data-drop-target/);
    assert.deepEqual(saved, before);
});

test("screen templates retain assisted and matching placement controls", () => {
    const saved = structuredClone(DEFAULT_STATE);
    for (const id of ["eden", "ethan"]) saved.profiles[id] = advance(saved.profiles[id], { type: "start" });
    const before = structuredClone(saved);
    const eden = renderGame(saved, "eden");
    const ethan = renderGame(saved, "ethan");
    assert.match(eden, /Eden's rescue/);
    assert.match(eden, /data-drop-target="bowl"/);
    assert.equal([...eden.matchAll(/data-placement-tool=/g)].length, 1);
    assert.equal([...ethan.matchAll(/data-placement-tool=/g)].length, 3);
    assert.match(ethan, /data-placement-tool="carrot"/);
    assert.match(ethan, /data-placement-tool="ladder"/);
    assert.match(ethan, /data-placement-tool="bucket"/);
    assert.match(renderGame(saved, null), /EDEN with Skye, resume adventure/);
    assert.deepEqual(saved, before);
});

test("all rescue screens and narration preserve progress, celebration and rest", () => {
    const saved = structuredClone(DEFAULT_STATE);
    let profile = advance(saved.profiles.ethan, { type: "start" });
    for (let i = 0; i < 3; i++) {
        const mission = currentMission(profile);
        saved.profiles.ethan = profile;
        const screen = renderGame(saved, "ethan");
        assert.match(screen, /class="playing"/);
        assert.ok(screen.includes(mission.title));
        assert.ok(narrationPrompt(profile).includes(mission.title));
        while (profile.game.phase === "playing") {
            profile = advance(profile, { type: mission.interaction, tool: mission.tool, targetId: mission.targetId });
        }
        saved.profiles.ethan = profile;
        assert.match(renderGame(saved, "ethan"), /class="celebrate"/);
        assert.ok(narrationPrompt(profile).includes(mission.success));
        profile = advance(profile, { type: "next" });
    }
    saved.profiles.ethan = profile;
    assert.match(renderGame(saved, "ethan"), /data-action="goodbye"/);
    assert.match(narrationPrompt(profile), /pups are resting/);
    assert.match(narrationPrompt(null), /Choose Eden or Ethan/);
});

function voiceFixture(voices) {
    const spoken = [];
    const statusMessages = [];
    const synth = new EventTarget();
    let cancelled = 0;
    const environment = {
        voices,
        settings: { voice: true },
        document: { hidden: false },
        speechSynthesis: synth,
        SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    };
    synth.getVoices = () => environment.voices;
    synth.cancel = () => { cancelled++; };
    synth.speak = utterance => spoken.push(utterance);
    const narration = createNarration({
        browser: environment, getSettings: () => environment.settings,
        onStatusChange: text => statusMessages.push(text),
    });
    return { environment, narration, spoken, statusMessages, cancelled: () => cancelled };
}

test("narration selects only local English and preserves voice tuning", () => {
    const remote = { name: "Online British", lang: "en-GB", localService: false };
    const french = { name: "French", lang: "fr-FR", localService: true };
    const american = { name: "American", lang: "en-US", localService: true };
    const british = { name: "British", lang: "en-GB", localService: true };
    const f = voiceFixture([remote, french, american, british]);
    f.narration.say("Bring the carrot to the bowl.");
    assert.equal(f.spoken[0].voice, british);
    assert.equal(f.spoken[0].rate, .82);
    assert.equal(f.spoken[0].pitch, 1.12);
    assert.equal(f.spoken[0].volume, .8);
    assert.equal(f.cancelled(), 1);
    assert.match(f.narration.status(), /local English narrator/);
});

test("narration reads live profile settings and cancels old speech even when muted or hidden", () => {
    const f = voiceFixture([{ name: "English", lang: "en-US", localService: true }]);
    f.narration.say("First profile");
    f.environment.settings = { voice: false };
    f.narration.say("Muted profile");
    f.environment.settings = { voice: true };
    f.environment.document.hidden = true;
    f.narration.say("Hidden page");
    f.environment.document.hidden = false;
    f.environment.settings = undefined;
    f.narration.say("Chooser");
    assert.equal(f.spoken.length, 1);
    assert.equal(f.cancelled(), 4);
});

test("narration handles late local voices, missing synthesis and cleanup", () => {
    const f = voiceFixture([{ name: "Network voice", lang: "en-US", localService: false }]);
    f.narration.say("No local voice");
    assert.equal(f.spoken.length, 0);
    assert.match(f.narration.status(), /No local English voice/);
    const local = { name: "Kenyan English", lang: "en-KE", localService: true };
    f.environment.voices.push(local);
    f.environment.speechSynthesis.dispatchEvent(new Event("voiceschanged"));
    f.narration.say("A local voice is ready");
    assert.equal(f.spoken[0].voice, local);
    f.narration.destroy();
    const messages = f.statusMessages.length;
    f.environment.speechSynthesis.dispatchEvent(new Event("voiceschanged"));
    assert.equal(f.statusMessages.length, messages);
    const unsupported = createNarration({ browser: { document: { hidden: false } }, getSettings: () => ({ voice: true }) });
    assert.doesNotThrow(() => { unsupported.say("No API"); unsupported.stop(); unsupported.destroy(); });
    assert.match(unsupported.status(), /No local English voice/);
});

test("speech failures reach the adult status callback without treating cancellation as failure", t => {
    const warnings = [];
    t.mock.method(console, "warn", (...args) => warnings.push(args));
    const f = voiceFixture([{ name: "Local", lang: "en-US", localService: true }]);
    f.narration.say("Hello");
    const initialMessages = f.statusMessages.length;
    f.spoken[0].onerror({ error: "canceled" });
    f.spoken[0].onerror({ error: "interrupted" });
    assert.equal(f.statusMessages.length, initialMessages);
    f.spoken[0].onerror({ error: "synthesis-failed" });
    assert.match(f.statusMessages.at(-1), /could not speak/);
    assert.equal(warnings.length, 1);
});

function soundFixture() {
    const contexts = [];
    const settings = { sound: false };
    class Context {
        constructor() {
            this.state = "suspended";
            this.currentTime = 5;
            this.destination = {};
            this.oscillators = [];
            this.gains = [];
            contexts.push(this);
        }
        async resume() { this.state = "running"; }
        async suspend() { this.state = "suspended"; }
        createOscillator() {
            const oscillator = {
                frequency: { value: 0 },
                connect() {}, disconnect() { this.disconnected = true; },
                start(at) { this.startAt = at; }, stop(at) { this.stopAt = at; },
            };
            this.oscillators.push(oscillator);
            return oscillator;
        }
        createGain() {
            const gain = {
                gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
                connect() {}, disconnect() { this.disconnected = true; },
            };
            this.gains.push(gain);
            return gain;
        }
    }
    return {
        contexts, settings,
        sound: createSoundEffects({ getSettings: () => settings, browser: { AudioContext: Context } }),
    };
}

test("sounds create audio only on enabled interaction and keep the existing chimes", async () => {
    const f = soundFixture();
    f.sound.unlock();
    f.sound.chime();
    assert.equal(f.contexts.length, 0);
    f.settings.sound = true;
    f.sound.unlock();
    f.sound.chime();
    f.sound.chime(true);
    assert.equal(f.contexts.length, 1);
    const audio = f.contexts[0];
    assert.deepEqual(audio.oscillators.map(node => node.frequency.value), [523.25, 659.25, 523.25, 659.25, 783.99]);
    assert.equal(audio.oscillators[1].startAt, 5.15);
    for (const oscillator of audio.oscillators) oscillator.onended();
    assert.ok(audio.oscillators.every(node => node.disconnected));
    assert.ok(audio.gains.every(node => node.disconnected));
    f.settings.sound = false;
    await f.sound.applySettings();
    assert.equal(audio.state, "suspended");
    f.sound.chime();
    assert.equal(audio.oscillators.length, 5);
});

test("unsupported sound is optional, but audio suspension failures are not swallowed", async () => {
    const unsupported = createSoundEffects({ getSettings: () => ({ sound: true }), browser: {} });
    assert.doesNotThrow(() => { unsupported.unlock(); unsupported.chime(); });
    const f = soundFixture();
    f.settings.sound = true;
    f.sound.unlock();
    f.contexts[0].suspend = async () => { throw new Error("Audio device unavailable"); };
    f.settings.sound = false;
    await assert.rejects(f.sound.applySettings(), /Audio device unavailable/);
});
