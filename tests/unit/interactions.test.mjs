import { test } from "node:test";
import assert from "node:assert/strict";
import {
    attachPlacement, transformRect, viewBoxMatrix, minimumTargetRect,
    offsetParentRect, hitTestTargets,
} from "../../src/interactions/placement.mjs";

const bowl = { id: "bowl", x: 435, y: 325, width: 245, height: 140, label: "Bunny bowl" };

test("viewBox conversion preserves letterboxing in portrait and wide worlds", () => {
    const viewBox = { x: 0, y: 0, width: 1000, height: 500 };
    const portrait = viewBoxMatrix({ left: 12, top: 40, width: 300, height: 200 }, viewBox);
    assert.deepEqual(portrait, { a: .3, b: 0, c: 0, d: .3, e: 12, f: 65 });
    assert.deepEqual(transformRect(bowl, portrait), { left: 142.5, top: 162.5, width: 73.5, height: 42 });
    const wide = viewBoxMatrix({ left: 20, top: 40, width: 1000, height: 300 }, viewBox);
    assert.deepEqual(wide, { a: .6, b: 0, c: 0, d: .6, e: 220, f: 40 });
});

test("viewBox conversion supports nonzero origins, alignment, slice, and none", () => {
    const viewport = { left: 10, top: 20, width: 400, height: 300 };
    const viewBox = { x: 100, y: 50, width: 1000, height: 500 };
    assert.deepEqual(viewBoxMatrix(viewport, viewBox, "none"),
        { a: .4, b: 0, c: 0, d: .6, e: -30, f: -10 });
    assert.deepEqual(viewBoxMatrix(viewport, viewBox, "xMaxYMax meet"),
        { a: .4, b: 0, c: 0, d: .4, e: -30, f: 100 });
    assert.deepEqual(viewBoxMatrix(viewport, viewBox, "defer xMinYMin slice"),
        { a: .6, b: 0, c: 0, d: .6, e: -50, f: -10 });
});

test("CTM bounds include all four corners under rotation and shear", () => {
    assert.deepEqual(transformRect({ x: 1, y: 2, width: 3, height: 4 },
        { a: 0, b: 2, c: -2, d: 1, e: 10, f: 20 }),
    { left: -2, top: 24, width: 8, height: 10 });
});

test("48px target enlargement remains centered and offsets account for border, scale, and scroll", () => {
    const rect = minimumTargetRect({ left: 142.5, top: 162.5, width: 73.5, height: 42 });
    assert.deepEqual(rect, { left: 142.5, top: 159.5, width: 73.5, height: 48 });
    assert.deepEqual(offsetParentRect(rect, { left: 10, top: 30, width: 304, height: 204 },
        { clientLeft: 2, clientTop: 2 }),
    { left: 130.5, top: 127.5, width: 73.5, height: 48 });
    assert.deepEqual(offsetParentRect(
        { left: 140, top: 160, width: 100, height: 80 },
        { left: 100, top: 100, width: 400, height: 400 },
        { clientLeft: 2, clientTop: 3, scrollLeft: 5, scrollTop: 8, offsetWidth: 200, offsetHeight: 200 },
    ), { left: 23, top: 35, width: 50, height: 40 });
});

test("drop tolerance uses the pointer, prioritizes the nearest real rectangle, and handles overlap", () => {
    const first = { id: "first", rect: { left: 100, top: 100, width: 50, height: 50 } };
    const second = { id: "second", rect: { left: 155, top: 100, width: 50, height: 50 } };
    assert.equal(hitTestTargets({ x: 160, y: 125 }, [first, second], 32), second);
    assert.equal(hitTestTargets({ x: 76, y: 125 }, [first], 14), null);
    assert.equal(hitTestTargets({ x: 76, y: 125 }, [first], 32), first);
    assert.equal(hitTestTargets({ x: 70, y: 70 }, [first], 32), null);
    assert.equal(hitTestTargets({ x: 1, y: 1 }, []), null);
});

