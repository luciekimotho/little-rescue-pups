const SOURCE = "[data-placement-tool]";
const TARGET = "[data-drop-target]";
const CONTROL = `${SOURCE}, ${TARGET}`;
const DRAG_DISTANCE = 8;
const MIN_TARGET_SIZE = 48;

export function transformRect(rect, matrix) {
    const points = [
        [rect.x, rect.y], [rect.x + rect.width, rect.y],
        [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height],
    ].map(([x, y]) => ({
        x: matrix.a * x + matrix.c * y + matrix.e,
        y: matrix.b * x + matrix.d * y + matrix.f,
    }));
    const left = Math.min(...points.map(point => point.x));
    const top = Math.min(...points.map(point => point.y));
    return {
        left, top,
        width: Math.max(...points.map(point => point.x)) - left,
        height: Math.max(...points.map(point => point.y)) - top,
    };
}

export function viewBoxMatrix(viewport, viewBox, preserveAspectRatio = "xMidYMid meet") {
    const parts = preserveAspectRatio.trim().replace(/^defer\s+/, "").split(/\s+/);
    const alignment = parts[0] || "xMidYMid";
    let a = viewport.width / viewBox.width;
    let d = viewport.height / viewBox.height;
    let offsetX = 0;
    let offsetY = 0;
    if (alignment !== "none") {
        a = d = parts[1] === "slice" ? Math.max(a, d) : Math.min(a, d);
        const x = alignment.includes("xMax") ? 1 : alignment.includes("xMin") ? 0 : 0.5;
        const y = alignment.includes("YMax") ? 1 : alignment.includes("YMin") ? 0 : 0.5;
        offsetX = (viewport.width - viewBox.width * a) * x;
        offsetY = (viewport.height - viewBox.height * d) * y;
    }
    return {
        a, b: 0, c: 0, d,
        e: viewport.left + offsetX - viewBox.x * a,
        f: viewport.top + offsetY - viewBox.y * d,
    };
}

export function minimumTargetRect(rect, minimum = MIN_TARGET_SIZE) {
    const width = Math.max(minimum, rect.width);
    const height = Math.max(minimum, rect.height);
    return {
        left: rect.left - (width - rect.width) / 2,
        top: rect.top - (height - rect.height) / 2,
        width, height,
    };
}

export function offsetParentRect(rect, parentRect, {
    clientLeft = 0, clientTop = 0, scrollLeft = 0, scrollTop = 0,
    offsetWidth = parentRect.width, offsetHeight = parentRect.height,
} = {}) {
    const scaleX = parentRect.width / offsetWidth || 1;
    const scaleY = parentRect.height / offsetHeight || 1;
    return {
        left: (rect.left - parentRect.left) / scaleX - clientLeft + scrollLeft,
        top: (rect.top - parentRect.top) / scaleY - clientTop + scrollTop,
        width: rect.width / scaleX,
        height: rect.height / scaleY,
    };
}

export function hitTestTargets(point, targets, tolerance = 0) {
    let best = null;
    let bestDistance = Infinity;
    let bestCenter = Infinity;
    for (const target of targets) {
        const rect = target.rect;
        const dx = Math.max(rect.left - point.x, 0, point.x - rect.left - rect.width);
        const dy = Math.max(rect.top - point.y, 0, point.y - rect.top - rect.height);
        const distance = dx * dx + dy * dy;
        const center = (point.x - rect.left - rect.width / 2) ** 2
            + (point.y - rect.top - rect.height / 2) ** 2;
        if (distance <= tolerance ** 2
            && (distance < bestDistance || (distance === bestDistance && center < bestCenter))) {
            best = target;
            bestDistance = distance;
            bestCenter = center;
        }
    }
    return best;
}

function sceneMatrix(scene) {
    const viewport = scene.getBoundingClientRect();
    if (!viewport.width || !viewport.height) return null;
    try {
        const matrix = scene.getScreenCTM?.();
        if (matrix && ["a", "b", "c", "d", "e", "f"].every(key => Number.isFinite(matrix[key]))
            && matrix.a * matrix.d - matrix.b * matrix.c !== 0) return matrix;
    } catch {
        // Some browsers cannot provide a CTM while SVG layout is being attached.
    }
    const values = (scene.getAttribute("viewBox") || "0 0 1000 500")
        .trim().split(/[\s,]+/).map(Number);
    if (values.length !== 4 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) return null;
    const [x, y, width, height] = values;
    return viewBoxMatrix(viewport, { x, y, width, height }, scene.getAttribute("preserveAspectRatio") || undefined);
}

let ghostSequence = 0;

