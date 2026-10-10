/**
 * Tile budget fixer (W6): gets a picture under GB Studio's tile limit by merging near-duplicate tiles one step at a
 * time. A copy of the picture is worked on: pick the merges (all checked at first), see each one before and after,
 * merge, undo inside the window, and only "Apply to picture" hands the pixels back (the parent makes it one undo step).
 */
import { ArrowRight, CircleCheck, Sparkles, Undo2 } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { countUniqueTiles, toRgba } from "../paint";
import { Button, Chip, Checkbox, Dialog, Field, Meter, Slider } from "../ui/kit";
import { applyMerges, mergeSteps, tilePixels, type MergeStep } from "./budgetSteps";
import "./BudgetFixer.css";

export interface BudgetFixerProps {
  /** The open picture (a copy is worked on; nothing changes until Apply). */
  picture: { name: string; pixels: Uint8Array; cells: Uint8Array; width: number; height: number; palettes: { name: string; colors: string[] }[] };
  /** The budget: the tile limit and whether flipped tiles merge (Color Only). */
  limit: number; flips: boolean;
  onClose: () => void;
  /** Applies the merged pixels to the picture (the parent makes it one undo step). */
  onApply: (pixels: Uint8Array) => void;
}

/** Rows drawn at most; the rest still merge when checked. */
const SHOWN = 200;
/** Undo steps kept inside the window. */
const HISTORY = 50;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** An 8 × 8 tile, drawn 4× and pixelated by CSS. */
const Thumb = memo(function Thumb({ rgba, label }: { rgba: Uint8ClampedArray; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { canvas.current?.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), 8, 8), 0, 0); }, [rgba]);
  return <canvas ref={canvas} className="bf-thumb" width={8} height={8} role="img" aria-label={label} title={label} />;
});

/** The whole picture with one tile outlined; `patch` (that tile's new look) is drawn over it for the "after". */
function Shot({ image, tile, patch, label }: { image: ImageData; tile: number | null; patch?: Uint8ClampedArray | null; label: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const patched = useRef<number | null>(null);
  const { width, height } = image;
  const cw = Math.ceil(width / 8);
  const at = (cell: number) => [(cell % cw) * 8, Math.floor(cell / cw) * 8] as const;
  // The whole picture, once per change of the picture.
  useEffect(() => { canvas.current?.getContext("2d")!.putImageData(image, 0, 0); patched.current = null; }, [image]);
  // The merged tile on top; the last one is put back first (only its 8 × 8 is redrawn).
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    if (patched.current !== null) { const [x, y] = at(patched.current); context.putImageData(image, 0, 0, x, y, 8, 8); patched.current = null; }
    if (patch && tile !== null) { const [x, y] = at(tile); context.putImageData(new ImageData(new Uint8ClampedArray(patch), 8, 8), x, y); patched.current = tile; }
  }, [image, patch, tile]);
  const [x, y] = tile === null ? [0, 0] : at(tile);
  return (
    <figure className="bf-shot">
      <figcaption className="k-eyebrow">{label}</figcaption>
      <div className="bf-frame">
        <div className="bf-canvas" style={{ width: `min(100%, ${(200 * width) / height}px)`, aspectRatio: `${width} / ${height}` }}>
          <canvas ref={canvas} width={width} height={height} />
          {tile !== null && <span className="bf-outline" style={{ left: `${(x / width) * 100}%`, top: `${(y / height) * 100}%`, width: `${(8 / width) * 100}%`, height: `${(8 / height) * 100}%` }} />}
        </div>
      </div>
    </figure>
  );
}

