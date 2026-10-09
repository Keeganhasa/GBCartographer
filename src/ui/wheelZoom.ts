/**
 * Mouse wheel on a scrolling view (map, atlas, pixel editor): the wheel scrolls up and down, Shift + wheel scrolls
 * sideways, and Ctrl / ⌘ + wheel (or a trackpad pinch) zooms around the cursor; pinch deltas are smoothed so small
 * ones add up to one step. `zoomTo` must apply the new size to the DOM before it returns (flushSync),
 * so the view is re-centred on the cursor in the same frame and never jumps.
 */
export function attachWheelZoom(scroller: HTMLElement, getScale: () => number, zoomTo: (direction: 1 | -1) => number | null, content: () => Element | null = () => scroller.firstElementChild): () => void {
  let pending = 0;
  let lastStep = 0;
  const onWheel = (event: WheelEvent) => {
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY;
    // Plain wheel scrolls up and down (the browser does it); Shift scrolls sideways; Ctrl / ⌘ (and a trackpad pinch) zooms.
    if (event.shiftKey) {
      event.preventDefault();
      scroller.scrollLeft += delta;
      return;
    }
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    pending += delta;
    const threshold = 8;
    if (Math.abs(pending) < threshold) return;
    // One step per notch, and a short breather so a fast spin or a trackpad fling does not skip several levels.
    const now = performance.now();
    if (now - lastStep < 45) return;
    lastStep = now;
    const direction: 1 | -1 = pending < 0 ? 1 : -1;
    pending = 0;
    const before = getScale();
    // Where the cursor sits on the zoomed content (as a fraction), measured on screen so centring and padding
    // around the content don't matter.
    const target = content();
    const box = target?.getBoundingClientRect();
    if (!target || !box || !box.width || !box.height) {
      zoomTo(direction);
      return;
    }
    const fx = (event.clientX - box.left) / box.width;
    const fy = (event.clientY - box.top) / box.height;
    const after = zoomTo(direction);
    if (after === null || after === before) return;
    const moved = target.getBoundingClientRect();
    scroller.scrollLeft += moved.left + fx * moved.width - event.clientX;
    scroller.scrollTop += moved.top + fy * moved.height - event.clientY;
  };
  scroller.addEventListener("wheel", onWheel, { passive: false });
  return () => scroller.removeEventListener("wheel", onWheel);
}

/** Middle-button drag pans a scrolling view (the browser's own middle-click autoscroll is turned off app-wide). */
export function attachMiddlePan(scroller: HTMLElement): () => void {
  let start: { x: number; y: number; left: number; top: number } | null = null;
  const down = (event: PointerEvent) => {
    if (event.button !== 1) return;
    event.preventDefault();
    start = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
    try {
      scroller.setPointerCapture(event.pointerId);
    } catch {
      // Still pans while the pointer stays over the view.
    }
    scroller.style.cursor = "grabbing";
  };
  const move = (event: PointerEvent) => {
    if (!start) return;
    scroller.scrollLeft = start.left - (event.clientX - start.x);
    scroller.scrollTop = start.top - (event.clientY - start.y);
  };
  const up = () => {
    if (!start) return;
    start = null;
    scroller.style.cursor = "";
  };
  scroller.addEventListener("pointerdown", down, true);
  scroller.addEventListener("pointermove", move, true);
  scroller.addEventListener("pointerup", up, true);
  scroller.addEventListener("pointercancel", up, true);
  return () => {
    scroller.removeEventListener("pointerdown", down, true);
    scroller.removeEventListener("pointermove", move, true);
    scroller.removeEventListener("pointerup", up, true);
    scroller.removeEventListener("pointercancel", up, true);
  };
}

/** The next value up or down a list of zoom steps. */
export function nextStep(steps: readonly number[], value: number, direction: 1 | -1): number {
  if (direction > 0) return steps.find((step) => step > value + 1e-6) ?? steps[steps.length - 1];
  return [...steps].reverse().find((step) => step < value - 1e-6) ?? steps[0];
}

export const ATLAS_ZOOM_STEPS = [0.125, 0.1875, 0.25, 0.375, 0.5, 0.625, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
