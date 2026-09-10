import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const directory = new URL("../assets/icons/", import.meta.url);
const source = await readFile(new URL("icon.svg", directory), "utf8");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
try {
    await mkdir(directory, { recursive: true });
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const [name, size] of [["icon-192", 192], ["icon-512", 512], ["maskable-512", 512], ["apple-touch-icon", 180]]) {
        await page.setViewportSize({ width: size, height: size });
        await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>${source}`);
        await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, directory)), omitBackground: false });
    }
    console.log("Generated 192px, 512px, maskable 512px and Apple 180px PNG icons from assets\\icons\\icon.svg.");
} finally {
    await browser.close();
}