class Element {
    constructor(tag = "div", attributes = {}) {
        this.tagName = tag;
        this.attrs = new Map(Object.entries(attributes));
        this.children = [];
        this.parentElement = null;
        this.listeners = new Map();
        this.style = { left: "", top: "", width: "", height: "" };
        this.classes = new Set();
        this.classList = {
            add: (...names) => names.forEach(name => this.classes.add(name)),
            remove: (...names) => names.forEach(name => this.classes.delete(name)),
            contains: name => this.classes.has(name),
            toggle: (name, active) => {
                if (active) this.classes.add(name);
                else this.classes.delete(name);
            },
        };
        this.bounds = { left: 0, top: 0, width: 100, height: 100 };
        this.clientLeft = 0;
        this.clientTop = 0;
        this.scrollLeft = 0;
        this.scrollTop = 0;
        this.offsetWidth = 100;
        this.offsetHeight = 100;
        this.captures = new Set();
        this.captureCalls = [];
    }

    get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
    get id() { return this.getAttribute("id"); }
    get className() { return [...this.classes].join(" "); }
    set className(value) { this.classes = new Set(value.split(/\s+/)); }
    get dataset() {
        return {
            placementTool: this.getAttribute("data-placement-tool"),
            dropTarget: this.getAttribute("data-drop-target"),
        };
    }
    get isConnected() { return this.connected ?? Boolean(this.parentElement?.isConnected); }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    removeAttribute(name) { this.attrs.delete(name); }
    append(...elements) {
        for (const element of elements) {
            element.parentElement = this;
            element.ownerDocument = this.ownerDocument;
            this.children.push(element);
        }
    }
    remove() {
        if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
        this.parentElement = null;
    }
    contains(element) { return this === element || this.children.some(child => child.contains(element)); }
    matches(selector) {
        return selector.split(",").some(part => {
            const value = part.trim();
            if (value.startsWith("[")) return this.attrs.has(value.slice(1, -1));
            if (value.startsWith(".")) return this.classes.has(value.slice(1));
            return value === "*" || this.tagName === value;
        });
    }
    closest(selector) {
        if (this.matches(selector)) return this;
        return this.parentElement?.closest(selector) ?? null;
    }
    querySelectorAll(selector) {
        return this.children.flatMap(child => [
            ...(child.matches(selector) ? [child] : []),
            ...child.querySelectorAll(selector),
        ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    getBoundingClientRect() { return this.bounds; }
    addEventListener(type, handler, options) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push({ handler, capture: options === true || Boolean(options?.capture) });
        this.listeners.set(type, listeners);
    }
    removeEventListener(type, handler) {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter(listener => listener.handler !== handler));
    }
    setPointerCapture(id) {
        this.captures.add(id);
        this.captureCalls.push(id);
    }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) {
        this.captures.delete(id);
        emit(this, "lostpointercapture", { pointerId: id });
    }
    cloneNode(deep) {
        const clone = new Element(this.tagName, Object.fromEntries(this.attrs));
        clone.className = this.className;
        if (deep) clone.append(...this.children.map(child => child.cloneNode(true)));
        return clone;
    }
}

function emit(target, type, properties = {}) {
    const event = {
        type, target, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse",
        isPrimary: true, detail: type === "click" ? 1 : 0,
        clientX: 150, clientY: 400, cancelable: true, defaultPrevented: false, stopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.stopped = true; },
        ...properties,
    };
    const path = [];
    for (let element = target; element; element = element.parentElement) path.push(element);
    const run = (element, capture) => {
        for (const listener of [...(element.listeners.get(type) ?? [])]) {
            if (listener.capture === capture) listener.handler(event);
        }
    };
    for (const element of [...path].reverse()) {
        run(element, true);
        if (event.stopped) return event;
    }
    for (const element of path) {
        run(element, false);
        if (event.stopped) break;
    }
    return event;
}

