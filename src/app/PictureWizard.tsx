/**
 * Picture to background (W1, the author's pick 2026-10-10: one page, live). Any picture or photo goes to GB Studio's
 * limits while keeping as much of its color as possible: framed to whole screens, fewer colors (a slider, optional
 * dithering), four colors a tile in at most 8 (or 7) palettes, and under the tile budget. Everything is on one
 * screen and the result re-fits as a control changes. The parent opens the result as a picture or writes it into the
 * project as a new background with its palettes in the slots.
 */
import { Crop, ImagePlus, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toRgba } from "../paint";
import { Button, Checkbox, Chip, Field, Meter, Segmented, Slider, Switch } from "../ui/kit";
import { Dialog } from "../ui/kit";
import { SCREEN_SIZES, fitPicture, type FitOptions, type FitResult } from "./pictureFit";
import "./PictureWizard.css";

interface Props {
  projectName: string | null;
  onClose: () => void;
  /** Opens the result as a picture here (no project needed). */
  onOpen: (result: FitResult, name: string) => Promise<void>;
  /** Writes the result into the project as a new background, palettes in the slots; resolves true when done. */
  onSave: (result: FitResult, name: string) => Promise<boolean>;
}

type Source = { image: ImageBitmap; name: string };
type Framing = "cover" | "contain";

/** Draws the source into a width × height frame: cover (crop, panned) or contain (letterboxed on its average color). */
function frame(source: ImageBitmap, width: number, height: number, framing: Framing, panX: number, panY: number): Uint8ClampedArray {
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const scale = framing === "cover" ? Math.max(width / source.width, height / source.height) : Math.min(width / source.width, height / source.height);
  const w = source.width * scale, h = source.height * scale;
  if (framing === "contain") {
    // The letterbox takes the picture's average color, so it fits in the same palettes.
    const tiny = Object.assign(document.createElement("canvas"), { width: 1, height: 1 });
    const tc = tiny.getContext("2d", { willReadFrequently: true })!;
    tc.drawImage(source, 0, 0, 1, 1);
    const [r, g, b] = tc.getImageData(0, 0, 1, 1).data;
    context.fillStyle = `rgb(${r},${g},${b})`;
    context.fillRect(0, 0, width, height);
  }
  const x = framing === "cover" ? -(w - width) * panX / 100 : (width - w) / 2;
  const y = framing === "cover" ? -(h - height) * panY / 100 : (height - h) / 2;
  context.drawImage(source, x, y, w, h);
  return context.getImageData(0, 0, width, height).data;
}

function Picture({ rgba, width, height, label, source, extra }: { rgba: Uint8ClampedArray | null; width: number; height: number; label: ReactNode; source?: boolean; extra?: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!target || !rgba) return;
    if (target.width !== width || target.height !== height) Object.assign(target, { width, height });
    target.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  }, [rgba, width, height]);
  return <figure className="pw-pic"><figcaption className="k-eyebrow">{label}</figcaption><div className={`pw-frame${source ? " pw-frame--source" : ""}`}><canvas ref={canvas} width={width} height={height} />{extra}</div></figure>;
}

