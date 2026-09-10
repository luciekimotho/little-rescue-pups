import { transition } from "../game/game.mjs";
import { DEFAULT_STATE, validState, validProfileId } from "../game/profiles.mjs";
import { APP_BASE_URL } from "../paths.mjs";

export const SAVE_KEY = `little-rescue-pups:profiles:v2:${APP_BASE_URL.pathname}`;

export class SaveError extends Error {
    constructor(code, message, options = {}) {
        super(message, options);
        this.name = "SaveError";
        this.code = code;
        this.raw = options.raw;
    }
}

function decode(raw) {
    if (raw === null) return structuredClone(DEFAULT_STATE);
    let state;
    try {
        state = JSON.parse(raw);
    } catch (cause) {
        throw new SaveError("corrupt", "This device's save could not be read. It has not been replaced. Retry, or ask a grown-up to reset it.", { cause, raw });
    }
    if (!validState(state)) {
        throw new SaveError("corrupt", "This device's save is damaged or from an unsupported version. It has not been replaced.", { raw });
    }
    return state;
}

export function createStore({
    getStorage = () => globalThis.localStorage,
    key = SAVE_KEY,
    runExclusive = work => globalThis.navigator?.locks
        ? navigator.locks.request(key, work)
        : work(),
} = {}) {
    function read() {
        try {
            return getStorage().getItem(key);
        } catch (cause) {
            throw new SaveError("unavailable", "Browser storage is unavailable. Allow site storage in your browser settings, then try again. Progress cannot be saved right now.", { cause });
        }
    }

    function write(state, previousRaw) {
        if (read() !== previousRaw) {
            throw new SaveError("conflict", "Another tab changed this device's save. Try again to use its latest progress.");
        }
        try {
            getStorage().setItem(key, JSON.stringify(state));
        } catch (cause) {
            throw new SaveError("write", "This change was not saved. Browser storage may be full or blocked. Free some space or allow site storage, then try again.", { cause });
        }
    }

    return {
        key,
        load: () => decode(read()),
        dispatch: (profileId, action) => runExclusive(() => {
            if (!validProfileId(profileId)) throw new Error("Choose Eden or Ethan to play.");
            const raw = read();
            const previous = decode(raw);
            const result = transition(previous.profiles[profileId], action);
            const state = { ...previous, profiles: { ...previous.profiles, [profileId]: result.state } };
            if (!validState(state)) throw new SaveError("invalid", "The new profile progress is invalid. No changes were saved.");
            if (JSON.stringify(state) !== JSON.stringify(previous)) write(state, raw);
            return { state, feedback: result.feedback };
        }),
        resetInvalid: expectedRaw => runExclusive(() => {
            const raw = read();
            if (raw !== expectedRaw) {
                throw new SaveError("conflict", "The save changed in another tab. Retry loading before deciding whether to reset it.");
            }
            try {
                decode(raw);
            } catch (error) {
                if (!(error instanceof SaveError) || error.code !== "corrupt") throw error;
                const fresh = structuredClone(DEFAULT_STATE);
                write(fresh, raw);
                return fresh;
            }
            throw new SaveError("conflict", "This save is valid. Reload to keep its progress instead of resetting it.");
        }),
    };
}