function fixture(options = {}) {
    const window = new Element("window");
    const document = new Element("document");
    window.connected = true;
    window.append(document);
    document.ownerDocument = document;
    document.defaultView = window;
    document.hidden = false;
    document.createElement = tag => new Element(tag);
    const errors = [];
    window.reportError = error => errors.push(error);
    const body = new Element("body");
    document.append(body);
    document.body = body;
    const root = new Element("main");
    body.append(root);
    const world = new Element();
    world.className = "world";
    world.bounds = { left: 10, top: 30, width: 304, height: 204 };
    world.offsetWidth = 304;
    world.offsetHeight = 204;
    world.clientLeft = world.clientTop = 2;
    root.append(world);
    const scene = new Element("svg", { viewBox: "0 0 1000 500" });
    scene.className = "placement-scene";
    scene.bounds = { left: 12, top: 32, width: 300, height: 200 };
    world.append(scene);
    const targetButtons = (options.targets ?? [bowl]).map(spec => {
        const button = new Element("button", { "data-drop-target": spec.id });
        button.offsetParent = world;
        world.append(button);
        return button;
    });
    const target = targetButtons[0];
    const source = new Element("button", { "data-placement-tool": "carrot", "aria-label": "Carrot" });
    root.append(source);
    const sourceIcon = new Element("svg", { "aria-hidden": "true", viewBox: "0 0 100 100" });
    source.append(sourceIcon);
    const secondSource = new Element("button", { "data-placement-tool": "ladder", "aria-label": "Ladder" });
    root.append(secondSource);
    const feedback = [];
    const actions = [];
    const unlocks = [];
    let enabled = true;
    const controller = attachPlacement({
        root, targets: [bowl], canInteract: () => enabled,
        onInteract: () => unlocks.push("unlocked"),
        onPlace: action => actions.push(action),
        onFeedback: text => feedback.push(text),
        ...options,
    });
    const pointer = (type, properties = {}, element = source) => emit(element, type, properties);
    const click = (element = source, properties = {}) => emit(element, "click", {
        isPrimary: false, ...properties,
    });
    return {
        root, world, scene, document, window, body, source, sourceIcon, secondSource, target, targetButtons,
        controller, feedback, actions, unlocks, errors, pointer, click,
        setEnabled: value => { enabled = value; },
    };
}

test("targets are positioned from rendered viewBox and missing accessible labels get the supplied label", () => {
    const f = fixture();
    assert.deepEqual(f.target.style, { left: "130.5px", top: "119.5px", width: "73.5px", height: "48px" });
    assert.equal(f.target.getAttribute("aria-label"), "Bunny bowl");
    f.controller.destroy();
    assert.equal(f.target.getAttribute("aria-label"), null);
    assert.deepEqual(f.target.style, { left: "", top: "", width: "", height: "" });
});

test("layout prefers getScreenCTM and reacts to changed layout without keeping stale selection", () => {
    const f = fixture();
    f.click();
    f.scene.getScreenCTM = () => ({ a: .25, b: 0, c: 0, d: .25, e: 20, f: 50 });
    emit(f.window, "resize");
    assert.equal(f.target.style.left, "116.75px");
    assert.equal(f.target.style.top, "92.75px");
    assert.equal(f.source.getAttribute("aria-pressed"), "false");
    f.controller.destroy();
});

test("find taps select a source and target click commits exactly one generic action", async () => {
    const f = fixture();
    f.click(f.target);
    assert.deepEqual(f.feedback, ["Choose a picture first."]);
    f.click(f.sourceIcon);
    assert.equal(f.source.getAttribute("aria-pressed"), "true");
    assert.equal(f.target.classList.contains("is-placement-ready"), true);
    f.click(f.secondSource);
    assert.equal(f.source.getAttribute("aria-pressed"), "false");
    assert.equal(f.secondSource.getAttribute("aria-pressed"), "true");
    f.click(f.target);
    assert.deepEqual(f.actions, [{ type: "place", tool: "ladder", targetId: "bowl" }]);
    f.click(f.target);
    assert.equal(f.actions.length, 1);
    await Promise.resolve();
    f.controller.destroy();
});

