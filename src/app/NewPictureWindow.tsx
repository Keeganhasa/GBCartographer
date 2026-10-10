import { FileImage, FilePlus, Grid3x3, Type } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GB_SHADES } from "../paint";
import { Button, Chip, Dialog, Field, Segmented, Slider } from "../ui/kit";
import { loadFontFile, renderFontSheet, type LoadedFont } from "./fontSheet";
import { ASSET_KINDS, type AssetKind } from "./model";
import { KIND_ICONS } from "./tools";
import "./NewPictureWindow.css";

/** Sizes that suit each kind (all in whole 8 × 8 tiles); the first is the default. */
const PRESETS: Record<AssetKind | "file", [number, number, string][]> = {
  backgrounds: [[160, 144, "one screen"], [320, 144, "two wide"], [160, 288, "two tall"], [256, 256, "square"]],
  sprites: [[16, 16, "one 16 × 16 frame"], [32, 16, "two frames"], [64, 16, "four frames"], [16, 32, "one 16 × 32 frame"]],
  tilesets: [[128, 64, "16 × 8 tiles"], [64, 64, "8 × 8 tiles"], [16, 16, "2 × 2 tiles"]],
  fonts: [[128, 112, "ASCII 32–255 (16 per row)"], [128, 48, "ASCII 32–127"]],
  emotes: [[16, 16, "an emote"]],
  stamps: [[16, 16, "2 × 2 tiles"], [32, 32, "4 × 4 tiles"], [8, 8, "one tile"]],
  avatars: [[16, 16, "an avatar"]],
  ui: [[24, 24, "the dialogue frame"], [8, 8, "the cursor"]],
  file: [[160, 144, "one screen"], [256, 256, "square"], [16, 16, "a sprite"]],
};

/** Resize offers screens (any size typed in stays too). */
const RESIZE_PRESETS: [number, number, string][] = [[160, 144, "one screen"], [320, 144, "two wide"], [160, 288, "two tall"], [320, 288, "four screens"]];

/** Short names for the Where tiles (the rail's labels are longer). */
const WHERE_LABEL: Record<AssetKind, string> = { backgrounds: "Background", sprites: "Sprite", tilesets: "Tileset", fonts: "Font", emotes: "Emote", avatars: "Avatar", ui: "UI", stamps: "Stamp" };
const folderOf = (kind: AssetKind) => kind === "stamps" ? "Cartographer/stamps" : `assets/${kind}`;

const wholeTiles = ([w, h]: [number, number]) => w > 0 && h > 0 && w % 8 === 0 && h % 8 === 0 && w <= 2048 && h <= 2048;

/** A size preset's shape, to scale in a 48 × 34 box, with each 160 × 144 screen marked on wide or tall pictures. */
function SizeShape({ width, height, screens }: { width: number; height: number; screens: boolean }) {
  const scale = Math.min(48 / width, 34 / height), w = Math.max(4, Math.round(width * scale)), h = Math.max(4, Math.round(height * scale));
  const lines: ReactNode[] = [];
  if (screens) {
    for (let x = 160; x < width; x += 160) lines.push(<line key={`x${x}`} x1={x * scale} y1={0} x2={x * scale} y2={h} />);
    for (let y = 144; y < height; y += 144) lines.push(<line key={`y${y}`} x1={0} y1={y * scale} x2={w} y2={y * scale} />);
  }
  return (
    <span className="npw-shape">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={2} />
        {lines}
      </svg>
    </span>
  );
}

/** The size cards: one per preset, pressed when it's the size picked. */
function SizeCards({ presets, size, onPick, screens, disabled }: { presets: [number, number, string][]; size: [number, number]; onPick: (size: [number, number]) => void; screens: (w: number, h: number) => boolean; disabled?: (w: number, h: number) => string | undefined }) {
  return (
    <div className="npw-presets">{presets.map(([w, h, label]) => { const why = disabled?.(w, h); return (
      <button key={`${w}x${h}`} type="button" className="k-card k-card--button npw-preset" aria-pressed={size[0] === w && size[1] === h} disabled={!!why} title={why} onClick={() => onPick([w, h])}>
        <SizeShape width={w} height={h} screens={screens(w, h)} />
        <b>{w} × {h}</b><small>{label}</small>
      </button>
    ); })}</div>
  );
}

/** Custom: width × height in pixels, and the size in tiles (or why it can't be). */
function CustomSize({ size, onChange, problem }: { size: [number, number]; onChange: (size: [number, number]) => void; problem?: string }) {
  const off = size[0] % 8 || size[1] % 8;
  return (
    <div className="k-row">
      <span className="k-muted k-small">Custom</span>
      <input className="k-input k-input--num" type="number" min={8} max={2048} step={8} aria-label="Width" value={size[0]} onChange={(event) => onChange([Number(event.target.value), size[1]])} />×
      <input className="k-input k-input--num" type="number" min={8} max={2048} step={8} aria-label="Height" value={size[1]} onChange={(event) => onChange([size[0], Number(event.target.value)])} />
      <span className="k-muted k-small">px</span>
      {off ? <Chip tone="warn">whole 8 × 8 tiles only</Chip> : problem ? <Chip tone="warn">{problem}</Chip> : <Chip>{size[0] / 8} × {size[1] / 8} tiles</Chip>}
    </div>
  );
}

