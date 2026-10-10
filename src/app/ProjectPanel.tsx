/**
 * The project panel: a rail of the asset folders (with counts) and the open folder's pictures as thumbnail cards.
 * The thumbnails come from one preview sheet per folder (server/assets.ts previewSheet); while it loads the cards
 * show empty boxes, and if it can't be made they fetch their own previews.
 */
import { useEffect, useState } from "react";
import { ASSET_KINDS, ASSET_URL, PREVIEW_VERSION, type Asset, type AssetKind, type Project } from "./model";
import { SheetThumb, type SheetCell } from "./SheetThumb";
import { KIND_ICONS } from "./tools";

interface ProjectPanelProps {
  project: Project;
  kind: AssetKind;
  onKind: (kind: AssetKind) => void;
  /** Bumped when palette slots change, so the thumbnails are drawn again. */
  slotsVersion: number;
  /** How a picture stands in the painter: not open, open, or the one on show; and whether it has unsaved changes. */
  stateOf: (asset: Asset) => { open: boolean; active: boolean; dirty: boolean };
  onOpen: (asset: Asset) => void;
  onMenu: (asset: Asset, x: number, y: number) => void;
}

const assetQuery = (asset: { kind: AssetKind; file: string }) => new URLSearchParams({ kind: asset.kind, file: asset.file });

export function ProjectPanel({ project, kind, onKind, slotsVersion, stateOf, onOpen, onMenu }: ProjectPanelProps) {
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
      <nav className="gbp-rail" aria-label="Asset folders">
        {ASSET_KINDS.map(([id, name]) => { const Icon = KIND_ICONS[id]; const count = project.assets.filter((asset) => asset.kind === id).length; return <button key={id} className={`icon-button ${kind === id ? "active-tool" : ""}`} aria-pressed={kind === id} aria-label={`${name} (${count})`} title={`${name} · ${count}`} onClick={() => onKind(id)}><Icon size={16} /><b>{count}</b></button>; })}
      </nav>
      <aside className="gbp-project" aria-label="GB Studio project">
        <h2 title={project.path}><span className="gbp-project-name">{project.name}</span></h2>
        <input type="search" className="gbp-filter" placeholder={`Filter ${label.toLowerCase()}`} aria-label={`Filter ${label.toLowerCase()} by name`} value={filter} onChange={(event) => setFilter(event.target.value)} />
        <div className="gbp-assets" role="list">
          {shown.map((asset) => {
            const state = stateOf(asset);
            return (
              <button key={asset.file} role="listitem" onContextMenu={(event) => { event.preventDefault(); onMenu(asset, event.clientX, event.clientY); }} className={`gbp-asset ${state.active ? "selected" : state.open ? "open" : ""}`} title={`${asset.file} · ${asset.width} × ${asset.height} px${state.open ? " · open" : ""}`} onClick={() => onOpen(asset)}>
                {sheet?.kind === asset.kind && sheet.cells.has(asset.file)
                  ? <SheetThumb sheet={sheet.image} cell={sheet.cells.get(asset.file)!} />
                  : !sheetFailed && sheet?.kind !== asset.kind ? <span className="gbp-asset-thumb" aria-hidden="true" />
                  : <img className="gbp-asset-thumb" loading="lazy" decoding="async" alt="" src={`${ASSET_URL}-preview?${assetQuery(asset)}&v=${Math.round(asset.mtime)}&pv=${PREVIEW_VERSION}&s=${slotsVersion}`} />}
                <span className="gbp-asset-meta"><span className={`gbp-asset-name ${state.dirty ? "gbp-unsaved" : ""}`}>{asset.name}{state.dirty ? " *" : ""}</span><span className="gbp-asset-size">{asset.width}×{asset.height}</span></span>
              </button>
            );
          })}
          {shown.length === 0 && <p className="gbp-note">No {label.toLowerCase()} {wanted ? "match" : "in this project"}.</p>}
        </div>
      </aside>
    </>
  );
}
