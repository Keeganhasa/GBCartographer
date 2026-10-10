/**
 * The Map Room: grids of screens for Zelda-style maps. Each screen is an ordinary project background (160 × 144);
 * the layout is GB Cartographer's own, kept in the project's Cartographer/maps.json (server/maps.ts), which GB Studio
 * doesn't read.
 * A new screen next to others can start with their edge tiles, so neighbouring screens line up; edges that differ
 * show in amber and can be copied across. Writes go through the same endpoints as the painter (backups first).
 */
import { Download, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { countUniqueTiles, gbStudioShade } from "../paint";
import { copyEdge, edgeMatch, OFFSET, OPPOSITE, SIDES, type Picture, type Side } from "./mapEdges";
import type { Asset, Project } from "./model";

interface MapCell { x: number; y: number; file: string }
interface MapLayout { id: string; name: string; screen: { width: number; height: number }; overlap?: number; cells: MapCell[] }
interface Loaded { picture: Picture; preview: HTMLImageElement }

const W = 160, H = 144;
const SIDE_NAMES: Record<Side, string> = { north: "North", south: "South", east: "East", west: "West" };
const query = (file: string) => new URLSearchParams({ kind: "backgrounds", file });

async function loadPicture(asset: Asset): Promise<Loaded> {
  const blob = await fetch(`./__cartographer/gbstudio-asset?${query(asset.file)}&t=${Math.round(asset.mtime)}`, { cache: "no-cache" }).then((response) => response.blob());
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const canvas = document.createElement("canvas");
  Object.assign(canvas, { width: bitmap.width, height: bitmap.height });
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0);
  const preview = new Image();
  await new Promise((resolve) => { preview.onload = preview.onerror = resolve; preview.src = `./__cartographer/gbstudio-asset-preview?${query(asset.file)}&v=${Math.round(asset.mtime)}&pv=2`; });
  return { picture: { rgba: context.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height }, preview };
}

const toBlob = (picture: Picture) => new Promise<Blob>((resolve, reject) => {
  const canvas = document.createElement("canvas");
  Object.assign(canvas, { width: picture.width, height: picture.height });
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(picture.rgba), picture.width, picture.height), 0, 0);
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No PNG")), "image/png");
});

/** A screen of the lightest green. */
const blankScreen = (): Picture => ({ rgba: Uint8ClampedArray.from({ length: W * H * 4 }, (_, at) => [224, 248, 207, 255][at % 4]), width: W, height: H });
/** A copy cut or padded to one screen. */
function screenOf(source: Picture): Picture {
  const out = blankScreen();
  for (let y = 0; y < Math.min(H, source.height); y += 1) out.rgba.set(source.rgba.subarray(y * source.width * 4, (y * source.width + Math.min(W, source.width)) * 4), y * W * 4);
  return out;
}

