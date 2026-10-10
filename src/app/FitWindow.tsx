/**
 * Fit a colored picture to GB Studio's color limits: four colors per tile, at most eight palettes (or seven,
 * keeping slot 8 for the UI palette). Shows the picture before and after, which pixels change, and applies it as
 * the picture's tiles and palettes (undoable), optionally adding the palettes to the project in the scene's slots.
 */
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fitPalettes, toRgba } from "../paint";

interface Props {
  name: string;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  /** Where the palettes can go in the project (a scene's or the defaults' name), or null for a picture outside one. */
  slotsTarget: string | null;
  onClose: () => void;
  onApply: (fit: ReturnType<typeof fitPalettes>, intoProject: boolean) => Promise<void>;
}

function Picture({ rgba, width, height, label }: { rgba: Uint8ClampedArray; width: number; height: number; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    Object.assign(target, { width, height });
    target.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  }, [rgba, width, height]);
  return <figure><figcaption>{label}</figcaption><canvas ref={canvas} /></figure>;
}

export function FitWindow({ name, rgba, width, height, slotsTarget, onClose, onApply }: Props) {
  const [max, setMax] = useState(8);
  const [showChanges, setShowChanges] = useState(false);
  const [busy, setBusy] = useState(false);
  const fit = useMemo(() => fitPalettes(rgba, width, height, max), [rgba, width, height, max]);
  const after = useMemo(() => {
    const out = toRgba(fit.pixels, fit.cells, width, fit.palettes.map((colors, index) => ({ name: `${index}`, colors })));
    if (showChanges) for (let at = 0; at < out.length; at += 4) if (out[at] !== rgba[at] || out[at + 1] !== rgba[at + 1] || out[at + 2] !== rgba[at + 2]) out.set([255, 0, 255, 255], at);
    return out;
  }, [fit, rgba, width, showChanges]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const share = Math.round((fit.report.changed / Math.max(1, width * height)) * 1000) / 10;
  const apply = async (intoProject: boolean) => { setBusy(true); try { await onApply(fit, intoProject); onClose(); } finally { setBusy(false); } };
  return (
    <div className="gbp-modal-backdrop" onClick={onClose}>
      <div className="gbp-modal gbp-sprite-bg gbp-fit" role="dialog" aria-label="Fit to GB Studio's colors" onClick={(event) => event.stopPropagation()}>
        <header className="gbp-modal-head">
          <h2>Fit {name} to GB Studio's colors</h2>
          <span className="gbp-spacer" />
          <label className="gbp-field gbp-inline">Palettes
            <select value={max} onChange={(event) => setMax(Number(event.target.value))}><option value={8}>8</option><option value={7}>7 (keep slot 8 for the UI)</option></select>
          </label>
          <label className="gbp-check"><input type="checkbox" checked={showChanges} onChange={(event) => setShowChanges(event.target.checked)} />Show changed pixels</label>
          <button className="icon-button small" aria-label="Close" onClick={onClose}><X size={14} /></button>
        </header>
        <div className="gbp-sprite-bg-stage gbp-fit-stage">
          <Picture rgba={rgba} width={width} height={height} label="Now" />
          <Picture rgba={after} width={width} height={height} label={showChanges ? "After (changes in magenta)" : "After"} />
        </div>
        <footer className="gbp-sprite-bg-foot">
          <span>{fit.report.before} tile palette{fit.report.before === 1 ? "" : "s"} → {fit.report.after} · {fit.report.overfull.length} tile{fit.report.overfull.length === 1 ? "" : "s"} had more than 4 colors · {fit.report.changed} pixel{fit.report.changed === 1 ? "" : "s"} change ({share}%)</span>
          <span className="gbp-spacer" />
          <button className="quiet-button" disabled={busy} title="The picture takes these tiles and palettes (undo brings it back)" onClick={() => void apply(false)}>Apply</button>
          {slotsTarget && <button className="quiet-button primary" disabled={busy} title={`Also adds the ${fit.report.after} palettes to the project and puts them in ${slotsTarget}'s slots; Save then writes the tiles`} onClick={() => void apply(true)}>Apply and put in {slotsTarget}</button>}
        </footer>
      </div>
    </div>
  );
}
