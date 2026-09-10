import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PUBLIC_FILES, PROJECT_ROOT_URL } from "./site-files.mjs";

export async function stageSite(destination = fileURLToPath(new URL("../_site/", import.meta.url))) {
    try {
        await mkdir(destination);
    } catch (error) {
        if (error.code !== "EEXIST") throw error;
        throw new Error("The staging folder already exists. Remove only that generated folder before staging again.", { cause: error });
    }
    for (const file of PUBLIC_FILES) {
        const target = join(destination, file);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(new URL(file, PROJECT_ROOT_URL), target);
    }
    return PUBLIC_FILES.length;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const count = await stageSite();
    console.log(`Staged ${count} public game files in _site.`);
}