export function BudgetFixer({ picture, limit, flips, onClose, onApply }: BudgetFixerProps) {
  const { width, height, cells, palettes } = picture;
  const [working, setWorking] = useState(() => picture.pixels.slice());
  const [history, setHistory] = useState<Uint8Array[]>([]);
  const [maxDiff, setMaxDiff] = useState(3);
  // The candidate list and what it was built from (a stale list can't be merged).
  const [found, setFound] = useState<{ steps: MergeStep[]; pixels: Uint8Array; maxDiff: number } | null>(null);
  const [unchecked, setUnchecked] = useState<ReadonlySet<number>>(() => new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [note, setNote] = useState("");

  // The tile comparisons, once per slider change or merge, a beat after the last one.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFound({ steps: mergeSteps(working, width, height, flips, maxDiff), pixels: working, maxDiff });
      setUnchecked(new Set());
    }, 60);
    return () => window.clearTimeout(timer);
  }, [working, width, height, flips, maxDiff]);

  const busy = !found || found.pixels !== working || found.maxDiff !== maxDiff;
  const steps = useMemo(() => found?.steps ?? [], [found]);
  const checked = useMemo(() => steps.filter((step) => !unchecked.has(step.from)), [steps, unchecked]);
  const now = useMemo(() => countUniqueTiles(working, width, height, flips), [working, width, height, flips]);
  const after = useMemo(() => {
    if (busy || !checked.length) return now;
    const copy = working.slice();
    applyMerges(copy, width, checked);
    return countUniqueTiles(copy, width, height, flips);
  }, [busy, checked, now, working, width, height, flips]);

  const image = useMemo(() => new ImageData(new Uint8ClampedArray(toRgba(working, cells, width, palettes)), width, height), [working, cells, width, height, palettes]);
  // A tile as it looks in `place`'s palette (the merged tile keeps its cell's palette).
  const tileRgba = (tile: number, place: number) => toRgba(tilePixels(working, width, height, tile), Uint8Array.of(cells[place] ?? 0), 8, palettes);
  // Thumbnails once per list (a list is only ever built from the current pixels).
  const shown = useMemo(() => steps.slice(0, SHOWN), [steps]);
  const thumbs = useMemo(() => new Map(shown.map((step) => [step.from, { from: tileRgba(step.from, step.from), into: tileRgba(step.into, step.from) }])), [shown]);

  const current = shown.find((step) => step.from === (hovered ?? selected)) ?? shown[0] ?? null;
  const cw = Math.ceil(width / 8);
  const where = (tile: number) => `Tile ${tile % cw + 1}, ${Math.floor(tile / cw) + 1}`;

  const toggle = (from: number, on: boolean) => setUnchecked((old) => { const next = new Set(old); if (on) next.delete(from); else next.add(from); return next; });
  const merge = () => {
    if (busy || !checked.length) return;
    const next = working.slice();
    const applied = applyMerges(next, width, checked);
    if (!applied) return;
    setHistory((old) => [...old.slice(1 - HISTORY), working]);
    setWorking(next);
    setSelected(null);
    setHovered(null);
    setNote(`Merged ${plural(applied, "tile")}${applied < checked.length ? `; ${checked.length - applied} more wait for the next round (they touched a tile just merged)` : ""}.`);
  };
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory(history.slice(0, -1));
    setWorking(last);
    setSelected(null);
    setNote("Undid the last merge.");
  };

  const under = now <= limit;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} wide title="Tile budget fixer" sub={`Bring ${picture.name} under GB Studio's tile limit, one safe step at a time`} icon={<Sparkles size={18} />}
      footer={<>
        <span className="k-muted k-small">{history.length ? `${plural(history.length, "merge step")} made here` : "Nothing changes in the picture until you apply"}</span>
        <span className="k-spacer" />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!history.length} onClick={() => { onApply(working); onClose(); }}>Apply to picture</Button>
      </>}>
      <div className="k-stack">
        <Meter label="Now" value={now} of={limit} tone={now > limit ? "bad" : undefined} title={flips ? "Unique tiles (flipped copies count once, as in a Color Only scene)" : "Unique tiles"} />
        <Meter label="After" value={after} of={limit} tone={after > limit ? "bad" : undefined} title="If the checked merges are made" />
        <Field label={`Merge tiles that differ by at most ${plural(maxDiff, "pixel")}`}
          hint={busy ? "Comparing tiles…" : steps.length ? `${plural(steps.length, "tile")} used once ${steps.length === 1 ? "is" : "are"} this close to another; undo brings them back` : `No tile used once is within ${plural(maxDiff, "pixel")} of another`}>
          <Slider label="Pixels that may differ" value={maxDiff} onChange={setMaxDiff} min={1} max={16} />
        </Field>
        {under && <div className="bf-under"><CircleCheck size={16} />Under the limit — nothing more needed</div>}

        <div className="bf-body">
          <div className="k-stack k-stack--tight">
            <div className="k-row">
              <span className="k-eyebrow">Merges</span>
              {steps.length > 0 && <Chip>{checked.length} of {steps.length} checked</Chip>}
              <span className="k-spacer" />
              <Button size="sm" variant="ghost" disabled={!steps.length} onClick={() => setUnchecked(checked.length ? new Set(steps.map((step) => step.from)) : new Set())}>{checked.length ? "Uncheck all" : "Check all"}</Button>
            </div>
            <div className="bf-list k-well" role="list" aria-busy={busy} onMouseLeave={() => setHovered(null)}>
              {shown.map((step) => {
                const thumb = thumbs.get(step.from);
                return (
                  <div key={step.from} role="listitem" className={`bf-row${current?.from === step.from ? " is-on" : ""}`} onMouseEnter={() => setHovered(step.from)} onClick={() => setSelected(step.from)} onFocus={() => setSelected(step.from)}>
                    <Checkbox checked={!unchecked.has(step.from)} onChange={(on) => toggle(step.from, on)}><span className="bf-where">{where(step.from)}</span></Checkbox>
                    <span className="k-spacer" />
                    {thumb && <><Thumb rgba={thumb.from} label={`${where(step.from)} now`} /><ArrowRight size={14} className="k-muted" /><Thumb rgba={thumb.into} label={`Becomes a copy of ${where(step.into).toLowerCase()}`} /></>}
                    <span className="bf-diff k-small">{plural(step.diff, "px")} differ</span>
                  </div>
                );
              })}
              {!steps.length && <p className="bf-empty k-muted k-small">{busy ? "Comparing tiles…" : under ? "Nothing to merge." : "Nothing this close: allow more differing pixels."}</p>}
              {steps.length > SHOWN && <p className="bf-empty k-muted k-xs">{steps.length - SHOWN} more not shown; checked ones merge too.</p>}
            </div>
            <div className="k-row">
              <Button disabled={busy || !checked.length} onClick={merge}>Merge checked</Button>
              <Button icon={<Undo2 />} disabled={!history.length} onClick={undo}>Undo last merge</Button>
            </div>
            {note && <span className="k-muted k-xs" role="status">{note}</span>}
          </div>
          <div className="k-stack k-stack--tight">
            <Shot image={image} tile={current?.from ?? null} label={current ? <>Before · {where(current.from)}</> : "The picture"} />
            {current && <Shot image={image} tile={current.from} patch={thumbs.get(current.from)?.into} label={<>After · a copy of {where(current.into).toLowerCase()}</>} />}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
