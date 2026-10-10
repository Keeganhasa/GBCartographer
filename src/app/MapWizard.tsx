/**
 * The New map wizard (W7, 2026-10-10), opened from the Map Room: an adventure-style grid of screens on one page, with a
 * live visualizer of the whole map and a thin Game Boy Color screen outline over one screen's worth (what the player
 * sees at once). Each screen starts blank, cut from one big picture (fitted like Picture to background), or from a
 * background already in the project. The wizard only plans; the Map Room writes the new PNGs and the layout.
 */
import { ImagePlus, Map as MapIcon, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { countUniqueTiles, fitTileBudget, toRgba } from "../paint";
import { Button, Checkbox, Chip, Dialog, Field, Meter, Segmented, Select, Slider, Switch } from "../ui/kit";
import type { Picture } from "./mapEdges";
import type { Asset } from "./model";
import { fitPicture, type FitResult } from "./pictureFit";
import "./MapWizard.css";

/** One screen of the planned map: a background already in the project, or a new PNG (blank when no picture). */
export interface PlannedCell { x: number; y: number; existing?: string; name?: string; picture?: Picture }
export interface MapPlan { name: string; overlap: 1 | 2; cells: PlannedCell[] }

type Start = "blank" | "picture" | "existing";
interface Screen { greens: Uint8ClampedArray; colors: Uint8ClampedArray; tiles: number }

const W = 160, H = 144, MAX = 8, GAP = 2;
/** The Map Room's tile meter: unique tiles in shades, against what a background can have. */
const SCREEN_TILES = 192;
const LIGHTEST = "#E0F8CF";
// The visualizer picks the biggest of these that fits its box, so a 1 × 1 map shows at full size and 8 × 8 fits.
const SCALES = [1, 0.75, 0.5, 0.375, 0.25, 0.1875];
const FIT_H = 440;
const NAME = /^[\w ()\-.]+$/;
const clamp = (value: number) => Math.max(1, Math.min(MAX, Math.round(value) || 1));
const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "map";
const previewOf = (asset: Asset) => `./__cartographer/gbstudio-asset-preview?${new URLSearchParams({ kind: "backgrounds", file: asset.file })}&v=${Math.round(asset.mtime)}&pv=2`;

/** Draws the picture to fill width × height (cropped, panned 0–100 each way) on the lightest green. */
function cover(image: ImageBitmap, width: number, height: number, panX: number, panY: number): Uint8ClampedArray {
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = LIGHTEST;
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale, h = image.height * scale;
  context.drawImage(image, -(w - width) * panX / 100, -(h - height) * panY / 100, w, h);
  return context.getImageData(0, 0, width, height).data;
}

/**
 * One screen cut from the fitted picture at (sx, sy), both whole tiles. With `budget` its near tiles merge until it
 * is within the Map Room's tile count (this may make a shared edge differ by a few tiles; the Map Room shows them).
 */
function cut(result: FitResult, sx: number, sy: number, budget: boolean): Screen {
  let pixels = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) pixels.set(result.pixels.subarray((sy + y) * result.width + sx, (sy + y) * result.width + sx + W), y * W);
  const wide = Math.ceil(result.width / 8), cells = new Uint8Array((W / 8) * (H / 8));
  for (let cy = 0; cy < H / 8; cy += 1) for (let cx = 0; cx < W / 8; cx += 1) cells[cy * (W / 8) + cx] = result.cells[(sy / 8 + cy) * wide + sx / 8 + cx];
  let tiles = countUniqueTiles(pixels, W, H, false);
  if (budget && tiles > SCREEN_TILES) { const under = fitTileBudget(pixels, W, H, false, SCREEN_TILES); pixels = under.pixels; tiles = under.tiles; }
  // No palettes given: every cell draws in the GB greens, as the PNG is written.
  return { greens: toRgba(pixels, cells, W), colors: toRgba(pixels, cells, W, result.palettes.map((colors, index) => ({ name: `${index}`, colors }))), tiles };
}