function ghostIcon(source) {
    const icon = source.querySelector("svg")?.cloneNode(true);
    if (!icon) return null;
    const prefix = `placement-ghost-${++ghostSequence}-`;
    const elements = [icon, ...icon.querySelectorAll("*")];
    const ids = new Map();
    for (const element of elements) {
        if (element.id) ids.set(element.id, prefix + element.id);
    }
    for (const element of elements) {
        for (const attribute of [...element.attributes]) {
            let value = attribute.value;
            if (attribute.name === "id") value = ids.get(value);
            else if (attribute.name === "href" || attribute.name === "xlink:href") {
                if (value.startsWith("#") && ids.has(value.slice(1))) value = "#" + ids.get(value.slice(1));
            } else value = value.replace(/url\(['"]?#([^)'"]+)['"]?\)/g,
                (match, id) => ids.has(id) ? `url(#${ids.get(id)})` : match);
            element.setAttribute(attribute.name, value);
        }
    }
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    return icon;
}

export function attachPlacement({
    root, assisted = false, targets = [], canInteract = () => true,
    onInteract = () => {}, onPlace, onFeedback = () => {},
}) {
    if (!root?.querySelector || typeof onPlace !== "function") {
        throw new TypeError("Placement needs a gameplay root and an onPlace callback.");
    }
    const scene = root.querySelector(".placement-scene");
    const world = root.querySelector(".world");
    if (!scene || !world) throw new TypeError("Placement needs a .placement-scene and .world.");
    const document = root.ownerDocument;
    const window = document.defaultView;
    const sources = [...root.querySelectorAll(SOURCE)];
    const buttons = [...root.querySelectorAll(TARGET)];
    const ids = new Set();
    const entries = targets.map(target => {
        if (!target || typeof target.id !== "string" || !target.id || ids.has(target.id)
            || !["x", "y", "width", "height"].every(key => Number.isFinite(target[key]))
            || target.width <= 0 || target.height <= 0) {
            throw new TypeError("Placement targets need unique IDs and finite positive bounds.");
        }
        ids.add(target.id);
        const button = buttons.find(button => button.dataset.dropTarget === target.id);
        if (!button || !world.contains(button)) throw new TypeError(`Missing placement target: ${target.id}`);
        return { ...target, button, rect: null };
    });
    const restorations = [
        ...sources.map(element => ({ element, pressed: element.getAttribute("aria-pressed") })),
        ...entries.map(({ button: element }) => ({
            element, label: element.getAttribute("aria-label"),
            style: ["left", "top", "width", "height"].map(key => [key, element.style[key]]),
        })),
    ];
    const removers = [];
    const ignoredPointers = new Set();
    let selected = null;
    let pointer = null;
    let ghost = null;
    let suppressedClick = null;
    let pendingTap = null;
    let destroyed = false;
    let pending = false;
    let layoutSignature = "";
    const tolerance = assisted ? 32 : 14;

    function listen(element, type, handler, options) {
        element.addEventListener(type, handler, options);
        removers.push(() => element.removeEventListener(type, handler, options));
    }

    function live() {
        return !destroyed && root.isConnected && scene.isConnected && root.contains(scene);
    }

    function allowed() {
        return live() && !pending && !document.hidden && !root.closest("[hidden], [inert]")
            && canInteract();
    }

    function usable(element) {
        return element && element.isConnected && root.contains(element)
            && !element.disabled && element.getAttribute("aria-disabled") !== "true"
            && !element.closest("[hidden], [inert]");
    }

    function controlFor(event) {
        const control = event.target?.closest?.(CONTROL);
        return control && root.contains(control) ? control : null;
    }

    function modified(event) {
        return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    }

    function consume(event, prevent = false) {
        event.stopPropagation();
        if (prevent && event.cancelable) event.preventDefault();
    }

    function paintSelection(source = null) {
        selected = source;
        if (!live()) return;
        for (const button of sources) {
            const active = source === button;
            button.setAttribute("aria-pressed", String(active));
            button.classList.toggle("is-placement-selected", active);
        }
        for (const entry of entries) {
            entry.button.classList.toggle("is-placement-ready", Boolean(source));
            entry.button.classList.remove("is-drop-active");
        }
    }

    function releasePointer(suppress = false) {
        const previous = pointer;
        pointer = null;
        ghost?.remove();
        ghost = null;
        if (!previous) return;
        if (suppress) suppressedClick = { id: previous.id };
        previous.source.classList.remove("is-placement-dragging");
        try {
            if (previous.source.hasPointerCapture?.(previous.id)) previous.source.releasePointerCapture(previous.id);
        } catch {
            // A removed source or a canceled pointer may already have lost capture.
        }
    }

    function cancel() {
        if (pendingTap) suppressedClick = pendingTap;
        pendingTap = null;
        releasePointer(true);
        paintSelection();
    }

    function positionTargets({ cancelOnChange = true } = {}) {
        if (!live()) return;
        const matrix = sceneMatrix(scene);
        if (!matrix) {
            for (const entry of entries) entry.rect = null;
            cancel();
            return;
        }
        const worldBounds = world.getBoundingClientRect();
        const scaleX = worldBounds.width / world.offsetWidth || 1;
        const scaleY = worldBounds.height / world.offsetHeight || 1;
        const visible = {
            left: worldBounds.left + world.clientLeft * scaleX,
            top: worldBounds.top + world.clientTop * scaleY,
            width: (world.clientWidth ?? world.offsetWidth - world.clientLeft * 2) * scaleX,
            height: (world.clientHeight ?? world.offsetHeight - world.clientTop * 2) * scaleY,
        };
        const positioned = entries.map(entry => {
            const rect = minimumTargetRect(transformRect(entry, matrix));
            rect.left = Math.max(visible.left, Math.min(rect.left, visible.left + visible.width - rect.width));
            rect.top = Math.max(visible.top, Math.min(rect.top, visible.top + visible.height - rect.height));
            const parent = entry.button.offsetParent || world;
            const parentBounds = parent.getBoundingClientRect();
            const local = offsetParentRect(rect, parentBounds, parent);
            return { entry, rect, local };
        });
        const signature = JSON.stringify(positioned.map(({ rect }) => rect));
        if (cancelOnChange && layoutSignature && signature !== layoutSignature) cancel();
        layoutSignature = signature;
        for (const { entry, rect, local } of positioned) {
            entry.rect = rect;
            for (const key of ["left", "top", "width", "height"]) entry.button.style[key] = `${local[key]}px`;
        }
    }

    function activeTargets() {
        return entries.filter(entry => entry.rect && usable(entry.button));
    }

    function targetAt(event) {
        return hitTestTargets({ x: event.clientX, y: event.clientY }, activeTargets(), tolerance);
    }

    function highlight(entry) {
        for (const target of entries) target.button.classList.toggle("is-drop-active", target === entry);
    }

    function moveGhost(event) {
        if (ghost) ghost.style.transform = `translate3d(${event.clientX}px, ${event.clientY - 30}px, 0) translate(-50%, -100%)`;
        highlight(targetAt(event));
    }

    function startDrag(event) {
        pointer.dragging = true;
        paintSelection(pointer.source);
        pointer.source.classList.add("is-placement-dragging");
        try {
            pointer.source.setPointerCapture(event.pointerId);
        } catch {
            // Document pointer listeners also handle browsers that cannot capture this pointer.
        }
        ghost = document.createElement("div");
        ghost.className = "placement-ghost";
        ghost.setAttribute("aria-hidden", "true");
        const icon = ghostIcon(pointer.source);
        if (icon) ghost.append(icon);
        else ghost.textContent = pointer.source.getAttribute("aria-label") || pointer.source.dataset.placementTool;
        document.body.append(ghost);
        moveGhost(event);
    }

    function reportAsyncError(error) {
        if (typeof window.reportError === "function") window.reportError(error);
        else queueMicrotask(() => { throw error; });
    }

    function place(source, target) {
        if (!allowed() || !usable(source) || !target || !usable(target.button)) {
            cancel();
            return;
        }
        const action = { type: "place", tool: source.dataset.placementTool, targetId: target.id };
        pending = true;
        cancel();
        let result;
        try {
            result = onPlace(action);
        } catch (error) {
            pending = false;
            throw error;
        }
        // No success effects here: the parent saves first and may replace this entire root.
        Promise.resolve(result).then(
            () => { pending = false; },
            error => {
                pending = false;
                reportAsyncError(error);
            },
        );
    }

    function pointerDown(event) {
        if (event.isPrimary === false || event.button !== 0) {
            if (controlFor(event)) {
                ignoredPointers.add(event.pointerId);
                consume(event);
            }
            return;
        }
        ignoredPointers.delete(event.pointerId);
        if (pointer) {
            if (controlFor(event)) {
                if (pointer.id !== event.pointerId) ignoredPointers.add(event.pointerId);
                consume(event, true);
            }
            return;
        }
        suppressedClick = null;
        pendingTap = null;
        const source = event.target?.closest?.(SOURCE);
        if (!source || !root.contains(source)) return;
        consume(event);
        if (modified(event) || !allowed() || !usable(source)) {
            suppressedClick = { id: event.pointerId };
            return;
        }
        onInteract();
        if (!allowed()) return;
        pointer = {
            id: event.pointerId, source, x: event.clientX, y: event.clientY, dragging: false,
        };
    }

    function pointerMove(event) {
        if (!pointer || pointer.id !== event.pointerId) return;
        if (!allowed() || !usable(pointer.source) || modified(event)
            || (event.buttons !== undefined && (event.buttons & 1) === 0)) {
            cancel();
            return;
        }
        consume(event, pointer.dragging);
        if (!pointer.dragging
            && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >= DRAG_DISTANCE) {
            startDrag(event);
            consume(event, true);
        } else if (pointer.dragging) moveGhost(event);
    }

    function pointerUp(event) {
        if (!pointer || pointer.id !== event.pointerId) return;
        consume(event, pointer.dragging);
        if (!allowed() || modified(event) || event.button !== 0) {
            cancel();
            return;
        }
        const previous = pointer;
        if (!previous.dragging) {
            releasePointer();
            pendingTap = { id: previous.id };
            return;
        }
        positionTargets();
        if (pointer !== previous) return;
        const target = targetAt(event);
        releasePointer(true);
        if (target) place(previous.source, target);
        else {
            paintSelection();
            onFeedback("Try the glowing place.");
        }
    }

    function pointerCancel(event) {
        if (!pointer || pointer.id !== event.pointerId) return;
        consume(event);
        cancel();
    }

    function click(event) {
        const control = controlFor(event);
        if (ignoredPointers.has(event.pointerId)) {
            ignoredPointers.delete(event.pointerId);
            consume(event, true);
            return;
        }
        const pointerClick = event.detail > 0 || Boolean(event.pointerType);
        if (suppressedClick && pointerClick
            && (event.pointerId === undefined || event.pointerId === suppressedClick.id || event.pointerId === -1)) {
            suppressedClick = null;
            pendingTap = null;
            consume(event, true);
            return;
        }
        if (!control) return;
        consume(event, true);
        if (event.button > 0 || modified(event) || event.repeat
            || pointer || !allowed() || !usable(control)) return;
        suppressedClick = null;
        pendingTap = null;
        onInteract();
        if (!allowed()) return;
        if (control.matches(SOURCE)) {
            positionTargets();
            paintSelection(control);
            const available = activeTargets();
            if (assisted && available.length === 1) place(control, available[0]);
        } else {
            const target = entries.find(entry => entry.button === control);
            if (!selected) onFeedback("Choose a picture first.");
            else if (target) place(selected, target);
        }
    }

    function keyDown(event) {
        if (event.key === "Escape" && (pointer || pendingTap || selected)) {
            consume(event, true);
            cancel();
            return;
        }
        if (!controlFor(event) || !["Enter", " ", "Spacebar"].includes(event.key)) return;
        if (event.repeat || modified(event) || !allowed()) consume(event, true);
        else {
            suppressedClick = null;
            pendingTap = null;
            consume(event);
        }
    }

    function keyUp(event) {
        if (!controlFor(event) || !["Enter", " ", "Spacebar"].includes(event.key)) return;
        consume(event, event.repeat || modified(event) || !allowed());
    }

    function resize() {
        cancel();
        positionTargets();
    }

    function scroll() {
        if (pointer) cancel();
        positionTargets({ cancelOnChange: false });
    }

    function destroy() {
        if (destroyed) return;
        cancel();
        destroyed = true;
        for (const remove of removers) remove();
        for (const source of sources) source.classList.remove("is-placement-selected", "is-placement-dragging");
        for (const entry of entries) entry.button.classList.remove("is-placement-ready", "is-drop-active");
        for (const original of restorations) {
            if (Object.hasOwn(original, "pressed")) {
                if (original.pressed === null) original.element.removeAttribute("aria-pressed");
                else original.element.setAttribute("aria-pressed", original.pressed);
            } else {
                if (original.label === null) original.element.removeAttribute("aria-label");
                else original.element.setAttribute("aria-label", original.label);
                for (const [key, value] of original.style) original.element.style[key] = value;
            }
        }
    }

    for (const entry of entries) {
        if (!entry.button.getAttribute("aria-label") && entry.label) entry.button.setAttribute("aria-label", entry.label);
    }
    paintSelection();
    positionTargets();
    listen(document, "pointerdown", pointerDown, true);
    listen(document, "pointermove", pointerMove, { capture: true, passive: false });
    listen(document, "pointerup", pointerUp, true);
    listen(document, "pointercancel", pointerCancel, true);
    listen(document, "lostpointercapture", pointerCancel, true);
    listen(document, "click", click, true);
    listen(document, "keydown", keyDown, true);
    listen(document, "keyup", keyUp, true);
    listen(window, "blur", cancel);
    listen(window, "resize", resize);
    listen(document, "visibilitychange", () => { if (document.hidden) cancel(); });
    listen(document, "scroll", scroll, { capture: true, passive: true });
    if (window.visualViewport) {
        listen(window.visualViewport, "resize", resize);
        listen(window.visualViewport, "scroll", scroll);
    }
    if (window.ResizeObserver) {
        const observer = new window.ResizeObserver(positionTargets);
        observer.observe(scene);
        observer.observe(world);
        removers.push(() => observer.disconnect());
    }
    return { cancel, destroy };
}
