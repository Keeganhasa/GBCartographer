import { useState, type ReactNode } from "react";

/** A small "?" that shows its explanation when clicked (the text stays out of the way otherwise). */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`gbp-help-button ${open ? "open" : ""}`} aria-label={label} aria-expanded={open} title={label} onClick={() => setOpen(!open)}>?</button>
      {open && <p className="gbp-note gbp-help-text">{children}</p>}
    </>
  );
}
