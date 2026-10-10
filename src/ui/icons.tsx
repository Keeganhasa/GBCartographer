/**
 * Icons lucide doesn't have, drawn in its style (24 grid, 2 px round strokes) so they sit with the rest. They take
 * lucide's `size` prop, so the tool list can hold them like any lucide icon.
 */
import type { ReactNode } from "react";

function Drawn({ size = 24, children }: { size?: number | string; children: ReactNode }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

/** The Line tool: a line from one end dot to the other. */
export function LineEnds({ size }: { size?: number | string }) {
  return <Drawn size={size}><path d="M6 18 18 6" /><circle cx="5" cy="19" r="2" fill="currentColor" /><circle cx="19" cy="5" r="2" fill="currentColor" /></Drawn>;
}

/** The Filled rectangle tool: the Rectangle tool's square, solid. */
export function FilledSquare({ size }: { size?: number | string }) {
  return <Drawn size={size}><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" /></Drawn>;
}
