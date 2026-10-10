import type { ReactNode } from "react";

/**
 * A small pop-up menu at a point (a right-click, or under a button): clicking or right-clicking outside closes it.
 * `width` and `height` keep it inside the window.
 */
export function Menu({ x, y, width = 220, height = 260, className = "", onClose, children }: { x: number; y: number; width?: number; height?: number; className?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="gbp-menu-backdrop" onMouseDown={onClose} onContextMenu={(event) => { event.preventDefault(); onClose(); }}>
      <div className={`gbp-menu ${className}`} role="menu" style={{ left: Math.max(8, Math.min(x, window.innerWidth - width)), top: Math.max(8, Math.min(y, window.innerHeight - height)) }} onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