function ScreenCanvas({ rgba }: { rgba: Uint8ClampedArray }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { canvas.current?.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), W, H), 0, 0); }, [rgba]);
  return <canvas ref={canvas} width={W} height={H} />;
}

export function MapWizard({ suggestedName, backgrounds, onCancel, onCreate }: {
  suggestedName: string; backgrounds: Asset[]; onCancel: () => void;
  /** Writes the plan (new PNGs, then the layout); `progress` counts the new PNGs as they are made. */
  onCreate: (plan: MapPlan, progress: (done: number, of: number) => void) => Promise<void>;
}) {
  const [name, setName] = useState(suggestedName);
  // The file names follow the map's name until they are typed over.
  const [prefix, setPrefix] = useState<string | null>(null);
  const [cols, setCols] = useState(2);
  const [rows, setRows] = useState(2);
  const [overlap, setOverlap] = useState<1 | 2>(1);
  const [start, setStart] = useState<Start>("blank");
  const [source, setSource] = useState<{ image: ImageBitmap; name: string } | null>(null);
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [keep, setKeep] = useState(32);
  const [dither, setDither] = useState(false);
  const [max, setMax] = useState<7 | 8>(8);
  const [budget, setBudget] = useState(true);
  const [view, setView] = useState<"colors" | "greens">("colors");
  const [placing, setPlacing] = useState(backgrounds[0]?.file ?? "");
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [fillRest, setFillRest] = useState(true);
  const [hover, setHover] = useState({ x: 0, y: 0 });
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<FitResult | null>(null);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  // The preview box's inner width, so the screens scale to the window.
  const box = useRef<HTMLDivElement>(null);
  const [fitW, setFitW] = useState(720);
  useEffect(() => {
    const target = box.current;
    if (!target) return;
    const observer = new ResizeObserver(() => setFitW(target.clientWidth - 34));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  const filePrefix = (prefix ?? slugOf(name)).trim();

  // Neighbouring screens share `overlap` tile columns or rows, so the big picture is that much smaller than
  // cols × 160 by rows × 144, and screens cut from it meet edge to edge.
  const stepX = W - overlap * 8, stepY = H - overlap * 8;
  const total = { width: cols * stepX + overlap * 8, height: rows * stepY + overlap * 8 };

  const take = async (picked: File | Blob | null | undefined, label?: string) => {
    if (!picked) return;
    try {
      const image = await createImageBitmap(picked, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      setSource({ image, name: label ?? (picked instanceof File ? picked.name : "picture") });
      setStart("picture");
    } catch { /* not a picture */ }
  };

  // Paste a picture from the clipboard while the wizard is open.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => { const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith("image/")); if (item) { event.preventDefault(); void take(item.getAsFile(), "Pasted picture"); } };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const framed = useMemo(() => start === "picture" && source ? cover(source.image, total.width, total.height, pan.x, pan.y) : null, [start, source, total.width, total.height, pan.x, pan.y]);
  // The fit is the slow part on a big map: run it a beat after the last change.
  useEffect(() => {
    if (!framed) return setResult(null);
    setWorking(true);
    const timer = window.setTimeout(() => { setResult(fitPicture(framed, total.width, total.height, { keep, dither, max, budget: false })); setWorking(false); }, 150);
    return () => window.clearTimeout(timer);
  }, [framed, keep, dither, max]);
  // A result from before the grid changed size doesn't cut into this grid.
  const fits = result && result.width === total.width && result.height === total.height ? result : null;
  const screens = useMemo(() => fits ? Array.from({ length: cols * rows }, (_, at) => cut(fits, (at % cols) * stepX, Math.floor(at / cols) * stepY, budget)) : null, [fits, cols, rows, stepX, stepY, budget]);
  const worst = screens ? Math.max(...screens.map((screen) => screen.tiles)) : 0;

  // What Create makes, screen by screen.
  const plan = useMemo<PlannedCell[]>(() => Array.from({ length: cols * rows }, (_, at): PlannedCell | null => {
    const x = at % cols, y = Math.floor(at / cols), fresh = `${filePrefix}_${x}_${y}`;
    if (start === "picture") return screens ? { x, y, name: fresh, picture: { rgba: screens[at].greens, width: W, height: H } } : { x, y, name: fresh };
    if (start === "existing" && placed[`${x},${y}`]) return { x, y, existing: placed[`${x},${y}`] };
    return start === "blank" || fillRest ? { x, y, name: fresh } : null;
  }).filter((cell): cell is PlannedCell => Boolean(cell)), [cols, rows, start, screens, placed, fillRest, filePrefix]);
  const fresh = plan.filter((cell) => cell.name);
  const taken = new Set(backgrounds.map((asset) => asset.file.toLowerCase()));
  const clashes = fresh.filter((cell) => taken.has(`${cell.name}.png`.toLowerCase()));
  const prefixOk = NAME.test(filePrefix) && !filePrefix.startsWith(".");
  const busy = progress !== null;
  const ready = Boolean(name.trim()) && plan.length > 0 && (!fresh.length || (prefixOk && !clashes.length)) && (start !== "picture" || Boolean(screens && !working));

  const scale = SCALES.find((s) => cols * W * s + (cols - 1) * GAP <= fitW && rows * H * s + (rows - 1) * GAP <= FIT_H) ?? SCALES[SCALES.length - 1];
  const cw = W * scale, ch = H * scale;
  const at = { x: Math.min(hover.x, cols - 1), y: Math.min(hover.y, rows - 1) };
  const assetOf = (file: string) => backgrounds.find((asset) => asset.file === file);

  async function create() {
    setProgress([0, fresh.length]);
    try { await onCreate({ name: name.trim(), overlap, cells: plan }, (done, of) => setProgress([done, of])); } finally { setProgress(null); }
  }

  const parts = !plan.length ? "Nothing to make yet: place a background or make blank screens for the rest."
    : [fresh.length ? `Writes ${fresh.length} new PNG${fresh.length === 1 ? "" : "s"} in assets/backgrounds/ (${fresh[0].name}.png${fresh.length > 1 ? ` … ${fresh[fresh.length - 1].name}.png` : ""})` : "",
      plan.length > fresh.length ? `places ${plan.length - fresh.length} background${plan.length - fresh.length === 1 ? "" : "s"} already in the project` : "",
      "and saves the layout in the project's Cartographer/maps.json."].filter(Boolean).join(", ");
  const summary = parts.charAt(0).toUpperCase() + parts.slice(1);

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel(); }} wide icon={<MapIcon size={18} />} title="New map"
      sub="An adventure-style grid of screens, each a 160 × 144 background; change anything and the preview follows"
      footer={<>
        <span className="k-muted k-xs mw-summary" title={summary}>{summary}</span>
        <span className="k-spacer" />
        <Button disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={!ready || busy} onClick={() => void create()}>{progress ? `Making ${progress[0]} / ${progress[1]}…` : "Create map"}</Button>
      </>}>
      <div className="mw-body">
        <div className="mw-stage" onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setOver(false); void take(event.dataTransfer.files?.[0]); }}>
          <div className="k-row">
            <span className="k-eyebrow">Preview · {cols} × {rows} screens · live</span>
            <span className="k-spacer" />
            {working && <Chip>fitting…</Chip>}
            {start === "picture" && screens && <Segmented size="sm" label="Show" value={view} onChange={setView} options={[{ value: "colors", label: "Colors", title: "The colors the fit found (brought in later with Fit colors…)" }, { value: "greens", label: "As written", title: "The PNGs as written: GB greens" }]} />}
          </div>
          <div ref={box} className={`k-well mw-view${over ? " is-over" : ""}`}>
            <div className="mw-cells" style={{ gridTemplateColumns: `repeat(${cols}, ${cw}px)`, gridAutoRows: `${ch}px`, gap: GAP }}
              onMouseMove={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                const x = Math.max(0, Math.min(cols - 1, Math.floor((event.clientX - box.left) / (cw + GAP)))), y = Math.max(0, Math.min(rows - 1, Math.floor((event.clientY - box.top) / (ch + GAP))));
                if (x !== at.x || y !== at.y) setHover({ x, y });
              }}>
              {Array.from({ length: cols * rows }, (_, index) => {
                const x = index % cols, y = Math.floor(index / cols), key = `${x},${y}`;
                const screen = start === "picture" ? screens?.[index] : undefined;
                const existing = start === "existing" ? assetOf(placed[key] ?? "") : undefined;
                const blank = start === "blank" || (start === "existing" && !existing && fillRest);
                const content = screen ? <ScreenCanvas rgba={view === "greens" ? screen.greens : screen.colors} />
                  : existing ? <><img src={previewOf(existing)} alt="" /><span className="mw-label">{existing.name}</span></>
                  : null;
                const className = `mw-cell${blank ? " mw-cell--blank" : !content ? " mw-cell--empty" : ""}`;
                return start === "existing"
                  ? <button key={key} type="button" className={className} title={existing ? `${existing.name} at ${x}, ${y}: click to take it off` : `Put the chosen background at ${x}, ${y}`}
                    onClick={() => setPlaced((current) => { const next = { ...current }; if (current[key] === placing || !placing) delete next[key]; else next[key] = placing; return next; })}>{content}</button>
                  : <div key={key} className={className} title={`Screen ${x}, ${y}`}>{content}</div>;
              })}
              <div className="mw-gbc" aria-hidden="true" style={{ left: at.x * (cw + GAP), top: at.y * (ch + GAP), width: cw, height: ch }}><span>160 × 144</span></div>
            </div>
            {start === "picture" && !source && (
              <div className="mw-drop">
                <ImagePlus size={28} />
                <div><b>Drop a picture here</b><br /><span className="k-small">or paste one, or <button type="button" className="mw-link" onClick={() => file.current?.click()}>choose a file</button></span></div>
                <span className="k-muted k-xs">It fills the whole map ({total.width} × {total.height} px), is fitted to 4 colors a tile, and is cut into {cols * rows} screen{cols * rows === 1 ? "" : "s"}.</span>
              </div>
            )}
          </div>
          <span className="k-muted k-xs">The thin outline is one Game Boy Color screen, 160 × 144: what the player sees at once. Neighbouring screens share {overlap} tile{overlap === 1 ? "" : "s"} at each edge.</span>
        </div>

        <div className="mw-controls">
          <Field label="Map name"><input className="k-input" autoFocus value={name} placeholder="e.g. Overworld" onChange={(event) => setName(event.target.value)} /></Field>
          <div className="k-row mw-grid-row">
            <Field label="Columns"><input className="k-input k-input--num" type="number" min={1} max={MAX} value={cols} onChange={(event) => { if (!Number.isNaN(event.target.valueAsNumber)) setCols(clamp(event.target.valueAsNumber)); }} /></Field>
            <Field label="Rows"><input className="k-input k-input--num" type="number" min={1} max={MAX} value={rows} onChange={(event) => { if (!Number.isNaN(event.target.valueAsNumber)) setRows(clamp(event.target.valueAsNumber)); }} /></Field>
            <div className="k-field" title="How many tile columns or rows neighbouring screens share at each edge">
              <span className="k-label">Edge overlap</span>
              <Segmented size="sm" label="Edge overlap" value={String(overlap) as "1" | "2"} onChange={(value) => setOverlap(Number(value) as 1 | 2)} options={[{ value: "1", label: "1 tile" }, { value: "2", label: "2 tiles" }]} />
            </div>
          </div>
          <div className="k-field">
            <span className="k-label">Start each screen from</span>
            <Segmented fill size="sm" label="Start each screen from" value={start} onChange={setStart} options={[
              { value: "blank", label: "Blank", title: "New blank backgrounds in the lightest green" },
              { value: "picture", label: "A picture", title: "One big picture, fitted and cut into screens" },
              { value: "existing", label: "In the project", title: "Backgrounds already in the project, placed by clicking" },
            ]} />
          </div>

          {start === "picture" && <>
            <input ref={file} type="file" accept="image/*" hidden onChange={(event) => { void take(event.target.files?.[0]); event.target.value = ""; }} />
            <div className="k-row"><Button size="sm" icon={<Upload />} onClick={() => file.current?.click()}>{source ? "Another picture…" : "Choose a picture…"}</Button>{source && <span className="k-muted k-xs mw-ellipsis">{source.name}</span>}</div>
            {source && <>
              <Field label="Left ↔ right"><Slider label="Pan across" value={pan.x} onChange={(x) => setPan({ ...pan, x })} min={0} max={100} /></Field>
              <Field label="Top ↕ bottom"><Slider label="Pan down" value={pan.y} onChange={(y) => setPan({ ...pan, y })} min={0} max={100} /></Field>
            </>}
            <Field label={<>Keep colors <span className="k-muted">· {keep >= 64 ? "all" : keep}</span></>} hint="Fewer colors: cleaner tiles"><Slider label="Keep colors" value={keep} onChange={setKeep} min={4} max={64} step={2} /></Field>
            <Switch checked={dither} onChange={setDither}>Dithering</Switch>
            <div className="k-field"><span className="k-label">Palettes</span><Segmented fill size="sm" label="Palettes" value={String(max) as "7" | "8"} onChange={(value) => setMax(Number(value) as 7 | 8)} options={[{ value: "8", label: "8" }, { value: "7", label: "7 · keep slot 8 for the UI" }]} /></div>
            <Checkbox checked={budget} onChange={setBudget}>Keep each screen within {SCREEN_TILES} tiles (merge near tiles)</Checkbox>
            {screens && <Meter label="Tiles" value={worst} of={SCREEN_TILES} tone={worst > SCREEN_TILES ? "bad" : worst > SCREEN_TILES * 0.94 ? "warn" : undefined} title="Unique tiles in the busiest screen" />}
            <p className="k-well k-xs mw-note">Tile palettes: the screens are written in GB greens. Open each screen and use Fit colors… or Picture to background to bring its colors.</p>
          </>}

          {start === "existing" && <>
            <Field label="Background to place" hint="Click a screen in the preview to put it there; click it again to take it off.">
              <Select label="Background to place" value={placing} onChange={setPlacing} placeholder="No backgrounds" options={backgrounds.map((asset) => ({ value: asset.file, label: asset.name }))} />
            </Field>
            <Checkbox checked={fillRest} onChange={setFillRest}>Blank screens for the rest</Checkbox>
            {Object.keys(placed).length > 0 && <div className="k-row"><Button size="sm" variant="ghost" onClick={() => setPlaced({})}>Take all off</Button></div>}
          </>}

          {fresh.length > 0 && <Field label="File names" hint={clashes.length ? undefined : `New screens are named ${filePrefix}_x_y.png`}>
            <input className="k-input" value={filePrefix} onChange={(event) => setPrefix(event.target.value)} />
          </Field>}
          {fresh.length > 0 && !prefixOk && <span className="k-xs mw-bad">Use a plain name: letters, digits, spaces, - _ ( ) and dots.</span>}
          {clashes.length > 0 && <span className="k-xs mw-bad">{clashes.length === 1 ? `${clashes[0].name}.png is` : `${clashes.length} of these names are`} already in assets/backgrounds/: change the file names.</span>}
        </div>
      </div>
    </Dialog>
  );
}