export interface NewPicture { kind: AssetKind | null; name: string; width: number; height: number; /** Shades to start from (a font drawn from a font file); blank otherwise. */ pixels?: Uint8Array }

/**
 * New picture: in the open project (a kind's folder) or just in GB Cartographer, a name and a size in whole tiles.
 * The parent writes it (a new PNG in the project) or opens it as an untitled picture.
 */
export function NewPictureWindow({ projectName, initialKind, onClose, onCreate }: { projectName: string | null; initialKind: AssetKind; onClose: () => void; onCreate: (picture: NewPicture) => Promise<boolean> }) {
  const [where, setWhere] = useState<AssetKind | "file">(projectName ? initialKind : "file");
  const presets = PRESETS[where];
  const [size, setSize] = useState<[number, number]>([presets[0][0], presets[0][1]]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // A font sheet can start with glyphs drawn from a font file.
  const [font, setFont] = useState<LoadedFont | null>(null);
  const [fontSize, setFontSize] = useState(8);
  const [baseline, setBaseline] = useState(7);
  const fromFont = where === "fonts" && font ? renderFontSheet(font, fontSize, baseline) : null;
  const fontPreview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = fontPreview.current;
    if (!canvas || !fromFont) return;
    Object.assign(canvas, { width: 128, height: 112 });
    const context = canvas.getContext("2d")!;
    const image = context.createImageData(128, 112);
    fromFont.pixels.forEach((shade, at) => { const hex = GB_SHADES[shade]; image.data.set([parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255], at * 4); });
    context.putImageData(image, 0, 0);
  });
  async function pickFont() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ttf,.otf,.woff,.woff2";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const loaded = await loadFontFile(file);
        setFont(loaded);
        setSize([128, 112]);
        if (!name.trim()) setName(loaded.name);
      } catch {
        window.alert(`${file.name} could not be read as a font.`);
      }
    };
    input.click();
  }
  const valid = wholeTiles(size) && (where === "file" || /^[\w ()\-.]+$/.test(name.trim()));
  const pick = (next: AssetKind | "file") => { setWhere(next); setSize([PRESETS[next][0][0], PRESETS[next][0][1]]); };
  async function create() {
    setBusy(true);
    const done = await onCreate({ kind: where === "file" ? null : where, name: name.trim() || "Untitled", width: size[0], height: size[1], ...(fromFont && size[0] === 128 && size[1] === 112 ? { pixels: fromFont.pixels } : {}) });
    setBusy(false);
    if (done) onClose();
  }
  const whereTile = (id: AssetKind | "file", icon: ReactNode, label: string, title: string) => (
    <button key={id} type="button" className="k-card k-card--button npw-pick" aria-pressed={where === id} title={title} onClick={() => pick(id)}>{icon}<span>{label}</span></button>
  );
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title="New picture" sub={projectName ? "A blank PNG in the project, or only here" : "A blank picture, only here"} icon={<FilePlus size={18} />}
      footer={<>
        {where !== "file" && <span className="k-muted k-small">Never replaces a file</span>}
        <span className="k-spacer" />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={<FilePlus />} disabled={!valid || busy} title={valid ? undefined : "Give it a name (letters, digits, spaces, - _ ( ) .)"} onClick={() => void create()}>Create and open</Button>
      </>}>
      <div className="k-stack k-stack--loose">
        <div className="npw-section">
          <span className="k-label">Where</span>
          <div className="npw-where" role="group" aria-label="Where">
            {projectName && ASSET_KINDS.map(([kind]) => { const Icon = KIND_ICONS[kind]; return whereTile(kind, <Icon size={20} />, WHERE_LABEL[kind], `A new PNG in ${projectName}/${folderOf(kind)}/`); })}
            {whereTile("file", <FileImage size={20} />, "Only here", "Just here: Save asks where to keep it")}
          </div>
        </div>
        <Field label="Name">
          <input className="k-input" type="text" value={name} placeholder={where === "file" ? "Untitled" : "e.g. Cave Entrance"} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
        <div className="npw-section">
          <span className="k-label">Size</span>
          <SizeCards presets={presets} size={size} onPick={setSize} screens={(w, h) => where === "backgrounds" && w % 160 === 0 && h % 144 === 0} />
          <CustomSize size={size} onChange={setSize} problem={size[0] > 2048 || size[1] > 2048 ? "2048 px at most" : undefined} />
        </div>
        {where === "fonts" && (
          <div className="npw-section">
            <span className="k-label">Glyphs</span>
            <div className="k-row">
              <Button icon={<FilePlus />} pressed={!font} onClick={() => setFont(null)}>Blank</Button>
              <Button icon={<Type />} pressed={!!font} title="Draw characters 32–255 from a TTF or OTF font, 1 bit, 8 × 8 each" onClick={() => void pickFont()}>{font ? `From ${font.name}` : "From a font file…"}</Button>
            </div>
            {fromFont && <>
              <canvas ref={fontPreview} className="npw-font-preview" />
              <div className="k-row">
                <span className="npw-slider"><span className="k-muted k-small">Size</span><Slider label="Font size" min={4} max={16} value={fontSize} onChange={setFontSize} /><b className="k-small">{fontSize}px</b></span>
                <span className="npw-slider"><span className="k-muted k-small">Baseline</span><Slider label="Baseline" min={1} max={8} value={baseline} onChange={setBaseline} /><b className="k-small">{baseline}</b></span>
              </div>
              <small className="npw-note">{!font!.codes ? "This file's character list can't be read (WOFF fonts compress it), so missing characters may show in another font: use the TTF or OTF to check." : fromFont.missing.length ? `Not in the font (left blank): ${fromFont.missing.length} — ${fromFont.missing.slice(0, 40).map((code) => String.fromCharCode(code)).join(" ")}${fromFont.missing.length > 40 ? " …" : ""}` : "Every character 32–255 is in the font."} Pixel fonts look best at their own size.</small>
            </>}
          </div>
        )}
        <div className="k-well npw-path">{where === "file"
          ? <>A blank picture in the GB greens, only here. <b>Save</b> asks where to keep it.</>
          : <>Creates <code>{folderOf(where)}/{(name.trim() || "…").replace(/\.png$/i, "")}.png</code> {fromFont ? "with the glyphs from the font file" : where === "sprites" || where === "emotes" || where === "stamps" ? "see-through" : "in the lightest shade"}.</>}</div>
      </div>
    </Dialog>
  );
}

