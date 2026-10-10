/**
 * Fit a colored picture to GB Studio's color limits: four colors per tile, at most eight palettes (or seven,
 * keeping slot 8 for the UI palette). Shows the picture before and after, which pixels change, and applies it as
 * the picture's tiles and palettes (undoable), optionally adding the palettes to the project in the scene's slots.
 */
import { Palette, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fitPalettes, toRgba } from "../paint";
import { Button, Dialog, Segmented, Switch } from "../ui/kit";
import "./FitWindow.css";

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
  return <figure className="fw-picture"><figcaption className="k-eyebrow">{label}</figcaption><div className="k-well fw-frame"><canvas ref={canvas} /></div></figure>;
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
  const share = Math.round((fit.report.changed / Math.max(1, width * height)) * 1000) / 10;
  const apply = async (intoProject: boolean) => { setBusy(true); try { await onApply(fit, intoProject); onClose(); } finally { setBusy(false); } };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} wide title={`Fit ${name} to GB Studio's colors`} sub={`Four colors per tile, at most ${max} palettes`} icon={<Wand2 size={18} />}
      headExtra={<><span className="k-muted k-small">Palettes</span><Segmented size="sm" label="Palettes" value={String(max)} onChange={(value) => setMax(Number(value))} options={[{ value: "8", label: "8" }, { value: "7", label: "7 · keep slot 8 for the UI", title: "Leaves slot 8 free for the UI palette" }]} /></>}
      footer={<>
        <span className="k-muted k-small">Undo brings the picture back</span>
        <span className="k-spacer" />
        <Button disabled={busy} title="The picture takes these tiles and palettes (undo brings it back)" onClick={() => void apply(false)}>Apply</Button>
        {slotsTarget && <Button variant="primary" icon={<Palette />} disabled={busy} title={`Also adds the ${fit.report.after} palettes to the project and puts them in ${slotsTarget}'s slots; Save then writes the tiles`} onClick={() => void apply(true)}>Apply and put in {slotsTarget}</Button>}
      </>}>
      <div className="k-stack">
        <div className="k-row">
          <Switch checked={showChanges} onChange={setShowChanges}>Show changed pixels</Switch>
        </div>
        <div className="fw-stage">
          <Picture rgba={rgba} width={width} height={height} label="Now" />
          <Picture rgba={after} width={width} height={height} label={showChanges ? "After · changes in magenta" : "After"} />
        </div>
        <p className="k-well fw-report">{fit.report.before} tile palette{fit.report.before === 1 ? "" : "s"} → {fit.report.after} · {fit.report.overfull.length} tile{fit.report.overfull.length === 1 ? "" : "s"} had more than 4 colors · {fit.report.changed} pixel{fit.report.changed === 1 ? "" : "s"} change ({share}%)</p>
      </div>
    </Dialog>
  );
}
