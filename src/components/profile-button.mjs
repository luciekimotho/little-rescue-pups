import { crewArt } from "../artwork/art.mjs";
import { PUPS } from "../game/missions.mjs";
import { PROFILES } from "../game/profiles.mjs";

export function renderProfileButton(id, savedProfile) {
    const profile = PROFILES[id];
    return `<button class="primary player-button ${id} nudge" data-action="profile" data-profile="${id}" aria-label="${profile.name.toUpperCase()} with ${PUPS[profile.pup].name}, ${savedProfile.game.phase === "ready" ? "start" : "resume"} adventure">${crewArt(profile.pup)}<b>${profile.name.toUpperCase()}</b></button>`;
}
