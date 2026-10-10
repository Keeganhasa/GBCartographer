import { FileImage, FilePlus, Type, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GB_SHADES } from "../paint";
import { loadFontFile, renderFontSheet, type LoadedFont } from "./fontSheet";
import { ASSET_KINDS, type AssetKind } from "./model";
import { KIND_ICONS } from "./tools";

/** Sizes that suit each kind (all in whole 8 × 8 tiles); the first is the default. */
const PRESETS: Record<AssetKind | "file", [number, number, string][]> = {
  backgrounds: [[160, 144, "one screen"], [320, 144, "two screens wide"], [160, 288, "two screens tall"], [256, 256, "square"]],
  sprites: [[16, 16, "one 16 × 16 frame"], [32, 16, "two frames"], [64, 16, "four frames"], [16, 32, "one 16 × 32 frame"]],
  tilesets: [[128, 64, "16 × 8 tiles"], [64, 64, "8 × 8 tiles"], [16, 16, "2 × 2 tiles"]],
  fonts: [[128, 112, "ASCII 32–255 (16 per row)"], [128, 48, "ASCII 32–127"]],
  emotes: [[16, 16, "an emote"]],
  stamps: [[16, 16, "2 × 2 tiles"], [32, 32, "4 × 4 tiles"], [8, 8, "one tile"]],
  avatars: [[16, 16, "an avatar"]],
  ui: [[24, 24, "the dialogue frame"], [8, 8, "the cursor"]],
  file: [[160, 144, "one screen"], [256, 256, "square"], [16, 16, "a sprite"]],
};

/** Short names for the Where tiles (the rail's labels are longer). */
const WHERE_LABEL: Record<AssetKind, string> = { backgrounds: "Background", sprites: "Sprite", tilesets: "Tileset", fonts: "Font", emotes: "Emote", avatars: "Avatar", ui: "UI", stamps: "Stamp" };
const folderOf = (kind: AssetKind) => kind === "stamps" ? "Cartographer/stamps" : `assets/${kind}`;

