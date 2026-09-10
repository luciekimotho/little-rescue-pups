import { welcomeArt, crewArt } from "../artwork/art.mjs";
import { PUPS } from "../game/missions.mjs";
import { PROFILES } from "../game/profiles.mjs";
import { renderProfileButton } from "../components/profile-button.mjs";

export function renderChooser(savedState) {
    return `<main class="welcome">
        <div class="intro"><p class="eyebrow">A little rescue in Adventure Bay</p>
        <h1>Let's help<br><span class="hero-accent">with Chase!</span></h1>
        <p class="subtitle">Chase, Marshall and Skye are ready to play.</p></div>
        <div class="welcome-picture" role="img" aria-label="Marshall in his red firefighter helmet, Chase in his blue police uniform, and Skye with her pink flying goggles, outside the Lookout.">${welcomeArt()}<span class="name-tag marshall">Marshall</span><span class="name-tag chase">Chase</span><span class="name-tag skye">Skye</span></div>
        <div class="start-area">
        <div class="player-choices" role="group" aria-label="Choose who's playing">
            ${Object.keys(PROFILES).map(id => renderProfileButton(id, savedState.profiles[id])).join("")}
        </div>
        <p class="parent-hint">Choose your name to play.<br>Your own adventure will be waiting.</p></div>
        <div class="crew-strip" aria-label="More rescue friends">${["rubble", "rocky", "zuma"].map(id => `<div class="crew-member" style="--crew-color:${PUPS[id].color}"><span class="crew-face">${crewArt(id)}</span><span><b>${PUPS[id].name}</b><small>${PUPS[id].role}</small></span></div>`).join("")}</div>
    </main>`;
}
