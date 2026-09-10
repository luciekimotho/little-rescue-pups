import { icon, welcomeArt } from "../artwork/art.mjs";

export function renderRest() {
    return `<main class="rest">
        <div class="intro"><p class="eyebrow">Back to the Lookout</p><h1>Happy friends.<br>Sleepy pups.</h1><p class="subtitle">Chase and the team are resting. Time for a cuddle.</p></div>
        <div class="welcome-picture">${welcomeArt(true)}</div>
        <div class="start-area"><button class="primary" data-action="goodbye" aria-label="Bye, pups! Back to home">${icon("paw")}Bye, pups!</button><p class="wave-note">You were a kind helper today.</p></div>
    </main>`;
}
