import { DEFAULT_STATE, transition, validState } from "./game.mjs";

export const SAVE_KEY = `little-rescue-pups:save:${new URL("./", import.meta.url).pathname}`;

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
        dispatch: action => runExclusive(() => {
            const raw = read();
            const previous = decode(raw);
            const result = transition(previous, action);
            if (JSON.stringify(result.state) !== JSON.stringify(previous)) write(result.state, raw);
            return result;
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