export function PictureWizard({ projectName, onClose, onOpen, onSave }: Props) {
  const [source, setSource] = useState<Source | null>(null);
  const [size, setSize] = useState<[number, number]>([160, 144]);
  const [framing, setFraming] = useState<Framing>("cover");
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [keep, setKeep] = useState(32);
  const [dither, setDither] = useState(false);
  const [max, setMax] = useState<7 | 8>(8);
  const [budget, setBudget] = useState(true);
  const [name, setName] = useState("");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<FitResult | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [width, height] = size;

  const take = async (picked: File | Blob | null | undefined, label?: string) => {
    if (!picked) return;
    try {
      const image = await createImageBitmap(picked, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      setSource({ image, name: label ?? (picked instanceof File ? picked.name : "picture") });
      if (!name) setName((label ?? (picked instanceof File ? picked.name : "Picture")).replace(/\.[a-z0-9]+$/i, "").slice(0, 40));
    } catch { /* not a picture */ }
  };

  // Paste a picture from the clipboard while the window is open.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => { const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith("image/")); if (item) { event.preventDefault(); void take(item.getAsFile(), "Pasted picture"); } };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const framed = useMemo(() => source ? frame(source.image, width, height, framing, pan.x, pan.y) : null, [source, width, height, framing, pan.x, pan.y]);
  const options = useMemo<FitOptions>(() => ({ keep, dither, max, budget }), [keep, dither, max, budget]);

  // The fit is the slow part (a few hundred ms on four screens): run it a beat after the last change.
  useEffect(() => {
    if (!framed) return setResult(null);
    setWorking(true);
    const timer = window.setTimeout(() => { setResult(fitPicture(framed, width, height, options)); setWorking(false); }, 120);
    return () => window.clearTimeout(timer);
  }, [framed, width, height, options]);

  const after = useMemo(() => result ? toRgba(result.pixels, result.cells, result.width, result.palettes.map((colors, index) => ({ name: `${index}`, colors }))) : null, [result]);
  const screens = `${width / 160 * height / 144} screen${width / 160 * height / 144 === 1 ? "" : "s"}`;
  const act = async (what: () => Promise<unknown>) => { setBusy(true); try { await what(); } finally { setBusy(false); } };
  const tone = result ? (result.tiles > result.limit ? "bad" : result.tiles > result.limit * 0.9 ? "warn" : undefined) : undefined;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} wide title="Picture to background" sub="One page: change anything and the result follows" icon={<ImagePlus size={18} />}
      footer={<>
        <input ref={file} type="file" accept="image/*" hidden onChange={(event) => { void take(event.target.files?.[0]); event.target.value = ""; }} />
        <Button icon={<Upload />} onClick={() => file.current?.click()}>{source ? "Another picture…" : "Choose a picture…"}</Button>
        <span className="k-spacer" />
        <input className="k-input pw-name" aria-label="Name" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <Button disabled={!result || busy || working} title="Opens the result here as an untitled picture" onClick={() => result && void act(() => onOpen(result, name.trim() || "Picture"))}>Open as a picture</Button>
        <Button variant="primary" disabled={!result || busy || working || !projectName || !name.trim()} title={projectName ? `A new background in ${projectName}, its palettes added to the project and put in the default slots` : "Open a project to save into it"} onClick={() => result && void act(async () => { if (await onSave(result, name.trim())) onClose(); })}>Save into {projectName ?? "the project"}</Button>
      </>}>
      <div className="pw-body">
        <div className="pw-stage">
          {!source ? (
            <div className={`pw-drop${over ? " is-over" : ""}`} onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setOver(false); void take(event.dataTransfer.files?.[0]); }}>
              <ImagePlus size={28} />
              <div><b>Drop a picture or photo here</b><br /><span className="k-small">or paste one, or <button type="button" className="k-link" onClick={() => file.current?.click()}>choose a file</button></span></div>
              <span className="k-muted k-xs">It is framed to whole screens, fitted to 8 palettes of 4 colors a tile, and kept under the tile budget.</span>
            </div>
          ) : (<>
            <Picture rgba={after ?? framed} width={width} height={height} label={<>Result · {width} × {height} ({screens}) · live</>} extra={working ? <Chip title="Fitting…">fitting…</Chip> : undefined} />
            <div style={{ width: "46%" }}><Picture rgba={framed} width={width} height={height} label={<>Your picture · {source.name}</>} source /></div>
          </>)}
        </div>
        <div className="pw-controls">
          <div className="pw-section"><span className="k-label">Size</span><Segmented fill size="sm" label="Size" value={`${width}x${height}`} onChange={(value) => { const [w, h] = value.split("x").map(Number); setSize([w, h]); }} options={SCREEN_SIZES.map(([w, h, label]) => ({ value: `${w}x${h}`, label }))} /></div>
          <div className="pw-section"><span className="k-label"><Crop size={12} /> Frame</span><Segmented fill size="sm" label="Frame" value={framing} onChange={setFraming} options={[{ value: "cover", label: "Fill (crop)" }, { value: "contain", label: "Fit inside" }]} />
            {framing === "cover" && <>
              <Field label="Left ↔ right"><Slider label="Pan across" value={pan.x} onChange={(x) => setPan({ ...pan, x })} min={0} max={100} /></Field>
              <Field label="Top ↕ bottom"><Slider label="Pan down" value={pan.y} onChange={(y) => setPan({ ...pan, y })} min={0} max={100} /></Field>
            </>}
          </div>
          <Field label={<>Keep colors <span className="k-muted">· {keep >= 64 ? "all" : keep}</span></>} hint="Fewer colors: cleaner tiles, fewer palettes needed"><Slider label="Keep colors" value={keep} onChange={setKeep} min={4} max={64} step={2} /></Field>
          <Switch checked={dither} onChange={setDither}>Dithering</Switch>
          <div className="pw-section"><span className="k-label">Palettes</span><Segmented fill size="sm" label="Palettes" value={String(max) as "7" | "8"} onChange={(value) => setMax(Number(value) as 7 | 8)} options={[{ value: "8", label: "8" }, { value: "7", label: "7 · keep slot 8 for the UI" }]} /></div>
          <Checkbox checked={budget} onChange={setBudget}>Stay within the tile budget (merge near tiles)</Checkbox>
          {result && <>
            <Meter label="Tiles" value={result.tiles} of={result.limit} tone={tone} title={result.merged ? `${result.tilesBefore} before merging near tiles` : "Unique tiles (flipped copies count once, as in a Color Only scene)"} />
            <p className="pw-report">{result.merged ? `${result.tilesBefore} → ${result.tiles} tiles after merging ${result.merged} near ones. ` : ""}{result.report.after} palette{result.report.after === 1 ? "" : "s"} · {result.report.overfull.length} tile{result.report.overfull.length === 1 ? "" : "s"} had more than 4 colors.{result.tiles > result.limit ? ` Still ${result.tiles - result.limit} over GB Studio's ${result.limit}: keep fewer colors, or turn on dithering off.` : ""}</p>
            <div className="pw-palettes" aria-label="Palettes">{result.palettes.map((colors, index) => <span key={index} title={`Palette ${index + 1}: ${colors.join(" ")}`}>{colors.map((color, at) => <i key={at} style={{ background: color }} />)}</span>)}</div>
          </>}
        </div>
      </div>
    </Dialog>
  );
}
