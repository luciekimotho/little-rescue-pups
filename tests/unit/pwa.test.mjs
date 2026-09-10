import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, readdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_FILES, createStaticServer } from "../../scripts/dev-server.mjs";
import { PROJECT_ROOT_URL } from "../../scripts/site-files.mjs";
import { stageSite } from "../../scripts/stage-site.mjs";

const read = path => readFile(new URL(path, PROJECT_ROOT_URL));
const manifest = JSON.parse(await read("manifest.webmanifest"));
const sw = (await read("sw.js")).toString();
const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);

test("manifest has stable, relative identity, scope and start URL at root and a subpath", () => {
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.id, "./");
    assert.equal(manifest.start_url, "./");
    assert.equal(manifest.scope, "./");
    for (const root of ["https://example.test/", "https://example.test/little-rescue-pups/"]) {
        for (const path of [manifest.id, manifest.start_url, manifest.scope, ...manifest.icons.map(icon => icon.src), ...assets]) {
            assert.ok(new URL(path, root).href.startsWith(root), path);
        }
    }
});

test("real PNG icons have declared dimensions, including maskable and Apple icons", async () => {
    const icons = [...manifest.icons, { src: "./assets/icons/apple-touch-icon.png", sizes: "180x180" }];
    assert.ok(manifest.icons.some(icon => icon.purpose === "maskable"));
    for (const icon of icons) {
        const png = await read(icon.src);
        assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
    }
});

test("precache includes every public game file except the service worker itself", async () => {
    assert.deepEqual(PUBLIC_FILES.filter(file => !file.includes("/")).sort(), ["index.html", "manifest.webmanifest", "sw.js"]);
    assert.deepEqual(
        assets.filter(asset => asset !== "./").map(asset => asset.slice(2)).sort(),
        PUBLIC_FILES.filter(file => file !== "sw.js").sort(),
    );
    for (const asset of assets) assert.ok((await read(asset === "./" ? "index.html" : asset)).length > 0);
});

test("every static module import and stylesheet is included in offline deployment", async () => {
    const root = PROJECT_ROOT_URL;
    for (const file of PUBLIC_FILES.filter(file => file.endsWith(".mjs"))) {
        const source = (await read(file)).toString();
        for (const match of source.matchAll(/\b(?:from\s*|import\s*)["'](\.\.?\/[^"']+)["']/g)) {
            const dependency = new URL(match[1], new URL(file, root));
            const relative = dependency.href.slice(root.href.length);
            assert.ok(PUBLIC_FILES.includes(relative), `${file} imports uncached ${relative}`);
        }
    }
    const html = (await read("index.html")).toString();
    for (const match of html.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)"/g)) {
        assert.ok(PUBLIC_FILES.includes(match[1]), `Uncached stylesheet ${match[1]}`);
    }
});

test("the development server exposes only public assets and rejects unsafe base paths", async () => {
    assert.throws(() => createStaticServer({ basePath: "/../" }));
    const server = createStaticServer({ basePath: "/little-rescue-pups/" });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const redirect = await fetch(`${base}/little-rescue-pups`, { redirect: "manual" });
        assert.equal(redirect.status, 308);
        assert.equal(redirect.headers.get("location"), "/little-rescue-pups/");
        const app = await fetch(`${base}/little-rescue-pups/src/app.mjs`);
        assert.equal(app.status, 200);
        assert.match(app.headers.get("content-type"), /javascript/);
        for (const file of ["scripts/dev-server.mjs", "tests/unit/game.test.mjs"]) {
            assert.equal((await fetch(`${base}/little-rescue-pups/${file}`)).status, 404, `${file} is not hosted`);
        }
        assert.equal((await fetch(`${base}/little-rescue-pups/package.json`)).status, 404);
        assert.equal((await fetch(`${base}/little-rescue-pups/../package.json`)).status, 404);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test("Pages staging includes only runtime files and refuses to reuse an existing output folder", async t => {
    const workspace = join(fileURLToPath(PROJECT_ROOT_URL), `.test-pages-${randomUUID()}`);
    await mkdir(workspace);
    t.after(() => rm(workspace, { recursive: true, force: true }));
    const output = join(workspace, "site");
    assert.equal(await stageSite(output), PUBLIC_FILES.length);
    const entries = (await readdir(output, { recursive: true, withFileTypes: true }))
        .filter(entry => entry.isFile())
        .map(entry => relative(output, join(entry.parentPath, entry.name)).replaceAll("\\", "/")).sort();
    assert.deepEqual(entries, [...PUBLIC_FILES].sort());
    await assert.rejects(stageSite(output), /staging folder already exists/);
});
