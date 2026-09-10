import { icon } from "../artwork/art.mjs";

export function renderFooter(state) {
    return `<footer class="footer">
        <span class="footer-note">${icon("heart")}Adventure Bay's little helpers</span>
        <span class="mode-indicator">${!state ? "Two little helpers" : state.settings.mode === "tiny" ? "Little paws \u00b7 assisted play" : "Clever paws \u00b7 choose and help"}</span>
    </footer>`;
}