test("an assisted tap commits directly without preventing pointerdown or requiring drag", () => {
    const f = fixture({ assisted: true });
    assert.equal(f.pointer("pointerdown").defaultPrevented, false);
    assert.deepEqual(f.unlocks, ["unlocked"]);
    f.pointer("pointermove", { clientX: 153, clientY: 402 });
    assert.equal(f.source.captureCalls.length, 0);
    f.pointer("pointerup", { clientX: 153, clientY: 402 });
    f.click();
    assert.deepEqual(f.actions, [{ type: "place", tool: "carrot", targetId: "bowl" }]);
    f.controller.destroy();
});

test("multiple targets stay selectable in assisted mode instead of choosing an arbitrary destination", () => {
    const f = fixture({
        assisted: true,
        targets: [bowl, { id: "basket", x: 40, y: 60, width: 100, height: 80, label: "Basket" }],
    });
    f.click();
    assert.equal(f.actions.length, 0);
    assert.equal(f.source.getAttribute("aria-pressed"), "true");
    f.click(f.targetButtons[1]);
    assert.deepEqual(f.actions, [{ type: "place", tool: "carrot", targetId: "basket" }]);
    f.controller.destroy();
});

test("minimum-size hints near world edges remain inside the unclipped world area", () => {
    const f = fixture({ targets: [{ id: "corner", x: 0, y: 0, width: 10, height: 10, label: "Corner" }] });
    assert.equal(f.target.style.left, "0px");
    assert.equal(f.target.style.width, "48px");
    assert.equal(f.target.style.height, "48px");
    f.controller.destroy();
});

test("scroll keeps a keyboard selection while updating screen-coordinate drop geometry", () => {
    const f = fixture();
    f.click();
    f.world.bounds.top -= 100;
    f.scene.bounds.top -= 100;
    emit(f.document, "scroll");
    assert.equal(f.source.getAttribute("aria-pressed"), "true");
    assert.equal(f.target.style.top, "119.5px");
    f.click(f.target);
    assert.equal(f.actions.length, 1);
    f.controller.destroy();
});

test("drag begins at 8 CSS pixels, uses capture, and drops by pointer rather than elevated ghost", () => {
    const f = fixture();
    f.pointer("pointerdown");
    f.pointer("pointermove", { clientX: 157 });
    assert.equal(f.source.captureCalls.length, 0);
    const move = f.pointer("pointermove", { clientX: 158 });
    assert.equal(move.defaultPrevented, true);
    assert.deepEqual(f.source.captureCalls, [1]);
    const ghost = f.body.querySelector(".placement-ghost");
    assert.ok(ghost);
    f.pointer("pointermove", { clientX: 180, clientY: 170 });
    assert.equal(ghost.style.transform, "translate3d(180px, 140px, 0) translate(-50%, -100%)");
    assert.equal(f.target.classList.contains("is-drop-active"), true);
    f.pointer("pointerup", { clientX: 180, clientY: 170 });
    assert.equal(f.actions.length, 1);
    assert.equal(f.source.captures.size, 0);
    assert.equal(f.body.querySelector(".placement-ghost"), null);
    const syntheticClick = f.click(f.root);
    assert.equal(syntheticClick.stopped, true);
    assert.equal(syntheticClick.defaultPrevented, true);
    assert.equal(f.actions.length, 1);
    f.controller.destroy();
});