export function MapRoom({ project, onClose, onOpen, onProjectChanged, onExport, say }: { project: Project; onClose: () => void; onOpen: (asset: Asset) => void; onProjectChanged: () => Promise<void>; onExport: (blob: Blob, name: string) => Promise<boolean>; say: (text: string) => void }) {
  const [maps, setMaps] = useState<MapLayout[] | null>(null);
  const [mapId, setMapId] = useState("");
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [adding, setAdding] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loaded, setLoaded] = useState(new Map<string, Loaded>());
  const [busy, setBusy] = useState(false);
  const backgrounds = useMemo(() => project.assets.filter((asset) => asset.kind === "backgrounds"), [project.assets]);
  const assetOf = (file: string) => backgrounds.find((asset) => asset.file === file);
  const map = maps?.find((item) => item.id === mapId) ?? maps?.[0] ?? null;
  const overlap = map?.overlap === 2 ? 2 : 1;
  const cellAt = (x: number, y: number) => map?.cells.find((cell) => cell.x === x && cell.y === y);

  useEffect(() => {
    void fetch("./__cartographer/maps", { cache: "no-cache" }).then((response) => response.json() as Promise<{ maps?: MapLayout[] }>).then((result) => { setMaps(result.maps ?? []); setMapId(result.maps?.[0]?.id ?? ""); });
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Each screen's picture, read again when its file changes (keyed by file and time).
  const keyOf = (file: string) => `${file}|${Math.round(assetOf(file)?.mtime ?? 0)}`;
  useEffect(() => {
    if (!map) return;
    let live = true;
    const missing = map.cells.filter((cell) => assetOf(cell.file) && !loaded.has(keyOf(cell.file)));
    if (!missing.length) return;
    void Promise.all(missing.map(async (cell) => [keyOf(cell.file), await loadPicture(assetOf(cell.file)!)] as const)).then((pairs) => {
      if (!live) return;
      setLoaded((current) => { const next = new Map(current); for (const [key, value] of pairs) next.set(key, value); return next; });
    }).catch(() => null);
    return () => { live = false; };
  }, [map, backgrounds]);
  const pictureOf = (file: string) => loaded.get(keyOf(file));

  async function save(next: MapLayout[]) {
    const response = await fetch("./__cartographer/maps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maps: next }) });
    const result = await response.json() as { ok?: boolean; error?: string; maps?: MapLayout[] };
    if (!response.ok || !result.maps) return say(`Could not keep the map: ${result.error ?? response.statusText}`);
    setMaps(result.maps);
  }
  const updateMap = (change: (layout: MapLayout) => MapLayout) => map && maps && void save(maps.map((item) => item.id === map.id ? change(item) : item));

  async function newMap() {
    const name = window.prompt("Name of the new map (e.g. Overworld):", maps?.length ? `Map ${maps.length + 1}` : "Overworld");
    if (!name?.trim() || !maps) return;
    const id = `map-${Date.now().toString(36)}`;
    await save([...maps, { id, name: name.trim(), screen: { width: W, height: H }, overlap: 1, cells: [] }]);
    setMapId(id);
    setSelected(null);
    setAdding({ x: 0, y: 0 });
  }

  /** Writes a screen's picture over its file (backup first; a file changed on disk asks first). */
  async function writeScreen(file: string, picture: Picture): Promise<boolean> {
    const asset = assetOf(file);
    if (!asset) return false;
    const blob = await toBlob(picture);
    const post = (force: boolean) => fetch(`./__cartographer/gbstudio-asset?${query(file)}&mtime=${asset.mtime}${force ? "&force=1" : ""}`, { method: "POST", body: blob });
    let response = await post(false);
    if (response.status === 409) {
      if (!window.confirm(`${asset.name} changed on disk since the Map Room read it. Replace it anyway?`)) return false;
      response = await post(true);
    }
    if (!response.ok) { say(`Could not write ${asset.name}: ${(await response.json().catch(() => ({ error: response.statusText })) as { error?: string }).error}`); return false; }
    return true;
  }

  /** Copies the shared edge between the selected screen and its neighbour on `side`, one way. */
  async function copyAcross(side: Side, toNeighbour: boolean) {
    if (!selected) return;
    const mine = cellAt(selected.x, selected.y), theirs = cellAt(selected.x + OFFSET[side][0], selected.y + OFFSET[side][1]);
    if (!mine || !theirs) return;
    const a = pictureOf(mine.file), b = pictureOf(theirs.file);
    if (!a || !b) return;
    const [fromCell, toCell, from, to, toSide] = toNeighbour ? [mine, theirs, a, b, OPPOSITE[side]] : [theirs, mine, b, a, side];
    if (!window.confirm(`Copy ${overlap} tile${overlap === 1 ? "" : "s"} of ${assetOf(fromCell.file)?.name}'s edge onto ${assetOf(toCell.file)?.name}? Its old file goes to Backups.`)) return;
    setBusy(true);
    const picture = { ...to.picture, rgba: new Uint8ClampedArray(to.picture.rgba) };
    copyEdge(from.picture, picture, toSide, overlap);
    if (await writeScreen(toCell.file, picture)) { await onProjectChanged(); say(`Copied the edge onto ${assetOf(toCell.file)?.name}.`); }
    setBusy(false);
  }

  if (!maps) return null;
  const cells = map?.cells ?? [];
  const xs = cells.map((cell) => cell.x), ys = cells.map((cell) => cell.y);
  const [minX, maxX, minY, maxY] = cells.length ? [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...ys) - 1, Math.max(...ys) + 1] : [0, 0, 0, 0];
  const nearCell = (x: number, y: number) => !cells.length ? x === 0 && y === 0 : SIDES.some((side) => cellAt(x + OFFSET[side][0], y + OFFSET[side][1]));
  const selectedCell = selected ? cellAt(selected.x, selected.y) : undefined;
  const edges = selectedCell ? SIDES.flatMap((side) => {
    const neighbour = cellAt(selectedCell.x + OFFSET[side][0], selectedCell.y + OFFSET[side][1]);
    if (!neighbour) return [];
    const a = pictureOf(selectedCell.file), b = pictureOf(neighbour.file);
    return [{ side, neighbour, result: a && b ? edgeMatch(a.picture, b.picture, side, overlap) : null }];
  }) : [];

  async function exportMap() {
    if (!map || !cells.length) return;
    const left = Math.min(...xs), top = Math.min(...ys);
    const canvas = document.createElement("canvas");
    Object.assign(canvas, { width: (Math.max(...xs) - left + 1) * W, height: (Math.max(...ys) - top + 1) * H });
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const cell of cells) { const image = pictureOf(cell.file)?.preview; if (image) context.drawImage(image, 0, 0, W, H, (cell.x - left) * W, (cell.y - top) * H, W, H); }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob && await onExport(blob, `${map.name}.png`)) say(`Exported ${map.name}.png (${canvas.width} × ${canvas.height})`);
  }

  return (
    <div className="gbp-modal-backdrop" onClick={onClose}>
      <div className="gbp-modal gbp-maproom" role="dialog" aria-label="Map Room" onClick={(event) => event.stopPropagation()}>
        <header className="gbp-modal-head">
          <h2>Map Room</h2>
          {map && <span className="gbp-note">{map.name} · {cells.length} screen{cells.length === 1 ? "" : "s"} · each 160 × 144 px (20 × 18 tiles)</span>}
          <span className="gbp-spacer" />
          {map && <label className="gbp-field gbp-inline" title="How many tile columns or rows neighbouring screens share at each edge">Edge overlap
            <select value={overlap} onChange={(event) => updateMap((item) => ({ ...item, overlap: Number(event.target.value) }))}><option value={1}>1 tile</option><option value={2}>2 tiles</option></select>
          </label>}
          <span className="gbp-seg" role="group" aria-label="Zoom">{[1, 2].map((step) => <button key={step} className={`quiet-button ${zoom === step ? "active-tool" : ""}`} onClick={() => setZoom(step)}>{step}×</button>)}</span>
          <button className="quiet-button" disabled={!cells.length} title="The whole map as one PNG, in its palettes" onClick={() => void exportMap()}><Download size={14} />Export map PNG</button>
          <button className="icon-button small" aria-label="Close" onClick={onClose}><X size={14} /></button>
        </header>
        <div className="gbp-maproom-body">
          <nav className="gbp-backup-files" aria-label="Maps">
            {maps.map((item) => <button key={item.id} className={item.id === map?.id ? "selected" : ""} onClick={() => { setMapId(item.id); setSelected(null); setAdding(null); }}><b>{item.name}</b><small>{item.cells.length} screen{item.cells.length === 1 ? "" : "s"}</small></button>)}
            <button className="gbp-backup-older" onClick={() => void newMap()}><b><Plus size={12} /> New map</b><small>a grid of screens</small></button>
            <p className="gbp-note">A map is GB Cartographer's own layout, saved in the project's Cartographer folder (GB Studio doesn't read it); each screen stays a normal background PNG.</p>
          </nav>
          <section className="gbp-maproom-grid">
            {!map ? <p className="gbp-note">Make a map to start: New map on the left.</p> : (
              <div className="gbp-maproom-cells" style={{ gridTemplateColumns: `repeat(${maxX - minX + 1}, ${W * zoom}px)`, gridAutoRows: `${H * zoom}px` }}>
                {Array.from({ length: (maxY - minY + 1) * (maxX - minX + 1) }, (_, at) => {
                  const x = minX + (at % (maxX - minX + 1)), y = minY + Math.floor(at / (maxX - minX + 1));
                  const cell = cellAt(x, y);
                  if (cell) {
                    const isSelected = selected?.x === x && selected?.y === y;
                    return (
                      <button key={`${x},${y}`} className={`gbp-maproom-cell ${isSelected ? "selected" : ""}`} onClick={() => { setSelected({ x, y }); setAdding(null); }} onDoubleClick={() => { const asset = assetOf(cell.file); if (asset) { onOpen(asset); onClose(); } }}>
                        {pictureOf(cell.file) ? <img src={pictureOf(cell.file)!.preview.src} alt="" /> : <span className="gbp-note">{assetOf(cell.file) ? "…" : "missing"}</span>}
                        <span className="gbp-maproom-label">{assetOf(cell.file)?.name ?? cell.file} · {x}, {y}</span>
                        {isSelected && edges.map(({ side, result }) => <i key={side} className={`gbp-maproom-edge ${side} ${result && result.match === result.total ? "match" : "differ"}`} />)}
                      </button>
                    );
                  }
                  return nearCell(x, y)
                    ? <button key={`${x},${y}`} className={`gbp-maproom-add ${adding?.x === x && adding?.y === y ? "selected" : ""}`} title={`Add a screen at ${x}, ${y}`} onClick={() => { setAdding({ x, y }); setSelected(null); }}><Plus size={20} /></button>
                    : <span key={`${x},${y}`} />;
                })}
              </div>
            )}
            {map && <p className="gbp-note gbp-maproom-legend"><i className="match" /> edge matches · <i className="differ" /> edge differs · click a screen to select, double-click to paint it</p>}
          </section>
          <aside className="gbp-maproom-side">
            {map && adding ? (
              <AddScreen map={map} at={adding} backgrounds={backgrounds} neighbours={SIDES.flatMap((side) => { const cell = cellAt(adding.x + OFFSET[side][0], adding.y + OFFSET[side][1]); return cell ? [{ side, cell }] : []; })} pictureOf={pictureOf} assetOf={assetOf} overlap={overlap} busy={busy}
                onCancel={() => setAdding(null)}
                onCreate={async (choice) => {
                  setBusy(true);
                  try {
                    let file = choice.existing;
                    if (!file) {
                      const response = await fetch(`./__cartographer/gbstudio-new-asset?${new URLSearchParams({ kind: "backgrounds", name: choice.name })}`, { method: "POST", body: await toBlob(choice.picture!) });
                      const result = await response.json() as { ok?: boolean; error?: string; file?: string };
                      if (!response.ok || !result.file) { say(`Could not make the screen: ${result.error ?? response.statusText}`); return; }
                      file = result.file;
                    }
                    updateMap((item) => ({ ...item, cells: [...item.cells.filter((cell) => !(cell.x === adding.x && cell.y === adding.y)), { x: adding.x, y: adding.y, file: file! }] }));
                    await onProjectChanged();
                    setSelected(adding);
                    setAdding(null);
                    say(choice.existing ? `${assetOf(file)?.name ?? file} is now at ${adding.x}, ${adding.y}.` : `Made assets/backgrounds/${file} at ${adding.x}, ${adding.y}.`);
                  } finally {
                    setBusy(false);
                  }
                }} />
            ) : map && selectedCell ? (
              <div className="gbp-form">
                {pictureOf(selectedCell.file) && <img className="gbp-maproom-thumb" src={pictureOf(selectedCell.file)!.preview.src} alt="" />}
                <dl className="gbp-maproom-facts">
                  <dt>Screen</dt><dd>{assetOf(selectedCell.file)?.name ?? selectedCell.file} · {selectedCell.x}, {selectedCell.y}</dd>
                  <dt>File</dt><dd>assets/backgrounds/{selectedCell.file}</dd>
                  {pictureOf(selectedCell.file) && <><dt>Tiles</dt><dd>{(() => { const p = pictureOf(selectedCell.file)!.picture; const shades = Uint8Array.from({ length: p.width * p.height }, (_, at) => p.rgba[at * 4 + 3] < 128 ? 4 : gbStudioShade(p.rgba[at * 4 + 1])); return countUniqueTiles(shades, p.width, p.height, false); })()} of 192</dd></>}
                </dl>
                <span className="eyebrow">Edges</span>
                {!edges.length && <p className="gbp-note">No neighbours yet.</p>}
                {edges.map(({ side, neighbour, result }) => (
                  <div key={side} className="gbp-maproom-edge-row">
                    <span><b>{SIDE_NAMES[side]}</b> · {assetOf(neighbour.file)?.name ?? neighbour.file}: {result ? (result.match === result.total ? `${result.total} / ${result.total} match` : `${result.total - result.match} differ`) : "…"}</span>
                    <span className="gbp-budget-actions">
                      <button className="quiet-button" disabled={busy || !result || result.match === result.total} onClick={() => void copyAcross(side, true)}>Copy mine → neighbour</button>
                      <button className="quiet-button" disabled={busy || !result || result.match === result.total} onClick={() => void copyAcross(side, false)}>Copy neighbour's → mine</button>
                    </span>
                  </div>
                ))}
                <span className="gbp-budget-actions">
                  <button className="quiet-button primary" disabled={!assetOf(selectedCell.file)} onClick={() => { onOpen(assetOf(selectedCell.file)!); onClose(); }}>Open in painter</button>
                  <select aria-label="Swap background" value="" onChange={(event) => { const file = event.target.value; if (file) updateMap((item) => ({ ...item, cells: item.cells.map((cell) => cell.x === selectedCell.x && cell.y === selectedCell.y ? { ...cell, file } : cell) })); }}>
                    <option value="">Swap background…</option>
                    {backgrounds.map((asset) => <option key={asset.file} value={asset.file}>{asset.name}</option>)}
                  </select>
                  <button className="quiet-button danger" title="Takes it off the map; the PNG stays in the project" onClick={() => { updateMap((item) => ({ ...item, cells: item.cells.filter((cell) => !(cell.x === selectedCell.x && cell.y === selectedCell.y)) })); setSelected(null); }}><Trash2 size={14} />Remove from map</button>
                </span>
                <p className="gbp-note">Remove from map changes only the layout; the PNG stays in the project.</p>
              </div>
            ) : map ? (
              <div className="gbp-form">
                <p className="gbp-note">Click a screen to see how its edges meet its neighbours, or a + to add a screen there.</p>
                <button className="quiet-button danger" onClick={() => { if (window.confirm(`Delete the map ${map.name}? Only the layout goes; every PNG stays in the project.`)) { void save(maps.filter((item) => item.id !== map.id)); setMapId(""); } }}><Trash2 size={14} />Delete this map</button>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

/** The Add screen panel: what the new screen starts from, which neighbours' edges it takes, and its file name. */
function AddScreen({ map, at, backgrounds, neighbours, pictureOf, assetOf, overlap, busy, onCancel, onCreate }: {
  map: MapLayout; at: { x: number; y: number }; backgrounds: Asset[]; neighbours: { side: Side; cell: MapCell }[];
  pictureOf: (file: string) => Loaded | undefined; assetOf: (file: string) => Asset | undefined; overlap: number; busy: boolean;
  onCancel: () => void; onCreate: (choice: { name: string; picture?: Picture; existing?: string }) => Promise<void>;
}) {
  const [start, setStart] = useState<"blank" | "copy" | "existing">("blank");
  const [copyFrom, setCopyFrom] = useState(neighbours[0]?.cell.file ?? "");
  const [existing, setExisting] = useState(backgrounds[0]?.file ?? "");
  const [sides, setSides] = useState<Side[]>(neighbours.map((item) => item.side));
  const slug = map.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "map";
  const [name, setName] = useState(`${slug}_${at.x}_${at.y}`.replace(/-/g, "m"));
  const ready = start === "existing" ? Boolean(existing) : /^[\w ()\-.]+$/.test(name.trim()) && (start === "blank" || Boolean(copyFrom && pictureOf(copyFrom)));

  const picture = useMemo(() => {
    if (start === "existing") return null;
    const base = start === "copy" && pictureOf(copyFrom) ? screenOf(pictureOf(copyFrom)!.picture) : blankScreen();
    for (const { side, cell } of neighbours) if (sides.includes(side) && pictureOf(cell.file)) copyEdge(pictureOf(cell.file)!.picture, base, side, overlap);
    return base;
  }, [start, copyFrom, sides, neighbours, overlap, pictureOf]);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!picture) return setPreview("");
    void toBlob(picture).then((blob) => { const url = URL.createObjectURL(blob); setPreview((old) => { if (old) URL.revokeObjectURL(old); return url; }); });
  }, [picture]);

  return (
    <div className="gbp-form">
      <span className="eyebrow">Add screen at {at.x}, {at.y}</span>
      <label className="gbp-field">Start from
        <select value={start} onChange={(event) => setStart(event.target.value as typeof start)}>
          <option value="blank">A new blank background</option>
          {neighbours.length > 0 && <option value="copy">A copy of a neighbour</option>}
          <option value="existing">A background already in the project</option>
        </select>
      </label>
      {start === "copy" && <label className="gbp-field">Copy of
        <select value={copyFrom} onChange={(event) => setCopyFrom(event.target.value)}>{neighbours.map(({ side, cell }) => <option key={side} value={cell.file}>{assetOf(cell.file)?.name ?? cell.file} ({side})</option>)}</select>
      </label>}
      {start === "existing" && <label className="gbp-field">Background
        <select value={existing} onChange={(event) => setExisting(event.target.value)}>{backgrounds.map((asset) => <option key={asset.file} value={asset.file}>{asset.name}</option>)}</select>
      </label>}
      {start !== "existing" && neighbours.length > 0 && (
        <div className="gbp-field">Copy border tiles from ({overlap} tile{overlap === 1 ? "" : "s"} deep)
          {neighbours.map(({ side, cell }) => <label key={side} className="gbp-check"><input type="checkbox" checked={sides.includes(side)} onChange={(event) => setSides(event.target.checked ? [...sides, side] : sides.filter((item) => item !== side))} />{SIDE_NAMES[side]} · {assetOf(cell.file)?.name ?? cell.file}'s {SIDE_NAMES[OPPOSITE[side]].toLowerCase()} edge</label>)}
        </div>
      )}
      {preview && <img className="gbp-maproom-thumb" src={preview} alt="The new screen" />}
      {start !== "existing" && <label className="gbp-field">File name
        <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
        <small className="gbp-note">Writes one new file: assets/backgrounds/{name.trim().replace(/\.png$/i, "")}.png (blank parts in the lightest green; GB Studio adds its settings when it next reads the project).</small>
      </label>}
      <span className="gbp-budget-actions">
        <button className="quiet-button" onClick={onCancel}>Cancel</button>
        <button className="quiet-button primary" disabled={!ready || busy} onClick={() => void onCreate(start === "existing" ? { name, existing } : { name: name.trim(), picture: picture! })}>{start === "existing" ? "Place it" : "Create"}</button>
      </span>
    </div>
  );
}