/** A size preset's shape, to scale in a 44 × 32 box, with each 160 × 144 screen marked on wide or tall backgrounds. */
function SizeShape({ width, height, screens }: { width: number; height: number; screens: boolean }) {
  const scale = Math.min(44 / width, 32 / height), w = Math.max(4, Math.round(width * scale)), h = Math.max(4, Math.round(height * scale));
  const lines: ReactNode[] = [];
  if (screens) {
    for (let x = 160; x < width; x += 160) lines.push(<line key={`x${x}`} x1={x * scale} y1={0} x2={x * scale} y2={h} />);
    for (let y = 144; y < height; y += 144) lines.push(<line key={`y${y}`} x1={0} y1={y * scale} x2={w} y2={y * scale} />);
  }
  return (
    <span className="gbp-shape-box">
      <svg className="gbp-size-shape" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={2} />
        {lines}
      </svg>
    </span>
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
  const valid = size[0] > 0 && size[1] > 0 && size[0] % 8 === 0 && size[1] % 8 === 0 && size[0] <= 2048 && size[1] <= 2048 && (where === "file" || /^[\w ()\-.]+$/.test(name.trim()));
  const pick = (next: AssetKind | "file") => { setWhere(next); setSize([PRESETS[next][0][0], PRESETS[next][0][1]]); };
  async function create() {
    setBusy(true);
    const done = await onCreate({ kind: where === "file" ? null : where, name: name.trim() || "Untitled", width: size[0], height: size[1], ...(fromFont && size[0] === 128 && size[1] === 112 ? { pixels: fromFont.pixels } : {}) });
    setBusy(false);
    if (done) onClose();
  }
  return (
    <div className="gbp-modal-backdrop" onClick={onClose}>
      <div className="gbp-modal gbp-help gbp-small-modal gbp-new" role="dialog" aria-label="New picture" onClick={(event) => event.stopPropagation()}>
        <header className="gbp-modal-head"><h2>New picture</h2><span className="gbp-spacer" /><button className="icon-button small" aria-label="Close" onClick={onClose}><X size={14} /></button></header>
        <div className="gbp-help-body gbp-form">
          <div className="gbp-field">Where
            <div className="gbp-where" role="radiogroup" aria-label="Where">
              {projectName && ASSET_KINDS.map(([kind]) => { const Icon = KIND_ICONS[kind]; return (
                <button key={kind} role="radio" aria-checked={where === kind} className={`gbp-where-tile ${where === kind ? "selected" : ""}`} title={`A new PNG in ${projectName}/${folderOf(kind)}/`} onClick={() => pick(kind)}>
                  <Icon size={18} /><span>{WHERE_LABEL[kind]}</span>
                </button>
              ); })}
              <button role="radio" aria-checked={where === "file"} className={`gbp-where-tile ${where === "file" ? "selected" : ""}`} title="Just here: Save asks where to keep it" onClick={() => pick("file")}>
                <FileImage size={18} /><span>Only here</span>
              </button>
            </div>
          </div>
          <label className="gbp-field">Name
            <input type="text" value={name} placeholder={where === "file" ? "Untitled" : "e.g. Cave Entrance"} onChange={(event) => setName(event.target.value)} autoFocus />
          </label>
          <div className="gbp-field">Size
            <div className="gbp-presets">{presets.map(([w, h, label]) => (
              <button key={`${w}x${h}`} className={`gbp-preset ${size[0] === w && size[1] === h ? "selected" : ""}`} aria-pressed={size[0] === w && size[1] === h} onClick={() => setSize([w, h])}>
                <SizeShape width={w} height={h} screens={where === "backgrounds" && w % 160 === 0 && h % 144 === 0} />
                <b>{w} × {h}</b><small>{label}</small>
              </button>
            ))}</div>
            <span className="gbp-size-row">
              <span className="gbp-size-label">Custom</span>
              <input type="number" min={8} max={2048} step={8} aria-label="Width" value={size[0]} onChange={(event) => setSize([Number(event.target.value), size[1]])} /> ×
              <input type="number" min={8} max={2048} step={8} aria-label="Height" value={size[1]} onChange={(event) => setSize([size[0], Number(event.target.value)])} /> px
              <span className={`gbp-tile-chip ${size[0] % 8 || size[1] % 8 ? "bad" : ""}`}>{size[0] % 8 || size[1] % 8 ? "whole 8 × 8 tiles only" : `${size[0] / 8} × ${size[1] / 8} tiles`}</span>
            </span>
          </div>
          {where === "fonts" && (
            <div className="gbp-field">Glyphs
              <span className="gbp-budget-actions">
                <button className={`quiet-button ${!font ? "active-tool" : ""}`} onClick={() => setFont(null)}><FilePlus size={14} />Blank</button>
                <button className={`quiet-button ${font ? "active-tool" : ""}`} title="Draw characters 32–255 from a TTF or OTF font, 1 bit, 8 × 8 each" onClick={() => void pickFont()}><Type size={14} />{font ? `From ${font.name}` : "From a font file…"}</button>
              </span>
              {fromFont && <>
                <canvas ref={fontPreview} className="gbp-font-preview" />
                <span className="gbp-size-row">
                  <label className="gbp-inline">Size <input type="range" min={4} max={16} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /> {fontSize}px</label>
                  <label className="gbp-inline">Baseline <input type="range" min={1} max={8} value={baseline} onChange={(event) => setBaseline(Number(event.target.value))} /> {baseline}</label>
                </span>
                <small className="gbp-note">{!font!.codes ? "This file's character list can't be read (WOFF fonts compress it), so missing characters may show in another font: use the TTF or OTF to check." : fromFont.missing.length ? `Not in the font (left blank): ${fromFont.missing.length} — ${fromFont.missing.slice(0, 40).map((code) => String.fromCharCode(code)).join(" ")}${fromFont.missing.length > 40 ? " …" : ""}` : "Every character 32–255 is in the font."} Pixel fonts look best at their own size.</small>
              </>}
            </div>
          )}
          <p className="gbp-new-where">{where === "file"
            ? <>A blank picture in the GB greens, only here. <b>Save</b> asks where to keep it.</>
            : <>Creates <code>{folderOf(where)}/{(name.trim() || "…").replace(/\.png$/i, "")}.png</code>, {fromFont ? "with the glyphs from the font file" : where === "sprites" || where === "emotes" || where === "stamps" ? "see-through" : "in the lightest shade"}. Never replaces a file.</>}</p>
          <div className="gbp-backup-actions"><span className="gbp-spacer" /><button className="quiet-button" onClick={onClose}>Cancel</button><button className="quiet-button primary" disabled={!valid || busy} title={valid ? undefined : "Give it a name (letters, digits, spaces, - _ ( ) .)"} onClick={() => void create()}><FilePlus size={14} />Create and open</button></div>
        </div>
      </div>
    </div>
  );
}

/**
 * Resize: a new size in whole tiles, anchored top-left or centered (on tile edges, so tile palettes stay put).
 * Sprite sheets only grow, from the top-left, so their frames keep pointing at the same pixels.
 */
export function ResizeWindow({ width, height, sprite, inProject, onClose, onResize }: { width: number; height: number; sprite: boolean; inProject: boolean; onClose: () => void; onResize: (width: number, height: number, center: boolean) => void }) {
  const [size, setSize] = useState<[number, number]>([width, height]);
  const [center, setCenter] = useState(false);
  const valid = size[0] > 0 && size[1] > 0 && size[0] % 8 === 0 && size[1] % 8 === 0 && size[0] <= 2048 && size[1] <= 2048 && (!sprite || (size[0] >= width && size[1] >= height)) && (size[0] !== width || size[1] !== height);
  return (
    <div className="gbp-modal-backdrop" onClick={onClose}>
      <div className="gbp-modal gbp-help gbp-small-modal" role="dialog" aria-label="Resize picture" onClick={(event) => event.stopPropagation()}>
        <header className="gbp-modal-head"><h2>Resize</h2><span className="gbp-spacer" /><button className="icon-button small" aria-label="Close" onClick={onClose}><X size={14} /></button></header>
        <div className="gbp-help-body gbp-form">
          <div className="gbp-field">New size (now {width} × {height})
            <span className="gbp-size-row">
              <input type="number" min={8} max={2048} step={8} aria-label="Width" value={size[0]} onChange={(event) => setSize([Number(event.target.value), size[1]])} /> ×
              <input type="number" min={8} max={2048} step={8} aria-label="Height" value={size[1]} onChange={(event) => setSize([size[0], Number(event.target.value)])} /> px
            </span>
            <small className="gbp-note">{size[0] % 8 || size[1] % 8 ? "Whole 8 × 8 tiles only." : `${size[0] / 8} × ${size[1] / 8} tiles`}</small>
          </div>
          {!sprite && <label className="gbp-check"><input type="checkbox" checked={center} onChange={(event) => setCenter(event.target.checked)} />Keep the picture centered (on tile edges); otherwise it stays at the top-left</label>}
          <p className="gbp-note">{sprite ? "A sprite sheet only grows, to the right and down, so its frames keep pointing at the same pixels." : "Growing adds blank tiles; shrinking cuts the picture off."}{inProject ? " Save writes the new size into the project (the old file goes to Backups). Scenes that show a resized background take their size from it in GB Studio." : ""}</p>
          <div className="gbp-backup-actions"><span className="gbp-spacer" /><button className="quiet-button" onClick={onClose}>Cancel</button><button className="quiet-button primary" disabled={!valid} onClick={() => { onResize(size[0], size[1], center && !sprite); onClose(); }}>Resize</button></div>
        </div>
      </div>
    </div>
  );
}