test("ghost copies self-contained SVG and remaps its IDs and references", () => {
    const f = fixture();
    f.sourceIcon.append(new Element("clipPath", { id: "clip" }));
    f.sourceIcon.append(new Element("path", { "clip-path": "url(#clip)" }));
    f.pointer("pointerdown");
    f.pointer("pointermove", { clientX: 160 });
    const icon = f.body.querySelector(".placement-ghost").querySelector("svg");
    const id = icon.querySelector("clipPath").id;
    assert.match(id, /^placement-ghost-\d+-clip$/);
    assert.equal(icon.querySelector("path").getAttribute("clip-path"), `url(#${id})`);
    assert.equal(f.sourceIcon.querySelector("clipPath").id, "clip");
    f.controller.destroy();
});

test("invalid drops give a gentle hint, clear selection, and never progress", () => {
    const f = fixture({ assisted: true });
    f.pointer("pointerdown");
    f.pointer("pointermove", { clientX: 180, clientY: 330 });
    f.pointer("pointerup", { clientX: 180, clientY: 330 });
    f.click(f.source);
    assert.equal(f.actions.length, 0);
    assert.deepEqual(f.feedback, ["Try the glowing place."]);
    assert.equal(f.source.getAttribute("aria-pressed"), "false");
    f.click();
    assert.equal(f.actions.length, 1);
    f.controller.destroy();
});

test("assisted dragging has a larger CSS-pixel tolerance than find dragging", () => {
    for (const assisted of [false, true]) {
        const f = fixture({ assisted });
        f.pointer("pointerdown");
        f.pointer("pointermove", { clientX: 120, clientY: 170 });
        f.pointer("pointerup", { clientX: 120, clientY: 170 });
        assert.equal(f.actions.length, assisted ? 1 : 0);
        f.controller.destroy();
    }
});

test("secondary pointers cannot move or cancel the primary pointer or synthesize extra writes", () => {
    const f = fixture({ assisted: true });
    f.pointer("pointerdown");
    f.pointer("pointermove", { clientX: 160 });
    f.pointer("pointerdown", { pointerId: 2, isPrimary: false });
    f.pointer("pointermove", { pointerId: 2, clientX: 180, clientY: 170 });
    f.pointer("pointercancel", { pointerId: 2 });
    f.pointer("pointerup", { pointerId: 2, clientX: 180, clientY: 170 });
    f.click(f.source, { pointerId: 2 });
    assert.equal(f.actions.length, 0);
    assert.ok(f.body.querySelector(".placement-ghost"));
    f.pointer("pointerup", { clientX: 180, clientY: 170 });
    f.click(f.source);
    assert.equal(f.actions.length, 1);
    f.controller.destroy();
});

test("a primary pen pointer is ignored while a separate primary mouse pointer is dragging", async () => {
    const f = fixture({ assisted: true });
    f.pointer("pointerdown");
    f.pointer("pointermove", { clientX: 160 });
    f.pointer("pointerdown", { pointerId: 7, pointerType: "pen", isPrimary: true });
    f.pointer("pointerup", { clientX: 180, clientY: 170 });
    f.click();
    await Promise.resolve();
    f.pointer("pointerup", { pointerId: 7, pointerType: "pen", isPrimary: true });
    f.click(f.source, { pointerId: 7, pointerType: "pen" });
    assert.equal(f.actions.length, 1);
    f.controller.destroy();
});

test("pointer cancellation, capture loss, blur, visibility and resize never commit", () => {
    for (const reason of ["pointercancel", "lostpointercapture", "blur", "hidden", "resize", "cancel"]) {
        const f = fixture({ assisted: true });
        f.pointer("pointerdown");
        f.pointer("pointermove", { clientX: 180, clientY: 170 });
        if (reason === "blur" || reason === "resize") emit(f.window, reason);
        else if (reason === "hidden") {
            f.document.hidden = true;
            emit(f.document, "visibilitychange");
        } else if (reason === "cancel") f.controller.cancel();
        else f.pointer(reason);
        f.pointer("pointerup", { clientX: 180, clientY: 170 });
        f.click();
        assert.equal(f.actions.length, 0, reason);
        assert.equal(f.body.querySelector(".placement-ghost"), null, reason);
        assert.equal(f.source.getAttribute("aria-pressed"), "false", reason);
        assert.equal(f.source.captures.size, 0, reason);
        f.controller.cancel();
        f.controller.destroy();
        f.controller.destroy();
    }
});

