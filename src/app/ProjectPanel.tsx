/**
 * The project panel: a rail of the asset folders (with counts) and the open folder's pictures as thumbnail cards.
 * Clicking the folder on show again hides the cards (the rail stays), like an editor's side bar.
 * The thumbnails come from one preview sheet per folder (server/assets.ts previewSheet); while it loads the cards
 * show empty boxes, and if it can't be made they fetch their own previews.
 */
import { useEffect, useState } from "react";
import { ASSET_KINDS, ASSET_URL, PREVIEW_VERSION, type Asset, type AssetKind, type Project } from "./model";
import { SheetThumb, type SheetCell } from "./SheetThumb";
import { KIND_ICONS } from "./tools";
import { Chip, IconButton } from "../ui/kit";

interface ProjectPanelProps {
  project: Project;
  kind: AssetKind;
  /** Whether the cards are showing (the rail always is). */
  open: boolean;
  onKind: (kind: AssetKind) => void;
  /** Bumped when palette slots change, so the thumbnails are drawn again. */
  slotsVersion: number;
  /** How a picture stands in the painter: not open, open, or the one on show; and whether it has unsaved changes. */
  stateOf: (asset: Asset) => { open: boolean; active: boolean; dirty: boolean };
  onOpen: (asset: Asset) => void;
  onMenu: (asset: Asset, x: number, y: number) => void;
}

const assetQuery = (asset: { kind: AssetKind; file: string }) => new URLSearchParams({ kind: asset.kind, file: asset.file });

export function ProjectPanel({ project, kind, open, onKind, slotsVersion, stateOf, onOpen, onMenu }: ProjectPanelProps) {
  const [filter, setFilter] = useState("");
  const [sheet, setSheet] = useState<{ kind: AssetKind; image: HTMLImageElement; cells: Map<string, SheetCell> } | null>(null);
  const [sheetFailed, setSheetFailed] = useState(false);

  // The sheet of the folder on show: fetched again when its pictures, palettes or slots change.
  const sheetKey = `${project.path}|${kind}|${project.assets.filter((asset) => asset.kind === kind).map((asset) => `${asset.file}:${Math.round(asset.mtime)}`).join(",")}|${slotsVersion}`;
  useEffect(() => {
    let live = true;
    setSheetFailed(false);
    const failed = () => { if (live) setSheetFailed(true); };
    void fetch(`./__cartographer/gbstudio-preview-sheet?kind=${kind}`, { cache: "no-cache" }).then((response) => response.ok ? response.json() as Promise<{ stamp: string; cells: SheetCell[] }> : null).then((result) => {
      if (!live) return;
      if (!result) return failed();
      const image = new Image();
      image.onerror = failed;
      image.onload = () => { if (live) setSheet({ kind, image, cells: new Map(result.cells.map((cell) => [cell.file, cell])) }); };
      image.src = `./__cartographer/gbstudio-preview-sheet.png?kind=${kind}&stamp=${result.stamp}`;
    }).catch(failed);
    return () => { live = false; };
  }, [sheetKey]);

  const label = ASSET_KINDS.find(([id]) => id === kind)?.[1] ?? "";
  const wanted = filter.trim().toLowerCase();
  const shown = project.assets.filter((asset) => asset.kind === kind && (!wanted || asset.name.toLowerCase().includes(wanted)));
  return (
    <>
      <nav className="k-panel app-rail" aria-label="Asset folders">
        {ASSET_KINDS.map(([id, name]) => { const Icon = KIND_ICONS[id]; const count = project.assets.filter((asset) => asset.kind === id).length; const on = kind === id && open; return (
          <IconButton key={id} variant="ghost" pressed={on} aria-label={`${name} (${count})`} label={`${name} · ${count}${on ? " · click to hide" : ""}`} onClick={() => onKind(id)}><Icon size={18} /><span className="app-badge">{count}</span></IconButton>
        ); })}
      </nav>
      {open && <aside className="k-panel app-project" aria-label="GB Studio project">
        <div className="app-project-head"><span className="k-eyebrow" title={project.path}>{project.name}</span><Chip>{label}</Chip></div>
        <input type="search" className="k-input" placeholder={`Filter ${label.toLowerCase()}`} aria-label={`Filter ${label.toLowerCase()} by name`} value={filter} onChange={(event) => setFilter(event.target.value)} />
        <div className="app-cards gbp-assets" role="list">
          {shown.map((asset) => {
            const state = stateOf(asset);
            return (
              <button key={asset.file} role="listitem" aria-pressed={state.active} onContextMenu={(event) => { event.preventDefault(); onMenu(asset, event.clientX, event.clientY); }} className={`k-card k-card--button app-card ${state.open && !state.active ? "open" : ""}`} title={`${asset.file} · ${asset.width} × ${asset.height} px${state.open ? " · open" : ""}`} onClick={() => onOpen(asset)}>
                {sheet?.kind === asset.kind && sheet.cells.has(asset.file)
                  ? <SheetThumb sheet={sheet.image} cell={sheet.cells.get(asset.file)!} />
                  : !sheetFailed && sheet?.kind !== asset.kind ? <span className="gbp-asset-thumb" aria-hidden="true" />
                  : <img className="gbp-asset-thumb" loading="lazy" decoding="async" alt="" src={`${ASSET_URL}-preview?${assetQuery(asset)}&v=${Math.round(asset.mtime)}&pv=${PREVIEW_VERSION}&s=${slotsVersion}`} />}
                <b className={state.dirty ? "dirty" : ""}>{asset.name}</b>
                <small>{asset.width} × {asset.height}</small>
              </button>
            );
          })}
          {shown.length === 0 && <p className="k-muted k-small" style={{ gridColumn: "1 / -1" }}>No {label.toLowerCase()} {wanted ? "match" : "in this project"}.</p>}
        </div>
      </aside>}
    </>
  );
}
