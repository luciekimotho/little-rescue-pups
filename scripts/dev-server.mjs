import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { PUBLIC_FILES, PROJECT_ROOT_URL } from "./site-files.mjs";
export { PUBLIC_FILES } from "./site-files.mjs";

const MIME = {
    html: "text/html; charset=utf-8", mjs: "text/javascript; charset=utf-8",
    js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
    webmanifest: "application/manifest+json", svg: "image/svg+xml", png: "image/png",
};

export function createStaticServer({ basePath = "/", readAsset = readFile } = {}) {
    if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath)) {
        throw new Error("Use a base path with leading and trailing slashes, such as /little-rescue-pups/.");
    }
    return createServer(async (request, response) => {
        if (!["GET", "HEAD"].includes(request.method)) {
            response.writeHead(405, { Allow: "GET, HEAD" }).end();
            return;
        }
        const url = new URL(request.url, "http://localhost");
        if (basePath !== "/" && url.pathname === basePath.slice(0, -1)) {
            response.writeHead(308, { Location: `${basePath}${url.search}` }).end();
            return;
        }
        const file = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) || "index.html" : "";
        if (!PUBLIC_FILES.includes(file)) {
            response.writeHead(404).end("Not found");
            return;
        }
        try {
            const body = await readAsset(new URL(file, PROJECT_ROOT_URL));
            response.writeHead(200, {
                "Content-Type": MIME[file.split(".").at(-1)],
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            });
            response.end(request.method === "HEAD" ? undefined : body);
        } catch (error) {
            if (error.code !== "ENOENT") console.error("Could not serve game file:", error);
            response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Could not load game file");
        }
    });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const { values } = parseArgs({
        options: { port: { type: "string", default: "4173" }, base: { type: "string", default: "/" } },
    });
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Choose a port between 1 and 65535.");
    const server = createStaticServer({ basePath: values.base });
    server.on("error", error => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, "127.0.0.1", () => {
        console.log(`Rescue pups: http://localhost:${port}${values.base}`);
        console.log(`Serving static files from ${fileURLToPath(PROJECT_ROOT_URL)}`);
        console.log("Local preview only. Phone installation needs an HTTPS host. Press Ctrl+C to stop.");
    });
}