test("resize between pointerup and a delayed native tap click cancels that tap", () => {
    const f = fixture({ assisted: true });
    f.pointer("pointerdown", { pointerType: "touch" });
    f.pointer("pointerup", { pointerType: "touch" });
    emit(f.window, "resize");
    f.click(f.source, { pointerType: "touch" });
    assert.equal(f.actions.length, 0);
    f.controller.destroy();
});

test("a fresh pointerdown elsewhere clears a canceled gesture's click suppression", () => {
    const f = fixture();
    f.pointer("pointerdown");
    f.pointer("pointercancel");
    const unrelated = new Element("button");
    f.body.append(unrelated);
    assert.equal(emit(unrelated, "pointerdown").stopped, false);
    assert.equal(emit(unrelated, "click").stopped, false);
    f.controller.destroy();
});

test("busy, hidden, disabled and modified interactions cannot place or unlock audio", () => {
    for (const reason of ["busy", "hidden", "inert", "disabled", "aria-disabled", "ctrlKey", "altKey", "metaKey", "shiftKey"]) {
        const f = fixture({ assisted: true });
        if (reason === "busy") f.setEnabled(false);
        if (reason === "hidden") f.document.hidden = true;
        if (reason === "inert") f.root.setAttribute("inert", "");
        if (reason === "disabled") f.source.disabled = true;
        if (reason === "aria-disabled") f.source.setAttribute("aria-disabled", "true");
        const flags = reason.endsWith("Key") ? { [reason]: true } : {};
        f.pointer("pointerdown", flags);
        f.pointer("pointerup", flags);
        f.click(f.source, flags);
        assert.equal(f.actions.length, 0, reason);
        assert.equal(f.unlocks.length, 0, reason);
        f.controller.destroy();
    }
});

test("interaction gates are rechecked on release and after synchronous audio unlock", () => {
    const f = fixture();
    f.pointer("pointerdown");
    f.pointer("pointermove", { clientX: 180, clientY: 170 });
    f.setEnabled(false);
    f.pointer("pointerup", { clientX: 180, clientY: 170 });
    f.setEnabled(true);
    f.click();
    assert.equal(f.actions.length, 0);
    f.controller.destroy();
    let enabled = true;
    const other = fixture({
        assisted: true, canInteract: () => enabled, onInteract: () => { enabled = false; },
    });
    other.click();
    assert.equal(other.actions.length, 0);
    other.controller.destroy();
});

test("keyboard and assistive clicks work despite native click isPrimary being false", () => {
    const f = fixture();
    const keydown = emit(f.source, "keydown", { key: "Enter" });
    assert.equal(keydown.defaultPrevented, false);
    f.click(f.source, { detail: 0, pointerId: -1, pointerType: "" });
    assert.equal(f.source.getAttribute("aria-pressed"), "true");
    assert.equal(emit(f.target, "keydown", { key: " " }).defaultPrevented, false);
    assert.equal(emit(f.target, "keyup", { key: " " }).defaultPrevented, false);
    f.click(f.target, { detail: 0, pointerId: -1, pointerType: "" });
    assert.equal(f.actions.length, 1);
    f.controller.destroy();
});

test("held keys and OS-modified keys suppress native activation without creating replacement clicks", () => {
    const f = fixture({ assisted: true });
    for (const key of ["Enter", " ", "Spacebar"]) {
        for (const flags of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
            assert.equal(emit(f.source, "keydown", { key, ...flags }).defaultPrevented, true);
            assert.equal(emit(f.source, "keyup", { key, ...flags }).defaultPrevented, true);
        }
    }
    assert.equal(f.actions.length, 0);
    f.controller.destroy();
});

