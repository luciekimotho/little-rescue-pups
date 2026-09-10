import { APP_BASE_URL } from "../paths.mjs";

export function workerStatus(worker, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => {
            channel.port1.close();
            reject(new Error("Offline storage did not respond. Reopen the game online to try again."));
        }, timeout);
        channel.port1.onmessage = event => {
            clearTimeout(timer);
            channel.port1.close();
            resolve(event.data);
        };
        worker.postMessage({ type: "OFFLINE_STATUS" }, [channel.port2]);
    });
}

export function createPwa(onChange) {
    let registration;
    let installPrompt;
    let reloadingForUpdate = false;
    const status = {
        offline: "Offline play is not ready yet. Keep this page open while the game is saved.",
        install: "iPhone or iPad: open in Safari, tap Share, then Add to Home Screen. Android: use your browser's Install app or Add to Home screen menu. Desktop: use the install icon in Edge or Chrome's address bar. Menu names vary by browser.",
        installAvailable: false,
        updateAvailable: false,
    };
    const emit = () => onChange({ ...status });

    async function checkOffline() {
        const active = registration?.active;
        if (!active || active.state !== "activated") return;
        try {
            const result = await workerStatus(active);
            status.offline = result.ready
                ? "Ready for offline play on this device. The game, pictures and sounds are saved. Local spoken prompts depend on this device's installed voices."
                : "Offline files are missing. Reconnect to play. To download a fresh offline copy, clear this site's data in browser settings and reopen online. This also erases this device's saved progress and settings.";
        } catch (error) {
            status.offline = error.message;
        }
        emit();
    }

    function updateWaiting() {
        status.updateAvailable = Boolean(registration?.waiting);
        emit();
    }

    window.addEventListener("beforeinstallprompt", event => {
        event.preventDefault();
        installPrompt = event;
        status.installAvailable = true;
        emit();
    });
    window.addEventListener("appinstalled", () => {
        installPrompt = undefined;
        status.installAvailable = false;
        status.install = "The game is installed. Open Rescue pups from your home screen or app list.";
        emit();
    });

    return {
        getStatus: () => ({ ...status }),
        async start() {
            if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) {
                status.install = "You are playing in the installed app.";
            }
            if (!window.isSecureContext || !("serviceWorker" in navigator)) {
                status.offline = "Offline installation is unavailable here. Use a supported browser on an HTTPS website. A normal home-network HTTP address will not work.";
                emit();
                return;
            }
            navigator.serviceWorker.addEventListener("controllerchange", () => {
                if (reloadingForUpdate) location.reload();
                else void checkOffline();
            });
            try {
                registration = await navigator.serviceWorker.register(new URL("sw.js", APP_BASE_URL), {
                    scope: APP_BASE_URL.pathname,
                    updateViaCache: "none",
                });
                const watch = worker => {
                    if (!worker) return;
                    worker.addEventListener("statechange", () => {
                        if (worker.state === "installed") updateWaiting();
                        if (worker.state === "activated") void checkOffline();
                        if (worker.state === "redundant") {
                            status.offline = "The offline download or update did not finish. Keep the game online and reopen it to retry. Any previously saved offline version is unchanged.";
                            emit();
                        }
                    });
                };
                registration.addEventListener("updatefound", () => watch(registration.installing));
                watch(registration.installing);
                updateWaiting();
                await checkOffline();
            } catch (error) {
                status.offline = `Offline setup failed. Reopen the game online to retry. ${error.message}`;
                emit();
            }
        },
        refresh: checkOffline,
        async install() {
            if (!installPrompt) throw new Error("Use your browser's install menu or the platform instructions in grown-up settings.");
            const prompt = installPrompt;
            installPrompt = undefined;
            status.installAvailable = false;
            emit();
            const result = await prompt.prompt();
            status.install = result.outcome === "accepted"
                ? "Installation requested. Follow your browser's instructions to finish."
                : "Installation cancelled. You can install later from your browser's menu.";
            emit();
        },
        applyUpdate() {
            if (!registration?.waiting) throw new Error("No downloaded update is waiting. Reopen the game online to check again.");
            reloadingForUpdate = true;
            registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
        },
    };
}
