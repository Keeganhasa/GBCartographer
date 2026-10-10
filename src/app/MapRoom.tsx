/**
 * The Map Room: grids of screens for adventure-style maps. Each screen is an ordinary project background (160 × 144);
 * the layout is GB Cartographer's own, kept in the project's Cartographer/maps.json (server/maps.ts), which GB Studio
 * doesn't read.
 * A new screen next to others can start with their edge tiles, so neighbouring screens line up; edges that differ
 * show in amber and can be copied across. Writes go through the same endpoints as the painter (backups first).
 * The window is a kit Dialog: the maps on the left, the grid in the middle, the selected screen on the right.
 * New map opens the New map wizard (MapWizard.tsx) over it; this file writes what the wizard plans.
 */
import { Download, Map as MapIcon, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { countUniqueTiles, gbStudioShade } from "../paint";
import { Button, Checkbox, Chip, Dialog, Field, Meter, Segmented, Select } from "../ui/kit";
import { PxSnake } from "../ui/setIcons";
import { copyEdge, edgeMatch, OFFSET, OPPOSITE, SIDES, type Picture, type Side } from "./mapEdges";
import { MapWizard, type MapPlan } from "./MapWizard";
import type { Asset, Project } from "./model";
import "./MapRoom.css";

interface MapCell { x: number; y: number; file: string }
interface MapLayout { id: string; name: string; screen: { width: number; height: number }; overlap?: number; cells: MapCell[] }
interface Loaded { picture: Picture; preview: HTMLImageElement }

const W = 160, H = 144;
const SIDE_NAMES: Record<Side, string> = { north: "North", south: "South", east: "East", west: "West" };
const query = (file: string) => new URLSearchParams({ kind: "backgrounds", file });
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

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

/** Unique 8 × 8 tiles in a screen (GB Studio's count, in shades). */
function tilesOf(picture: Picture) {
  const shades = Uint8Array.from({ length: picture.width * picture.height }, (_, at) => picture.rgba[at * 4 + 3] < 128 ? 4 : gbStudioShade(picture.rgba[at * 4 + 1]));
  return countUniqueTiles(shades, picture.width, picture.height, false);
}

export function MapRoom({ project, onClose, onOpen, onProjectChanged, onExport, say }: { project: Project; onClose: () => void; onOpen: (asset: Asset) => void; onProjectChanged: () => Promise<void>; onExport: (blob: Blob, name: string) => Promise<boolean>; say: (text: string) => void }) {
  const [maps, setMaps] = useState<MapLayout[] | null>(null);
  const [mapId, setMapId] = useState("");
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [adding, setAdding] = useState<{ x: number; y: number } | null>(null);
  // The New map wizard is open.
  const [making, setMaking] = useState(false);
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

  async function save(next: MapLayout[]): Promise<boolean> {
    const response = await fetch("./__cartographer/maps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maps: next }) });
    const result = await response.json() as { ok?: boolean; error?: string; maps?: MapLayout[] };
    if (!response.ok || !result.maps) { say(`Could not keep the map: ${result.error ?? response.statusText}`); return false; }
    setMaps(result.maps);
    return true;
  }
  const updateMap = (change: (layout: MapLayout) => MapLayout) => map && maps && void save(maps.map((item) => item.id === map.id ? change(item) : item));

  /**
   * Makes the map the wizard planned: each new screen as a new PNG (one at a time, never replacing a file), then the
   * layout. If a PNG can't be made, the layout keeps the screens made before it, so no new file is left off the map.
   */
  async function newMap(plan: MapPlan, progress: (done: number, of: number) => void) {
    if (!maps) return;
    const cells: MapCell[] = [];
    const fresh = plan.cells.filter((cell) => !cell.existing).length;
    let failed = "", made = 0;
    for (const cell of plan.cells) {
      if (cell.existing) { cells.push({ x: cell.x, y: cell.y, file: cell.existing }); continue; }
      const response = await fetch(`./__cartographer/gbstudio-new-asset?${new URLSearchParams({ kind: "backgrounds", name: cell.name! })}`, { method: "POST", body: await toBlob(cell.picture ?? blankScreen()) });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; file?: string };
      if (!response.ok || !result.file) { failed = `Could not make ${cell.name}.png: ${result.error ?? response.statusText}.`; break; }
      cells.push({ x: cell.x, y: cell.y, file: result.file });
      progress(made += 1, fresh);
    }
    // No PNG written: stay in the wizard so the names can be changed.
    if (failed && !made) return say(failed);
    const id = `map-${Date.now().toString(36)}`;
    const kept = await save([...maps, { id, name: plan.name, screen: { width: W, height: H }, overlap: plan.overlap, cells }]);
    if (made) await onProjectChanged();
    setMaking(false);
    if (!kept) return;
    setMapId(id);
    setSelected(null);
    // An empty map starts its first screen, as before.
    setAdding(cells.length ? null : { x: 0, y: 0 });
    say(failed ? `${failed} The map ${plan.name} keeps the ${plural(cells.length, "screen")} made before it.`
      : `Made the map ${plan.name}: ${plural(cells.length, "screen")}${made ? `, ${made} new in assets/backgrounds/` : ""}.`);
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

  const pickMap = (id: string) => { setMapId(id); setSelected(null); setAdding(null); };
  const openCell = (cell: MapCell) => { const asset = assetOf(cell.file); if (asset) { onOpen(asset); onClose(); } };

  // The head: overlap and zoom; the foot: the legend, then the map's own actions.
  const headExtra = map && (
    <>
      <span className="k-row" title="How many tile columns or rows neighbouring screens share at each edge">
        <span className="k-muted k-small">Edge overlap</span>
        <Segmented size="sm" label="Edge overlap" value={String(overlap) as "1" | "2"} onChange={(value) => updateMap((item) => ({ ...item, overlap: Number(value) }))} options={[{ value: "1", label: "1 tile" }, { value: "2", label: "2 tiles" }]} />
      </span>
      <Segmented size="sm" label="Zoom" value={String(zoom) as "1" | "2"} onChange={(value) => setZoom(Number(value))} options={[{ value: "1", label: "1×" }, { value: "2", label: "2×" }]} />
    </>
  );
  const footer = (
    <>
      {map ? <span className="k-muted k-small mr-legend"><i className="match" /> edge matches · <i className="differ" /> edge differs · click a screen to select, double-click to paint it</span>
        : <span className="k-muted k-small">Each screen stays a normal background PNG.</span>}
      <span className="k-spacer" />
      {map && <Button variant="danger" icon={<Trash2 />} title="Only the layout goes; every PNG stays in the project" onClick={() => { if (window.confirm(`Delete the map ${map.name}? Only the layout goes; every PNG stays in the project.`)) { void save(maps.filter((item) => item.id !== map.id)); setMapId(""); } }}>Delete this map</Button>}
      <Button icon={<Download />} disabled={!cells.length} title="The whole map as one PNG, in its palettes" onClick={() => void exportMap()}>Export map PNG</Button>
    </>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} wide tall icon={<MapIcon size={18} />} title="Map Room"
      sub={map ? `${map.name} · ${plural(cells.length, "screen")} · each 160 × 144 px (20 × 18 tiles)` : "Grids of screens, each a background"}
      headExtra={headExtra} footer={footer}>
      <div className="mr-room">
        <nav className="mr-maps" aria-label="Maps">
          <span className="k-eyebrow mr-maps-head">Maps</span>
          <div className="mr-list">
            {maps.map((item) => (
              <button key={item.id} type="button" className="mr-row" aria-pressed={item.id === map?.id} onClick={() => pickMap(item.id)}>
                <b>{item.name}</b><span className="k-muted k-xs">{plural(item.cells.length, "screen")}</span>
              </button>
            ))}
            <button type="button" className="mr-row mr-row--new" aria-pressed={making} onClick={() => setMaking(true)}>
              <b><Plus size={12} /> New map</b><span className="k-muted k-xs">a grid of screens</span>
            </button>
          </div>
          <p className="k-muted k-xs mr-maps-note">A map is GB Cartographer's own layout, saved in the project's Cartographer folder (GB Studio doesn't read it); each screen stays a normal background PNG.</p>
        </nav>

        <section className="k-well mr-grid" aria-label="Screens">
          {!map ? (
            <div className="mr-empty"><span className="mr-mascot"><PxSnake size={48} /></span><span className="k-muted">Make a map to start: New map on the left.</span></div>
          ) : (
            <div className="mr-cells" style={{ gridTemplateColumns: `repeat(${maxX - minX + 1}, ${W * zoom}px)`, gridAutoRows: `${H * zoom}px` }}>
              {Array.from({ length: (maxY - minY + 1) * (maxX - minX + 1) }, (_, at) => {
                const x = minX + (at % (maxX - minX + 1)), y = minY + Math.floor(at / (maxX - minX + 1));
                const cell = cellAt(x, y);
                if (cell) {
                  const isSelected = selected?.x === x && selected?.y === y;
                  return (
                    <button key={`${x},${y}`} type="button" className="mr-cell" aria-pressed={isSelected} onClick={() => { setSelected({ x, y }); setAdding(null); }} onDoubleClick={() => openCell(cell)}>
                      {pictureOf(cell.file) ? <img src={pictureOf(cell.file)!.preview.src} alt="" /> : <span className="k-muted k-small">{assetOf(cell.file) ? "…" : "missing"}</span>}
                      <span className="mr-label">{assetOf(cell.file)?.name ?? cell.file} · {x}, {y}</span>
                      {isSelected && edges.map(({ side, result }) => <i key={side} className={`mr-edge ${side} ${result && result.match === result.total ? "match" : "differ"}`} />)}
                    </button>
                  );
                }
                return nearCell(x, y)
                  ? <button key={`${x},${y}`} type="button" className="mr-add" aria-pressed={adding?.x === x && adding?.y === y} title={`Add a screen at ${x}, ${y}`} onClick={() => { setAdding({ x, y }); setSelected(null); }}><Plus size={20} /></button>
                  : <span key={`${x},${y}`} />;
              })}
            </div>
          )}
        </section>

        <aside className="mr-side" aria-label="Screen">
          {map && adding ? (
            <AddScreen key={`${map.id}|${adding.x},${adding.y}`} map={map} at={adding} backgrounds={backgrounds} neighbours={SIDES.flatMap((side) => { const cell = cellAt(adding.x + OFFSET[side][0], adding.y + OFFSET[side][1]); return cell ? [{ side, cell }] : []; })} pictureOf={pictureOf} assetOf={assetOf} overlap={overlap} busy={busy}
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
            <div className="k-stack">
              <span className="k-eyebrow">Screen at {selectedCell.x}, {selectedCell.y}</span>
              {pictureOf(selectedCell.file) && <img className="mr-thumb" src={pictureOf(selectedCell.file)!.preview.src} alt="" />}
              <div className="k-stack" style={{ gap: 2 }}>
                <b>{assetOf(selectedCell.file)?.name ?? selectedCell.file}</b>
                <span className="k-muted k-small k-mono mr-path">assets/backgrounds/{selectedCell.file}</span>
              </div>
              {pictureOf(selectedCell.file) && (() => { const tiles = tilesOf(pictureOf(selectedCell.file)!.picture); return <Meter label="Tiles" value={tiles} of={192} tone={tiles > 192 ? "bad" : tiles > 180 ? "warn" : undefined} title="Unique tiles against the 192 a background can have" />; })()}
              <div className="k-row">
                <Button variant="primary" disabled={!assetOf(selectedCell.file)} onClick={() => openCell(selectedCell)}>Open in painter</Button>
                <span className="k-spacer" />
                <Button variant="danger" icon={<Trash2 />} title="Takes it off the map; the PNG stays in the project" onClick={() => { updateMap((item) => ({ ...item, cells: item.cells.filter((cell) => !(cell.x === selectedCell.x && cell.y === selectedCell.y)) })); setSelected(null); }}>Remove from map</Button>
              </div>
              <p className="k-hint mr-p">Remove from map changes only the layout; the PNG stays in the project.</p>
              <Field label="Swap background">
                <Select label="Swap background" value="" placeholder="Swap background…" onChange={(file) => { if (file) updateMap((item) => ({ ...item, cells: item.cells.map((cell) => cell.x === selectedCell.x && cell.y === selectedCell.y ? { ...cell, file } : cell) })); }}
                  options={backgrounds.map((asset) => ({ value: asset.file, label: asset.name }))} />
              </Field>
              <hr className="k-divider" />
              <span className="k-eyebrow">Edges</span>
              {!edges.length && <p className="k-muted k-small mr-p">No neighbours yet.</p>}
              {edges.map(({ side, neighbour, result }) => (
                <div key={side} className="k-card mr-edge-card">
                  <div className="k-row">
                    <b>{SIDE_NAMES[side]}</b>
                    <span className="k-muted k-small mr-ellipsis">{assetOf(neighbour.file)?.name ?? neighbour.file}</span>
                    <span className="k-spacer" />
                    {result ? <Chip tone={result.match === result.total ? "acc" : "warn"}>{result.match === result.total ? `${result.total} / ${result.total} match` : `${result.total - result.match} differ`}</Chip> : <Chip>…</Chip>}
                  </div>
                  <div className="k-row mr-edge-actions">
                    <Button size="sm" disabled={busy || !result || result.match === result.total} onClick={() => void copyAcross(side, true)}>Copy mine → neighbour</Button>
                    <Button size="sm" disabled={busy || !result || result.match === result.total} onClick={() => void copyAcross(side, false)}>Copy neighbour's → mine</Button>
                  </div>
                </div>
              ))}
            </div>
          ) : map ? (
            <p className="k-muted k-small mr-p">Click a screen to see how its edges meet its neighbours, or a + to add a screen there.</p>
          ) : null}
        </aside>
      </div>
      {/* Rendered inside the Map Room's dialog so it stacks over it (a nested Radix dialog: Esc closes only it). */}
      {making && <MapWizard suggestedName={maps.length ? `Map ${maps.length + 1}` : "Overworld"} backgrounds={backgrounds} onCancel={() => setMaking(false)} onCreate={newMap} />}
    </Dialog>
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

  const starts = [
    { value: "blank" as const, label: "Blank", title: "A new blank background" },
    ...neighbours.length > 0 ? [{ value: "copy" as const, label: "Neighbour", title: "A copy of a neighbour" }] : [],
    { value: "existing" as const, label: "In the project", title: "A background already in the project" },
  ];

  return (
    <div className="k-stack">
      <span className="k-eyebrow">Add screen at {at.x}, {at.y}</span>
      <div className="k-field">
        <span className="k-label">Start from</span>
        <Segmented fill size="sm" label="Start from" value={start} onChange={setStart} options={starts} />
        <span className="k-hint">{starts.find((item) => item.value === start)?.title}</span>
      </div>
      {start === "copy" && <Field label="Copy of">
        <Select label="Copy of" value={copyFrom} onChange={setCopyFrom} options={neighbours.map(({ side, cell }) => ({ value: cell.file, label: `${assetOf(cell.file)?.name ?? cell.file} (${side})` }))} />
      </Field>}
      {start === "existing" && <Field label="Background">
        <Select label="Background" value={existing} onChange={setExisting} placeholder="No backgrounds" options={backgrounds.map((asset) => ({ value: asset.file, label: asset.name }))} />
      </Field>}
      {start !== "existing" && neighbours.length > 0 && (
        <div className="k-field">
          <span className="k-label">Copy border tiles from ({overlap} tile{overlap === 1 ? "" : "s"} deep)</span>
          {neighbours.map(({ side, cell }) => <Checkbox key={side} checked={sides.includes(side)} onChange={(checked) => setSides(checked ? [...sides, side] : sides.filter((item) => item !== side))}>{SIDE_NAMES[side]} · {assetOf(cell.file)?.name ?? cell.file}'s {SIDE_NAMES[OPPOSITE[side]].toLowerCase()} edge</Checkbox>)}
        </div>
      )}
      {preview && <img className="mr-thumb" src={preview} alt="The new screen" />}
      {start !== "existing" && <Field label="File name" hint={`Writes one new file: assets/backgrounds/${name.trim().replace(/\.png$/i, "")}.png (blank parts in the lightest green; GB Studio adds its settings when it next reads the project).`}>
        <input className="k-input" type="text" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>}
      <div className="k-row">
        <span className="k-spacer" />
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={!ready || busy} onClick={() => void onCreate(start === "existing" ? { name, existing } : { name: name.trim(), picture: picture! })}>{start === "existing" ? "Place it" : "Create"}</Button>
      </div>
    </div>
  );
}