test("Escape cancels selection or dragging and stops propagation only when something was handled", () => {
    const f = fixture();
    assert.equal(emit(f.source, "keydown", { key: "Escape" }).stopped, false);
    f.click();
    assert.equal(emit(f.document, "keydown", { key: "Escape" }).stopped, true);
    assert.equal(f.source.getAttribute("aria-pressed"), "false");
    assert.equal(emit(f.document, "keydown", { key: "Escape" }).stopped, false);
    f.pointer("pointerdown");
    f.pointer("pointermove", { clientX: 170 });
    assert.equal(emit(f.document, "keydown", { key: "Escape" }).defaultPrevented, true);
    assert.equal(f.body.querySelector(".placement-ghost"), null);
    f.controller.destroy();
});

test("pending saves lock interactions and destruction while awaiting a save never repaints detached DOM", async () => {
    let resolve;
    const actions = [];
    const f = fixture({
        assisted: true,
        onPlace: action => {
            actions.push(action);
            return new Promise(done => { resolve = done; });
        },
    });
    f.click();
    f.click();
    assert.equal(actions.length, 1);
    assert.equal(f.source.getAttribute("aria-pressed"), "false");
    f.root.remove();
    f.controller.destroy();
    resolve();
    await Promise.resolve();
    assert.equal(f.source.getAttribute("aria-pressed"), null);
    assert.equal(f.source.classes.size, 0);
    assert.equal(f.target.classes.size, 0);
    const elements = [f.document, f.window, f.root];
    assert.equal(elements.flatMap(element => [...element.listeners.values()].flat()).length, 0);
});

test("synchronous placement errors propagate and asynchronous rejections are reported, not swallowed", async () => {
    const failure = new Error("Save failed");
    const f = fixture({ assisted: true, onPlace: () => { throw failure; } });
    assert.throws(() => f.click(), error => error === failure);
    assert.equal(f.source.getAttribute("aria-pressed"), "false");
    assert.throws(() => f.click(), error => error === failure);
    f.controller.destroy();
    const other = fixture({ assisted: true, onPlace: () => Promise.reject(failure) });
    other.click();
    other.controller.destroy();
    await Promise.resolve();
    assert.deepEqual(other.errors, [failure]);
});

test("destroy releases active capture, ghost, selection, target highlights, and every listener", () => {
    const f = fixture();
    f.pointer("pointerdown");
    f.pointer("pointermove", { clientX: 180, clientY: 170 });
    f.controller.destroy();
    assert.equal(f.source.captures.size, 0);
    assert.equal(f.body.querySelector(".placement-ghost"), null);
    assert.equal(f.source.getAttribute("aria-pressed"), null);
    assert.equal(f.target.classList.contains("is-drop-active"), false);
    assert.equal(f.target.classList.contains("is-placement-ready"), false);
    f.click();
    assert.equal(f.actions.length, 0);
    for (const element of [f.root, f.document, f.window]) {
        assert.equal([...element.listeners.values()].flat().length, 0);
    }
    f.controller.cancel();
    f.controller.destroy();
});

test("missing scene and malformed target definitions fail explicitly", () => {
    assert.throws(() => attachPlacement({ root: {}, onPlace() {} }), /gameplay root/);
    assert.throws(() => fixture({ targets: [bowl, bowl] }), /unique IDs/);
    assert.throws(() => fixture({ targets: [{ ...bowl, width: 0 }] }), /positive bounds/);
    assert.throws(() => fixture({ targets: [{ ...bowl, x: Infinity }] }), /positive bounds/);
    const f = fixture();
    f.controller.destroy();
    f.scene.remove();
    assert.throws(() => attachPlacement({ root: f.root, targets: [bowl], onPlace() {} }), /placement-scene/);
});
