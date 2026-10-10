/**
 * Clipped text scrolls like a ticker tape on hover (the author's review note C2): any element that cuts its text
 * with an ellipsis slides to show the rest while the pointer is over it, then back. One listener for the whole
 * page; nothing moves when the system asks for reduced motion.
 */
const MAX_DEPTH = 3;

function clipped(start: Element | null): HTMLElement | null {
  let element = start as HTMLElement | null;
  for (let depth = 0; element && depth < MAX_DEPTH; depth += 1, element = element.parentElement) {
    if (element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).textOverflow === "ellipsis") return element;
  }
  return null;
}

export function installTicker(): () => void {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};
  let ticking: HTMLElement | null = null;
  const stop = () => { ticking?.classList.remove("k-ticker"); ticking = null; };
  const over = (event: MouseEvent) => {
    const element = clipped(event.target as Element);
    if (element === ticking) return;
    stop();
    if (!element) return;
    const distance = element.scrollWidth - element.clientWidth;
    element.style.setProperty("--k-ticker-shift", `${-distance - 4}px`);
    // About 40 px a second, never quicker than two seconds each way.
    element.style.setProperty("--k-ticker-time", `${Math.max(2, distance / 40)}s`);
    element.classList.add("k-ticker");
    ticking = element;
  };
  document.addEventListener("mouseover", over);
  document.addEventListener("mouseleave", stop);
  return () => { document.removeEventListener("mouseover", over); document.removeEventListener("mouseleave", stop); stop(); };
}
