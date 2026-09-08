import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PUBLIC_FILES, createStaticServer } from "./dev-server.mjs";
import { stageSite } from "./scripts/stage-site.mjs";

const read = path => readFile(new URL(path, import.meta.url));
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
    const icons = [...manifest.icons, { src: "./icons/apple-touch-icon.png", sizes: "180x180" }];
    assert.ok(manifest.icons.some(icon => icon.purpose === "maskable"));
    for (const icon of icons) {
        const png = await read(icon.src);
        assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
    }
});

test("precache includes every public game file except the service worker itself", async () => {
    assert.deepEqual(
        assets.filter(asset => asset !== "./").map(asset => asset.slice(2)).sort(),
        PUBLIC_FILES.filter(file => file !== "sw.js").sort(),
    );
    for (const asset of assets) assert.ok((await read(asset === "./" ? "index.html" : asset)).length > 0);
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
        assert.match((await fetch(`${base}/little-rescue-pups/app.mjs`)).headers.get("content-type"), /javascript/);
        assert.equal((await fetch(`${base}/little-rescue-pups/package.json`)).status, 404);
        assert.equal((await fetch(`${base}/little-rescue-pups/../package.json`)).status, 404);
        assert.equal((await fetch(`${base}/little-rescue-pups/`, { method: "POST" })).status, 405);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test("Pages staging includes only runtime files and refuses to reuse an existing output folder", async t => {
    const temporary = await mkdtemp(join(tmpdir(), "rescue-pups-pages-"));
    t.after(() => rm(temporary, { recursive: true }));
    const output = join(temporary, "site");
    assert.equal(await stageSite(output), PUBLIC_FILES.length);
    const entries = (await readdir(output, { recursive: true }))
        .map(entry => entry.replaceAll("\\", "/"))
        .filter(entry => entry !== "icons").sort();
    assert.deepEqual(entries, [...PUBLIC_FILES].sort());
    for (const file of PUBLIC_FILES) {
        assert.deepEqual(await readFile(join(output, file)), await read(file));
    }
    await writeFile(join(output, "unexpected.txt"), "Do not publish");
    await assert.rejects(stageSite(output), /staging folder already exists/);
});