/**
 * Resize: a new size in whole tiles, anchored top-left or centered (on tile edges, so tile palettes stay put).
 * Sprite sheets only grow, from the top-left, so their frames keep pointing at the same pixels.
 */
export function ResizeWindow({ name, width, height, sprite, inProject, onClose, onResize }: { name?: string; width: number; height: number; sprite: boolean; inProject: boolean; onClose: () => void; onResize: (width: number, height: number, center: boolean) => void }) {
  const [size, setSize] = useState<[number, number]>([width, height]);
  const [center, setCenter] = useState(false);
  const smaller = (w: number, h: number) => w < width || h < height;
  const valid = wholeTiles(size) && (!sprite || !smaller(size[0], size[1])) && (size[0] !== width || size[1] !== height);
  // The size it is now reads "now" on its card.
  const presets = RESIZE_PRESETS.map(([w, h, label]): [number, number, string] => [w, h, w === width && h === height ? "now" : label]);
  const explain = sprite ? "A sprite sheet only grows, to the right and down, so its frames keep pointing at the same pixels."
    : center ? "Growing adds blank tiles all round; shrinking cuts the edges off."
    : "Growing adds blank tiles on the right and below; shrinking cuts the picture off there.";
  function resize() { onResize(size[0], size[1], center && !sprite); onClose(); }
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Resize" sub={`${name ? `${name.replace(/\.png$/i, "")} · ` : ""}now ${width} × ${height}`} icon={<Grid3x3 size={18} />}
      footer={<>
        {inProject && <span className="k-muted k-small">The old file goes to Backups when you save</span>}
        <span className="k-spacer" />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!valid} onClick={resize}>Resize</Button>
      </>}>
      <div className="k-stack k-stack--loose">
        <div className="npw-section">
          <span className="k-label">New size</span>
          <SizeCards presets={presets} size={size} onPick={setSize} screens={() => true} disabled={sprite ? (w, h) => smaller(w, h) ? "A sprite sheet only grows" : undefined : undefined} />
          <CustomSize size={size} onChange={setSize} problem={size[0] > 2048 || size[1] > 2048 ? "2048 px at most" : sprite && smaller(size[0], size[1]) ? "sprite sheets only grow" : undefined} />
        </div>
        {!sprite && (
          <div className="npw-section">
            <span className="k-label">Keep the picture</span>
            <Segmented fill label="Keep the picture" value={center ? "center" : "top-left"} onChange={(value) => setCenter(value === "center")}
              options={[{ value: "top-left", label: "At the top-left" }, { value: "center", label: "Centered (on tiles)", title: "Centered on tile edges, so tile palettes stay put" }]} />
          </div>
        )}
        <div className="k-well npw-path">{explain}{inProject && !sprite ? " Scenes that show a resized background take their size from it in GB Studio." : ""}</div>
      </div>
    </Dialog>
  );
}
