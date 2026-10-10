import { X } from "lucide-react";
import { useState } from "react";
import { ASSET_KINDS, type AssetKind } from "./model";

/** Sizes that suit each kind (all in whole 8 × 8 tiles); the first is the default. */
const PRESETS: Record<AssetKind | "file", [number, number, string][]> = {
  backgrounds: [[160, 144, "one screen"], [320, 144, "two screens wide"], [160, 288, "two screens tall"], [256, 256, "256 × 256"]],
  sprites: [[16, 16, "one 16 × 16 frame"], [32, 16, "two frames"], [64, 16, "four frames"], [16, 32, "one 16 × 32 frame"]],
  tilesets: [[128, 64, "16 × 8 tiles"], [64, 64, "8 × 8 tiles"], [16, 16, "2 × 2 tiles"]],
  fonts: [[128, 112, "ASCII 32–255 (16 per row)"], [128, 48, "ASCII 32–127"]],
  emotes: [[16, 16, "an emote"]],
  avatars: [[16, 16, "an avatar"]],
  ui: [[24, 24, "the dialogue frame"], [8, 8, "the cursor"]],
  file: [[160, 144, "one screen"], [256, 256, "256 × 256"], [16, 16, "16 × 16"]],
};

export interface NewPicture { kind: AssetKind | null; name: string; width: number; height: number }

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
  const valid = size[0] > 0 && size[1] > 0 && size[0] % 8 === 0 && size[1] % 8 === 0 && size[0] <= 2048 && size[1] <= 2048 && (where === "file" || /^[\w ()\-.]+$/.test(name.trim()));
  const pick = (next: AssetKind | "file") => { setWhere(next); setSize([PRESETS[next][0][0], PRESETS[next][0][1]]); };
  async function create() {
    setBusy(true);
    const done = await onCreate({ kind: where === "file" ? null : where, name: name.trim() || "Untitled", width: size[0], height: size[1] });
    setBusy(false);
    if (done) onClose();
  }
  return (
    <div className="gbp-modal-backdrop" onClick={onClose}>
      <div className="gbp-modal gbp-help gbp-small-modal" role="dialog" aria-label="New picture" onClick={(event) => event.stopPropagation()}>
        <header className="gbp-modal-head"><h2>New picture</h2><span className="gbp-spacer" /><button className="icon-button small" aria-label="Close" onClick={onClose}><X size={14} /></button></header>
        <div className="gbp-help-body gbp-form">
          <label className="gbp-field">Where
            <select value={where} onChange={(event) => pick(event.target.value as AssetKind | "file")}>
              {projectName && <optgroup label={projectName}>{ASSET_KINDS.map(([kind, label]) => <option key={kind} value={kind}>{label} · assets/{kind}/</option>)}</optgroup>}
              <option value="file">Only here (save it anywhere later)</option>
            </select>
          </label>
          <label className="gbp-field">Name
            <input type="text" value={name} placeholder={where === "file" ? "Untitled" : "e.g. Cave Entrance"} onChange={(event) => setName(event.target.value)} autoFocus />
          </label>
          <div className="gbp-field">Size
            <div className="gbp-presets">{presets.map(([w, h, label]) => <button key={`${w}x${h}`} className={`quiet-button ${size[0] === w && size[1] === h ? "active-tool" : ""}`} onClick={() => setSize([w, h])}>{w} × {h}<small>{label}</small></button>)}</div>
            <span className="gbp-size-row">
              <input type="number" min={8} max={2048} step={8} aria-label="Width" value={size[0]} onChange={(event) => setSize([Number(event.target.value), size[1]])} /> ×
              <input type="number" min={8} max={2048} step={8} aria-label="Height" value={size[1]} onChange={(event) => setSize([size[0], Number(event.target.value)])} /> px
              <small className="gbp-note">{size[0] % 8 || size[1] % 8 ? "Whole 8 × 8 tiles only." : `${size[0] / 8} × ${size[1] / 8} tiles`}</small>
            </span>
          </div>
          <p className="gbp-note">{where === "file" ? "A blank picture in the GB greens. Save asks where to keep it." : `Writes one new file, assets/${where}/${(name.trim() || "…").replace(/\.png$/i, "")}.png, blank${where === "sprites" || where === "emotes" ? " (see-through)" : " (lightest shade)"}. GB Studio adds its own settings for it when it next reads the project. An existing file is never replaced.`}</p>
          <div className="gbp-backup-actions"><span className="gbp-spacer" /><button className="quiet-button" onClick={onClose}>Cancel</button><button className="quiet-button primary" disabled={!valid || busy} onClick={() => void create()}>Create and open</button></div>
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
